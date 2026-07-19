/**
 * Momentum agent — chases large moves, holding a decaying target.
 *
 * Two instances run side by side in the arena to make the sentinel's value
 * concrete:
 *   - NAIVE   acts on *any* large standardized move it sees in the features,
 *     so it chases bad outlier prints and gets chopped up.
 *   - GUARDED acts only on moves the Sentinel has classified as a genuine
 *     `sharp_move` (event-corroborated) and stands down when market quality is
 *     poor — so it trades the real repricings and ignores the fakes.
 *
 * Same feed, same parameters; the only difference is whether the agent listens
 * to the sentinel. That is the whole thesis of the product, runnable as an A/B.
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
import { selId } from "@/lib/market/ids";
import { clamp, deltaToOrder, MIN_TRADE, obsProb, retOf, samplesOf, zOf } from "@/lib/agents/util";
import { regimeBlocksDirectional } from "@/lib/agents/regime";

const DECAY = 0.72;
const CAP_MULT = 2;

export class MomentumAgent implements Agent {
  readonly id: string;
  readonly name: string;
  readonly kind = "momentum";
  readonly blurb: string;
  readonly mode = "taker" as const;
  private guarded: boolean;
  private target = new Map<string, number>();

  constructor(guarded: boolean) {
    this.guarded = guarded;
    this.id = guarded ? "momentum_guarded" : "momentum_naive";
    this.name = guarded ? "Guarded Momentum" : "Naive Momentum";
    this.blurb = guarded
      ? "Trades only sentinel-confirmed sharp moves; ignores outlier prints and stands down on low quality."
      : "Chases every large move in the feed, including bad prints. The cautionary baseline.";
  }

  reset() {
    this.target.clear();
  }

  onTick(ctx: AgentContext): Decision {
    const { tick, cfg, assessment, features } = ctx;
    if (ctx.readiness && !ctx.readiness.ready) {
      return {
        ...standDownDecision(this.id, tick, ctx.readiness.reasons),
        kind: "stand_down",
      };
    }
    // Regime gate is a desk discipline — only the guarded twin listens.
    // Naive keeps chasing so the Sentinel A/B stays honest.
    let forceFlat = false;
    if (this.guarded) {
      const regimeBlock = regimeBlocksDirectional(ctx.desk?.path, cfg);
      if (regimeBlock) {
        this.target.clear();
        forceFlat = true;
        const orders = flattenOrders(this.id, ctx);
        return {
          agentId: this.id,
          seq: tick.seq,
          tsMs: tick.tsMs,
          orders,
          quotes: [],
          rationale: orders.length
            ? `Flatten · ${regimeBlock}`
            : `Stood down: ${regimeBlock}`,
          kind: orders.length ? "trade" : "stand_down",
          stoodDown: true,
          drivingInputs: { sentinelKind: "regime" },
        };
      }
    }
    const base = cfg.execution.baseSize;
    const cap = base * CAP_MULT;
    const signalIds: string[] = [];

    // decay existing targets toward flat
    for (const [k, v] of this.target) {
      const nv = v * DECAY;
      if (Math.abs(nv) < 1) this.target.delete(k);
      else this.target.set(k, nv);
    }

    const standDown = this.guarded && assessment.quality < cfg.strategy.guardQuality;
    if (standDown) {
      // True stand-down: clear targets and only flatten residual inventory.
      this.target.clear();
      forceFlat = true;
    }

    if (!standDown) {
      if (this.guarded) {
        // only sentinel-confirmed sharp moves
        for (const sig of assessment.signals) {
          if (sig.kind !== "sharp_move" || !sig.selId) continue;
          if (sig.confidence < cfg.strategy.momentumMinConfidence) continue;
          if (!TAKER_SELECTIONS.some((s) => selId(s.marketType, s.key) === sig.selId)) continue;
          const dir = (sig.evidence.ret ?? 0) > 0 ? 1 : -1;
          let pathMult = 1;
          const homeRet = ctx.desk?.path?.homeRet5 ?? 0;
          if (sig.selId.includes("home") && dir > 0 && homeRet < -0.02) pathMult = 0.65;
          if (sig.selId.includes("home") && dir < 0 && homeRet > 0.02) pathMult = 0.65;
          this.target.set(
            sig.selId,
            clamp(dir * base * sig.confidence * pathMult, -cap, cap),
          );
          signalIds.push(sig.id);
        }
      } else {
        for (const s of TAKER_SELECTIONS) {
          if (samplesOf(features, s.marketType, s.key) < 4) continue;
          const z = zOf(features, s.marketType, s.key);
          const ret = retOf(features, s.marketType, s.key);
          if (Math.abs(z) < cfg.sentinel.sharpZ || Math.abs(ret) < cfg.sentinel.minReturn) continue;
          const conf = clamp(0.5 + (Math.abs(z) - cfg.sentinel.sharpZ) / 6, 0.5, 1);
          this.target.set(selId(s.marketType, s.key), clamp(Math.sign(ret) * base * conf, -cap, cap));
        }
      }
    }

    const orders: Order[] = [];
    for (const s of TAKER_SELECTIONS) {
      const id = selId(s.marketType, s.key);
      const desired = forceFlat ? 0 : (this.target.get(id) ?? 0);
      const price = obsProb(tick, s.marketType, s.key);
      if (price == null) continue;
      const d = deltaToOrder(ctx.book.net(id), desired, MIN_TRADE);
      if (!d) continue;
      // While stood down, only allow flatten (desired=0); never open/increase.
      if (forceFlat && desired !== 0) continue;
      const sigNote =
        this.guarded && signalIds.length
          ? ` · sentinel ${signalIds[0]}`
          : "";
      orders.push(
        makeOrder(
          this.id,
          tick,
          s.marketType,
          s.key,
          id,
          d.side,
          price,
          d.size,
          forceFlat
            ? `${d.side} ${d.size} ${s.key}: flatten (stand-down)`
            : `${d.side} ${d.size} ${s.key} → target ${Math.round(desired)} (momentum${sigNote})`,
        ),
      );
    }

    const rationale = standDown
      ? orders.length
        ? `Flatten · quality ${assessment.quality} < ${cfg.strategy.guardQuality}`
        : `Stood down: market quality ${assessment.quality} < ${cfg.strategy.guardQuality}`
      : orders.length
        ? orders.map((o) => o.rationale).join("; ")
        : "No momentum trigger";

    const sharp = assessment.signals.find((s) => s.kind === "sharp_move");
    return {
      agentId: this.id,
      seq: tick.seq,
      tsMs: tick.tsMs,
      orders,
      quotes: [],
      rationale,
      stoodDown: standDown || undefined,
      kind: standDown && !orders.length ? "stand_down" : orders.length ? "trade" : "hold",
      signalIds,
      drivingInputs: {
        sentinelKind: sharp?.kind ?? (standDown ? "quality_gate" : null),
      },
    };
  }
}

function flattenOrders(agentId: string, ctx: AgentContext): Order[] {
  const { tick } = ctx;
  const orders: Order[] = [];
  for (const s of TAKER_SELECTIONS) {
    const id = selId(s.marketType, s.key);
    const price = obsProb(tick, s.marketType, s.key);
    if (price == null) continue;
    const d = deltaToOrder(ctx.book.net(id), 0, MIN_TRADE);
    if (!d) continue;
    orders.push(
      makeOrder(
        agentId,
        tick,
        s.marketType,
        s.key,
        id,
        d.side,
        price,
        d.size,
        `${d.side} ${d.size} ${s.key}: flatten (stand-down)`,
      ),
    );
  }
  return orders;
}
