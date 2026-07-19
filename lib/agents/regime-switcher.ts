/**
 * Regime Switcher — meta desk policy:
 *   calm   → desk-value overweight
 *   normal → follow Sentinel sharp_move (guarded momentum style)
 *   chaotic → flatten / stand down
 */
import {
  makeOrder,
  standDownDecision,
  TAKER_SELECTIONS,
  type Agent,
  type AgentContext,
  type Decision,
  type Order,
} from "@/lib/agents/types";
import { classifyRegime } from "@/lib/agents/regime";
import { deskEdge1x2Orders, flatten1x2Orders } from "@/lib/agents/desk-edge";
import { selId } from "@/lib/market/ids";
import { clamp, deltaToOrder, MIN_TRADE, obsProb } from "@/lib/agents/util";
import { DESK_WEIGHTS } from "@/lib/desk/weights";

const MOM_DECAY = 0.72;

export class RegimeSwitcherAgent implements Agent {
  readonly id = "regime_switcher";
  readonly name = "Regime Switcher";
  readonly kind = "meta_desk";
  readonly blurb =
    "Meta desk: Value in calm, Guarded Momentum in normal, flat in chaotic.";
  readonly mode = "taker" as const;

  private momTarget = new Map<string, number>();

  reset() {
    this.momTarget.clear();
  }

  onTick(ctx: AgentContext): Decision {
    const { tick, cfg, desk, assessment } = ctx;
    if (ctx.readiness && !ctx.readiness.ready) {
      return standDownDecision(this.id, tick, ctx.readiness.reasons);
    }

    const regime = classifyRegime(desk?.path, cfg);

    if (regime === "chaotic") {
      this.momTarget.clear();
      const orders = flatten1x2Orders(this.id, ctx);
      return {
        agentId: this.id,
        seq: tick.seq,
        tsMs: tick.tsMs,
        orders,
        quotes: [],
        rationale: orders.length
          ? `CHAOTIC · flatten · path vol high`
          : `CHAOTIC · flat`,
        kind: orders.length ? "trade" : "stand_down",
        stoodDown: orders.length === 0,
        drivingInputs: { sentinelKind: "regime_chaotic" },
      };
    }

    const model = desk?.model;
    if (!model?.ready) {
      return standDownDecision(this.id, tick, ["desk model not ready"]);
    }

    if (regime === "calm") {
      this.momTarget.clear();
      const edgeTh = Math.max(cfg.strategy.valueEdge * 0.9, DESK_WEIGHTS.modelEdgeFloor);
      const orders = deskEdge1x2Orders({
        agentId: this.id,
        ctx,
        model,
        edgeTh,
        sizeMult: 1.2,
        tag: "calm→value",
        maxClamp: 3,
      });
      return {
        agentId: this.id,
        seq: tick.seq,
        tsMs: tick.tsMs,
        orders,
        quotes: [],
        rationale: orders.length
          ? orders.map((o) => o.rationale).join("; ")
          : "CALM · value mode · no edge",
        kind: orders.length ? "trade" : "hold",
        drivingInputs: { sentinelKind: "regime_calm", hybridProb: model.fairHome },
      };
    }

    // normal → Value core + Guarded Momentum overlay on sharp moves
    if (assessment.quality < cfg.strategy.guardQuality) {
      this.momTarget.clear();
      const edgeTh = Math.max(cfg.strategy.valueEdge, DESK_WEIGHTS.modelEdgeFloor);
      const orders = deskEdge1x2Orders({
        agentId: this.id,
        ctx,
        model,
        edgeTh,
        sizeMult: 0.75,
        tag: "normal→value (quality soft)",
        maxClamp: 2.2,
      });
      return {
        agentId: this.id,
        seq: tick.seq,
        tsMs: tick.tsMs,
        orders,
        quotes: [],
        rationale: orders.length
          ? orders.map((o) => o.rationale).join("; ")
          : `NORMAL · quality ${assessment.quality} · value soft only`,
        kind: orders.length ? "trade" : "hold",
        drivingInputs: { sentinelKind: "quality_soft", hybridProb: model.fairHome },
      };
    }

    for (const [k, v] of this.momTarget) {
      const nv = v * MOM_DECAY;
      if (Math.abs(nv) < 1) this.momTarget.delete(k);
      else this.momTarget.set(k, nv);
    }

    const base = cfg.execution.baseSize;
    const signalIds: string[] = [];
    for (const sig of assessment.signals) {
      if (sig.kind !== "sharp_move" || !sig.selId) continue;
      if ((sig.confidence ?? 0) < cfg.strategy.momentumMinConfidence) continue;
      const sel = TAKER_SELECTIONS.find((s) => selId(s.marketType, s.key) === sig.selId);
      if (!sel || sel.marketType !== "match_result") continue;
      const ret = sig.evidence.ret ?? 0;
      const dir = ret >= 0 ? 1 : -1;
      const mag = clamp(Math.abs(ret) / 0.03, 0.7, 1.5) * clamp(sig.confidence, 0.5, 1);
      this.momTarget.set(sig.selId, clamp(dir * base * 0.55 * mag, -base * 1.2, base * 1.2));
      signalIds.push(sig.id);
    }

    const edgeTh = Math.max(cfg.strategy.valueEdge, DESK_WEIGHTS.modelEdgeFloor);
    const valueOrders = deskEdge1x2Orders({
      agentId: this.id,
      ctx,
      model,
      edgeTh,
      sizeMult: 0.9,
      tag: "normal→value",
      maxClamp: 2.5,
    });

    // Merge momentum deltas on top of value targets via additional orders toward momTarget.
    const momOrders: Order[] = [];
    for (const s of TAKER_SELECTIONS) {
      if (s.marketType !== "match_result") continue;
      const id = selId(s.marketType, s.key);
      const momDesired = this.momTarget.get(id);
      if (momDesired == null || Math.abs(momDesired) < 1) continue;
      const price = obsProb(tick, s.marketType, s.key);
      if (price == null) continue;
      // Nudge current inventory toward value+mom blend.
      const valueOrder = valueOrders.find((o) => o.selId === id);
      const afterValue =
        ctx.book.net(id) +
        (valueOrder ? (valueOrder.side === "buy" ? valueOrder.size : -valueOrder.size) : 0);
      const blend = afterValue * 0.7 + momDesired * 0.3;
      const d = deltaToOrder(afterValue, blend, MIN_TRADE);
      if (!d) continue;
      momOrders.push(
        makeOrder(
          this.id,
          tick,
          s.marketType,
          s.key,
          id,
          d.side,
          price,
          d.size,
          `${d.side} ${d.size} ${s.key}: normal→momentum overlay`,
        ),
      );
    }

    const orders = [...valueOrders, ...momOrders];
    return {
      agentId: this.id,
      seq: tick.seq,
      tsMs: tick.tsMs,
      orders,
      quotes: [],
      rationale: orders.length
        ? orders.map((o) => o.rationale).join("; ")
        : "NORMAL · value+momentum · no trigger",
      kind: orders.length ? "trade" : "hold",
      signalIds,
      drivingInputs: { sentinelKind: "regime_normal", hybridProb: model.fairHome },
    };
  }
}
