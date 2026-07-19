/**
 * Kelly Value — same desk-fair edge as Value, sized with fractional Kelly.
 * A/B companion: kellyEdge = Kelly PnL − Value PnL on the session scorecard.
 */
import {
  standDownDecision,
  type Agent,
  type AgentContext,
  type Decision,
} from "@/lib/agents/types";
import { classifyRegime, regimeBlocksDirectional } from "@/lib/agents/regime";
import { deskEdge1x2Orders } from "@/lib/agents/desk-edge";
import { DESK_WEIGHTS } from "@/lib/desk/weights";

export class KellyValueAgent implements Agent {
  readonly id = "kelly_value";
  readonly name = "Kelly Value";
  readonly kind = "meta_desk";
  readonly blurb =
    "Desk-fair value with fractional Kelly sizing and drawdown-aware throttle.";
  readonly mode = "taker" as const;

  private peakEquity = 1000;

  reset() {
    this.peakEquity = 1000;
  }

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

    const equity = ctx.book.equity();
    this.peakEquity = Math.max(this.peakEquity, equity);
    const drawdown = this.peakEquity > 0 ? (this.peakEquity - equity) / this.peakEquity : 0;
    // Soft DD throttle: cut size as drawdown grows past 8%.
    const ddThrottle = drawdown <= 0.08 ? 1 : clamp(1 - (drawdown - 0.08) / 0.2, 0.35, 1);

    const regime = classifyRegime(desk?.path, cfg);
    const calmBump = regime === "calm" ? 1.1 : 1;
    const edgeTh = Math.max(cfg.strategy.valueEdge, DESK_WEIGHTS.modelEdgeFloor);

    const orders = deskEdge1x2Orders({
      agentId: this.id,
      ctx,
      model,
      edgeTh,
      sizeMult: calmBump * ddThrottle,
      tag: `kelly${ddThrottle < 0.99 ? ` dd${(drawdown * 100).toFixed(0)}%` : ""}`,
      useKelly: true,
      maxClamp: 2.75,
    });

    return {
      agentId: this.id,
      seq: tick.seq,
      tsMs: tick.tsMs,
      orders,
      quotes: [],
      rationale: orders.length
        ? orders.map((o) => o.rationale).join("; ")
        : `Kelly · no desk edge${ddThrottle < 1 ? ` · DD throttle ${(ddThrottle * 100).toFixed(0)}%` : ""}`,
      kind: orders.length ? "trade" : "hold",
      drivingInputs: {
        hybridProb: model.fairHome,
        sentinelKind: regime !== "normal" ? regime : drawdown > 0.08 ? "dd_throttle" : null,
      },
    };
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
