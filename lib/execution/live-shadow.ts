import type { ExecResult, Fill, Order, Quote } from "@/lib/agents/types";
import type { EngineConfig } from "@/lib/engine/config";
import type { TradeReadiness } from "@/lib/engine/state";
import type { ExecutionAdapter } from "@/lib/execution/types";
import type { MarketTick } from "@/lib/market/ticks";

interface PendingQuote {
  quote: Quote;
  createdSeq: number;
  observedAtCreation: number;
  messageId: string;
}

/** Shadow execution backed only by later genuine TxLINE consensus observations. */
export class LiveShadowExchange implements ExecutionAdapter {
  private readonly pending = new Map<string, PendingQuote>();

  constructor(private readonly config: EngineConfig) {}

  executeOrder(order: Order, tick: MarketTick, readiness: TradeReadiness): ExecResult {
    if (!readiness.ready) {
      return { ok: false, rejection: { order, reason: readiness.reasons.join(", ") || "trade readiness rejected" } };
    }
    const observed = observedProbability(tick, order.selId);
    if (observed === null) return { ok: false, rejection: { order, reason: "observed TxLINE selection unavailable" } };
    const slip = this.config.execution.slippage;
    return {
      ok: true,
      fill: {
        agentId: order.agentId,
        fixtureId: order.fixtureId,
        marketType: order.marketType,
        selectionKey: order.selectionKey,
        selId: order.selId,
        side: order.side,
        price: round3(clamp(observed + (order.side === "buy" ? slip : -slip))),
        size: order.size,
        seq: tick.seq,
        tsMs: tick.tsMs,
        rationale: `${order.rationale} · SHADOW fill from observed TxLINE consensus`,
      },
    };
  }

  matchQuotes(quotes: Quote[], tick: MarketTick, readiness: TradeReadiness): Fill[] {
    if (!readiness.ready || tick.upstream?.heartbeat) return [];
    const messageId = tick.upstream?.oddsMessageId ?? "";
    if (!messageId) return [];
    const fills: Fill[] = [];

    for (const quote of quotes) {
      const key = `${quote.agentId}:${quote.selId}`;
      const observed = observedProbability(tick, quote.selId);
      if (observed === null) continue;
      const prior = this.pending.get(key);
      if (prior && prior.createdSeq < tick.seq && prior.messageId !== messageId) {
        const crossedAsk = prior.observedAtCreation < prior.quote.ask && observed >= prior.quote.ask;
        const crossedBid = prior.observedAtCreation > prior.quote.bid && observed <= prior.quote.bid;
        if (crossedAsk || crossedBid) {
          const side: Fill["side"] = crossedAsk ? "sell" : "buy";
          const price = crossedAsk ? prior.quote.ask : prior.quote.bid;
          fills.push({
            agentId: prior.quote.agentId,
            fixtureId: tick.fixtureId,
            marketType: prior.quote.marketType,
            selectionKey: prior.quote.selectionKey,
            selId: prior.quote.selId,
            side,
            price: round3(price),
            size: prior.quote.size,
            seq: tick.seq,
            tsMs: tick.tsMs,
            rationale: `SHADOW maker ${crossedAsk ? "ask" : "bid"} crossed by later TxLINE consensus`,
          });
          this.pending.delete(key);
        }
      }
      if (!this.pending.has(key)) {
        this.pending.set(key, { quote, createdSeq: tick.seq, observedAtCreation: observed, messageId });
      }
    }
    return fills;
  }
}

function observedProbability(tick: MarketTick, selId: string): number | null {
  for (const market of tick.odds.markets) {
    for (const selection of market.selections) {
      if (`${market.type}:${selection.key}` === selId) return selection.impliedProb;
    }
  }
  return null;
}

function clamp(value: number): number {
  return Math.max(0.001, Math.min(0.999, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
