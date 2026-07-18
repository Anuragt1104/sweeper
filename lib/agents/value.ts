/**
 * Value agent — the "smart money" baseline.
 *
 * Trades deviations between the observed price and an explicitly-provenanced
 * reference. In live mode the reference is filtered TxLINE consensus, not an
 * independent claim of fair value. It deliberately does NOT consult
 * the sentinel, so it serves as the reference any guarded agent must beat.
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
import { clamp, deltaToOrder, referenceProb, MIN_TRADE, obsProb } from "@/lib/agents/util";

export class ValueAgent implements Agent {
  readonly id = "value";
  readonly name = "Value";
  readonly kind = "value";
  readonly blurb = "Trades deviations from the robust consensus reference; no positive-EV claim is implied.";
  readonly mode = "taker" as const;

  reset() {}

  onTick(ctx: AgentContext): Decision {
    const { tick, cfg } = ctx;
    if (ctx.readiness && !ctx.readiness.ready) return standDownDecision(this.id, tick, ctx.readiness.reasons);
    const edgeTh = cfg.strategy.valueEdge;
    const base = cfg.execution.baseSize;
    const orders: Order[] = [];

    for (const s of TAKER_SELECTIONS) {
      const obs = obsProb(tick, s.marketType, s.key);
      const fair = referenceProb(tick, s.marketType, s.key);
      if (obs == null || fair == null) continue;
      const id = selId(s.marketType, s.key);
      const edge = fair - obs;
      const cur = ctx.book.net(id);

      let desired: number;
      if (Math.abs(edge) >= edgeTh) desired = Math.sign(edge) * base * clamp(Math.abs(edge) / edgeTh, 1, 3);
      else if (Math.abs(edge) < edgeTh * 0.4) desired = 0;
      else desired = cur; // hold inside the deadband

      const d = deltaToOrder(cur, desired, MIN_TRADE);
      if (!d) continue;
      orders.push(
        makeOrder(this.id, tick, s.marketType, s.key, id, d.side, obs, d.size,
          `${d.side} ${d.size} ${s.key}: deviation ${(edge * 100).toFixed(1)}pp (reference ${(fair * 100).toFixed(0)}% vs observed ${(obs * 100).toFixed(0)}%)`),
      );
    }

    return {
      agentId: this.id,
      seq: tick.seq,
      tsMs: tick.tsMs,
      orders,
      quotes: [],
      rationale: orders.length ? orders.map((o) => o.rationale).join("; ") : "No actionable edge",
    };
  }
}
