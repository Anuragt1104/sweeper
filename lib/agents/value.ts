/**
 * Value agent — trades desk-model fair vs observed 1X2.
 * Does not use privileged simulation reference as fair.
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
import { classifyRegime, regimeBlocksDirectional } from "@/lib/agents/regime";
import { selId } from "@/lib/market/ids";
import { clamp, deltaToOrder, MIN_TRADE, obsProb } from "@/lib/agents/util";
import { DESK_WEIGHTS } from "@/lib/desk/weights";

export class ValueAgent implements Agent {
  readonly id = "value";
  readonly name = "Value";
  readonly kind = "value";
  readonly blurb = "Trades desk-v1 fair vs observed; path-aware sizing.";
  readonly mode = "taker" as const;

  reset() {}

  onTick(ctx: AgentContext): Decision {
    const { tick, cfg, desk } = ctx;
    if (ctx.readiness && !ctx.readiness.ready) {
      return standDownDecision(this.id, tick, ctx.readiness.reasons);
    }
    const model = desk?.model;
    if (!model?.ready) {
      return standDownDecision(this.id, tick, ["desk model not ready"]);
    }
    const regimeBlock = regimeBlocksDirectional(desk?.path, cfg);
    if (regimeBlock) return standDownDecision(this.id, tick, [regimeBlock]);

    const edgeTh = Math.max(cfg.strategy.valueEdge, DESK_WEIGHTS.modelEdgeFloor);
    const base = cfg.execution.baseSize;
    const regime = classifyRegime(desk?.path, cfg);
    const calmBump = regime === "calm" ? 1.15 : 1;
    const orders: Order[] = [];

    for (const s of TAKER_SELECTIONS) {
      if (s.marketType !== "match_result") continue;
      const obs = obsProb(tick, s.marketType, s.key);
      if (obs == null) continue;
      const fair =
        s.key === "home"
          ? model.fair1x2.home
          : s.key === "away"
            ? model.fair1x2.away
            : model.fair1x2.draw;
      const id = selId(s.marketType, s.key);
      const edge = fair - obs;
      const cur = ctx.book.net(id);

      let pathMult = 1;
      if (s.key === "home" && (desk?.path?.homeRet5 ?? 0) < -0.03 && edge > 0) pathMult = 0.55;
      if (s.key === "home" && (desk?.path?.homeRet5 ?? 0) > 0.03 && edge < 0) pathMult = 0.55;
      if (s.key === "away" && (desk?.path?.homeRet5 ?? 0) > 0.03 && edge > 0) pathMult = 0.55;

      let desired: number;
      if (Math.abs(edge) >= edgeTh) {
        desired =
          Math.sign(edge) *
          base *
          calmBump *
          pathMult *
          clamp(Math.abs(edge) / edgeTh, 1, 3);
      } else if (Math.abs(edge) < edgeTh * 0.35) {
        desired = 0;
      } else {
        desired = cur;
      }

      const d = deltaToOrder(cur, desired, MIN_TRADE);
      if (!d) continue;
      orders.push(
        makeOrder(
          this.id,
          tick,
          s.marketType,
          s.key,
          id,
          d.side,
          obs,
          d.size,
          `${d.side} ${d.size} ${s.key}: desk edge ${(edge * 100).toFixed(1)}pp (fair ${(fair * 100).toFixed(0)}% vs ${(obs * 100).toFixed(0)}%)`,
        ),
      );
    }

    return {
      agentId: this.id,
      seq: tick.seq,
      tsMs: tick.tsMs,
      orders,
      quotes: [],
      rationale: orders.length ? orders.map((o) => o.rationale).join("; ") : "No desk edge",
      kind: orders.length ? "trade" : "hold",
      drivingInputs: {
        hybridProb: model.fairHome,
        sentinelKind: regime !== "normal" ? regime : null,
      },
    };
  }
}
