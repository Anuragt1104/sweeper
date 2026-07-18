/**
 * Trading primitives shared by every agent and the paper exchange.
 *
 * We model each selection as a **probability contract** that pays 1 unit if the
 * selection wins and 0 otherwise — the cleanest representation for PnL and the
 * exact dual of decimal odds (decimal = 1 / prob). An agent BUYS to go long a
 * selection or SELLS to go short. This keeps settlement math exact and lets the
 * UI show both the probability and the decimal price.
 */
import type { OddsMarketType } from "@/lib/txline/types";
import type { MarketTick } from "@/lib/market/ticks";
import type { SelectionFeatures } from "@/lib/market/features";
import type { SentinelAssessment } from "@/lib/sentinel/types";
import type { EngineConfig } from "@/lib/engine/config";
import type { TradeReadiness } from "@/lib/engine/state";

export type Side = "buy" | "sell";

export interface Order {
  agentId: string;
  fixtureId: string;
  marketType: OddsMarketType;
  selectionKey: string;
  selId: string;
  side: Side;
  /** probability (0..1) the agent intends to transact at. */
  price: number;
  /** contracts. */
  size: number;
  seq: number;
  tsMs: number;
  rationale: string;
}

/** A two-sided market-maker quote on a selection. */
export interface Quote {
  agentId: string;
  marketType: OddsMarketType;
  selectionKey: string;
  selId: string;
  bid: number;
  ask: number;
  size: number;
}

export interface Fill {
  agentId: string;
  fixtureId: string;
  marketType: OddsMarketType;
  selectionKey: string;
  selId: string;
  side: Side;
  /** realized fill price (prob units) after slippage. */
  price: number;
  size: number;
  seq: number;
  tsMs: number;
  rationale: string;
}

export interface Rejection {
  order: Order;
  reason: string;
}

export type ExecResult = { ok: true; fill: Fill } | { ok: false; rejection: Rejection };

export interface Decision {
  agentId: string;
  seq: number;
  tsMs: number;
  orders: Order[];
  quotes: Quote[];
  /** human-readable trace of WHY — surfaced in the audit trail. */
  rationale: string;
  /** hash of the market tick this decision reacted to (set by the engine). */
  reactedToHash?: string;
  stoodDown?: boolean;
}

/** Read-only portfolio view an agent uses to decide its next move. */
export interface PortfolioView {
  net(selId: string): number;
  avgPrice(selId: string): number;
  equity(): number;
}

export interface AgentContext {
  tick: MarketTick;
  assessment: SentinelAssessment;
  features: Map<string, SelectionFeatures>;
  book: PortfolioView;
  cfg: EngineConfig;
  /** Always supplied by the engine; optional only for legacy direct-agent tests. */
  readiness?: TradeReadiness;
}

export interface Agent {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly blurb: string;
  /** whether this agent quotes (MM) or takes (directional). */
  readonly mode: "taker" | "maker";
  onTick(ctx: AgentContext): Decision;
  reset(): void;
}

// ── shared helpers for agents ────────────────────────────────────────────────

/** Selections directional agents trade (focused for interpretable PnL). */
export const TAKER_SELECTIONS: { marketType: OddsMarketType; key: string }[] = [
  { marketType: "match_result", key: "home" },
  { marketType: "match_result", key: "away" },
  { marketType: "total_goals", key: "over" },
  { marketType: "total_goals", key: "under" },
];

/** Selections the market maker quotes. */
export const MAKER_SELECTIONS: { marketType: OddsMarketType; key: string }[] = [
  { marketType: "match_result", key: "home" },
  { marketType: "match_result", key: "draw" },
  { marketType: "match_result", key: "away" },
];

export function emptyDecision(agentId: string, tick: MarketTick, rationale: string): Decision {
  return { agentId, seq: tick.seq, tsMs: tick.tsMs, orders: [], quotes: [], rationale };
}

export function standDownDecision(agentId: string, tick: MarketTick, reasons: string[]): Decision {
  return {
    ...emptyDecision(agentId, tick, `STAND DOWN · ${reasons.join("; ")}`),
    stoodDown: true,
  };
}

export function makeOrder(
  agentId: string,
  tick: MarketTick,
  marketType: OddsMarketType,
  selectionKey: string,
  selId: string,
  side: Side,
  price: number,
  size: number,
  rationale: string,
): Order {
  return {
    agentId,
    fixtureId: tick.fixtureId,
    marketType,
    selectionKey,
    selId,
    side,
    price,
    size: Math.max(0, Math.round(size)),
    seq: tick.seq,
    tsMs: tick.tsMs,
    rationale,
  };
}
