/**
 * Value agent — the "smart money" baseline.
 *
 * Holds a model fair price (in live mode this is the desk's own pricing model;
 * in simulation it is the generator's clean fair). It targets exposure
 * proportional to the edge between fair and the observed consensus price, with a
 * deadband to avoid churning. This is a legitimately positive-EV strategy: it
 * picks off lines that have drifted from fair. It deliberately does NOT consult
 * the sentinel, so it serves as the reference any guarded agent must beat.
 */
import {
  makeOrder,
  TAKER_SELECTIONS,
  type Agent,
  type AgentContext,
  type Decision,
  type Order,
} from "@/lib/agents/types";
import { selId } from "@/lib/market/ids";
import { clamp, deltaToOrder, fairProb, MIN_TRADE, obsProb } from "@/lib/agents/util";

export class ValueAgent implements Agent {
  readonly id = "value";
  readonly name = "Value";
  readonly kind = "value";
  readonly blurb = "Targets exposure proportional to the edge between model fair and the observed price.";
  readonly mode = "taker" as const;

  reset() {}

  onTick(ctx: AgentContext): Decision {
    const { tick, cfg } = ctx;
    if (tick.suspended) {
      return { agentId: this.id, seq: tick.seq, tsMs: tick.tsMs, orders: [], quotes: [], rationale: "Book suspended" };
    }
    const edgeTh = cfg.strategy.valueEdge;
    const base = cfg.execution.baseSize;
    const orders: Order[] = [];

    for (const s of TAKER_SELECTIONS) {
      const obs = obsProb(tick, s.marketType, s.key);
      const fair = fairProb(tick, s.marketType, s.key);
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
          `${d.side} ${d.size} ${s.key}: edge ${(edge * 100).toFixed(1)}pp (fair ${(fair * 100).toFixed(0)}% vs ${(obs * 100).toFixed(0)}%)`),
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
