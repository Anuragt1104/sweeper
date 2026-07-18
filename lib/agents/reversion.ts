/**
 * Mean-reversion agent — fades sentinel-confirmed outlier prints.
 *
 * When the Sentinel flags an `outlier_print` (a large move far from the robust
 * reference with no corroborating match event), this agent takes the opposite
 * side at the bad price, expecting the line to snap back. The position decays
 * fast — the edge is the snap-back, not a directional view. This is a pure
 * demonstration of *using* a sentinel classification to make money, and it is
 * harmless when the sentinel is quiet (no signal → no trade).
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
import { clamp, deltaToOrder, MIN_TRADE, obsProb } from "@/lib/agents/util";

const DECAY = 0.55;

export class MeanReversionAgent implements Agent {
  readonly id = "reversion";
  readonly name = "Mean Reversion";
  readonly kind = "reversion";
  readonly blurb = "Fades sentinel-confirmed deviations, expecting a snap-back toward the robust reference.";
  readonly mode = "taker" as const;
  private target = new Map<string, number>();

  reset() {
    this.target.clear();
  }

  onTick(ctx: AgentContext): Decision {
    const { tick, cfg, assessment } = ctx;
    if (ctx.readiness && !ctx.readiness.ready) return standDownDecision(this.id, tick, ctx.readiness.reasons);
    const base = cfg.execution.baseSize;

    for (const [k, v] of this.target) {
      const nv = v * DECAY;
      if (Math.abs(nv) < 1) this.target.delete(k);
      else this.target.set(k, nv);
    }

    if (!tick.suspended) {
      for (const sig of assessment.signals) {
        if (sig.kind !== "outlier_print" || !sig.selId) continue;
        if (!TAKER_SELECTIONS.some((s) => selId(s.marketType, s.key) === sig.selId)) continue;
        const ret = sig.evidence.ret ?? 0;
        // fade: spiked up (ret>0, overpriced) → short; dropped → long
        const dir = ret > 0 ? -1 : 1;
        const conf = clamp(sig.confidence ?? 0.7, 0.5, 1);
        const mag = clamp(Math.abs(ret) / 0.04, 0.7, 1.4);
        this.target.set(sig.selId, clamp(dir * base * 0.9 * conf * mag, -base * 1.2, base * 1.2));
      }
    }

    const orders: Order[] = [];
    for (const s of TAKER_SELECTIONS) {
      const id = selId(s.marketType, s.key);
      const desired = this.target.get(id) ?? 0;
      const price = obsProb(tick, s.marketType, s.key);
      if (price == null) continue;
      const d = deltaToOrder(ctx.book.net(id), desired, MIN_TRADE);
      if (!d) continue;
      orders.push(
        makeOrder(this.id, tick, s.marketType, s.key, id, d.side, price, d.size,
          `${d.side} ${d.size} ${s.key}: fade outlier → target ${Math.round(desired)}`),
      );
    }

    return {
      agentId: this.id,
      seq: tick.seq,
      tsMs: tick.tsMs,
      orders,
      quotes: [],
      rationale: orders.length ? orders.map((o) => o.rationale).join("; ") : "No outlier to fade",
    };
  }
}
