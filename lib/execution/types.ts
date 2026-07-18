import type { ExecResult, Fill, Order, Quote } from "@/lib/agents/types";
import type { TradeReadiness } from "@/lib/engine/state";
import type { MarketTick } from "@/lib/market/ticks";

export interface ExecutionAdapter {
  executeOrder(order: Order, tick: MarketTick, readiness: TradeReadiness): ExecResult;
  matchQuotes(quotes: Quote[], tick: MarketTick, readiness: TradeReadiness): Fill[];
}
