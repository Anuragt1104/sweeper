/**
 * PaperExchange — deterministic paper fills for both order types.
 *
 *  - Taker orders fill at the agent's price plus adverse slippage, and are
 *    REJECTED outright when the book is suspended (you can't trade a withdrawn
 *    market). This is where the sentinel earns its keep: a guarded agent never
 *    sends orders into a suspended/stale book, so it avoids the toxic fills a
 *    naive agent eats.
 *  - Market-maker quotes are matched against a seeded order-flow model: informed
 *    flow lifts the ask when fair > ask and hits the bid when fair < bid, so a
 *    market maker quoting too tight into a trending line gets adversely selected
 *    — exactly why widening on volatility and pulling quotes on low quality
 *    matters. All flow is seeded by (fixture, seq, selId): perfectly replayable.
 */
import type { ExecResult, Fill, Order, Quote } from "@/lib/agents/types";
import type { MarketTick } from "@/lib/market/ticks";
import type { EngineConfig } from "@/lib/engine/config";
import { hashStringToSeed, makeRng } from "@/lib/util/rng";
import type { TradeReadiness } from "@/lib/engine/state";
import type { ExecutionAdapter } from "@/lib/execution/types";
import { obsProb } from "@/lib/agents/util";
import { parseSelId } from "@/lib/market/ids";

export class SimulatedPaperExchange implements ExecutionAdapter {
  private cfg: EngineConfig;
  constructor(cfg: EngineConfig) {
    this.cfg = cfg;
  }

  /** Execute a taker order against the observed book. */
  executeOrder(order: Order, tick: MarketTick, readiness: TradeReadiness = simulatedReady(tick)): ExecResult {
    if (order.size <= 0) {
      return { ok: false, rejection: { order, reason: "zero size" } };
    }
    if (!readiness.ready || tick.suspended) {
      return { ok: false, rejection: { order, reason: readiness.reasons.join(", ") || "book suspended" } };
    }
    const slip = this.cfg.execution.slippage;
    const price =
      order.side === "buy" ? clampP(order.price + slip) : clampP(order.price - slip);
    const fill: Fill = {
      agentId: order.agentId,
      fixtureId: order.fixtureId,
      marketType: order.marketType,
      selectionKey: order.selectionKey,
      selId: order.selId,
      side: order.side,
      price: round3(price),
      size: order.size,
      seq: order.seq,
      tsMs: order.tsMs,
      rationale: order.rationale,
    };
    return { ok: true, fill };
  }

  /** Match MM quotes against seeded order flow; returns the MM's fills. */
  matchQuotes(quotes: Quote[], tick: MarketTick, readiness: TradeReadiness = simulatedReady(tick)): Fill[] {
    if (!readiness.ready || tick.suspended) return [];
    const fills: Fill[] = [];
    for (const q of quotes) {
      // Honest mid: observed book — never privileged simulation reference.
      const fair = observedProbFor(tick, q.selId);
      if (fair == null) continue;
      const r = makeRng(hashStringToSeed(`${tick.fixtureId}:${tick.seq}:${q.selId}:flow`));
      const flowSize = Math.min(q.size, 6 + r.int(0, 14));
      if (flowSize <= 0) continue;

      let side: Fill["side"] | null = null;
      let price = 0;
      if (fair >= q.ask) {
        // informed buyer lifts the ask → MM goes short at ask
        side = "sell";
        price = q.ask;
      } else if (fair <= q.bid) {
        side = "buy";
        price = q.bid;
      } else if (r.chance(0.4)) {
        // uninformed two-sided noise flow inside the spread
        if (r.chance(0.5)) {
          side = "sell";
          price = q.ask;
        } else {
          side = "buy";
          price = q.bid;
        }
      }
      if (!side) continue;

      fills.push({
        agentId: q.agentId,
        fixtureId: tick.fixtureId,
        marketType: q.marketType,
        selectionKey: q.selectionKey,
        selId: q.selId,
        side,
        price: round3(clampP(price)),
        size: flowSize,
        seq: tick.seq,
        tsMs: tick.tsMs,
        rationale: `MM ${side === "sell" ? "lifted" : "hit"} @ ${price.toFixed(3)} (fair ${fair.toFixed(3)})`,
      });
    }
    return fills;
  }
}

function observedProbFor(tick: MarketTick, id: string): number | null {
  const { marketType, key } = parseSelId(id);
  return obsProb(tick, marketType, key) ?? null;
}

function simulatedReady(tick: MarketTick): TradeReadiness {
  return {
    ready: !tick.suspended,
    reasons: tick.suspended ? ["book suspended"] : [],
    checkedAtMs: tick.tsMs,
    scoreAgeMs: 0,
    oddsAgeMs: 0,
  };
}

/** Backward-compatible name for existing consumers. */
export { SimulatedPaperExchange as PaperExchange };
function clampP(x: number): number {
  return Math.max(0.001, Math.min(0.999, x));
}
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
