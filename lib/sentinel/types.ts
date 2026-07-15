/** Sentinel signal + recommended-action vocabulary. */
import type { OddsMarketType } from "@/lib/txline/types";

export type SignalKind =
  | "sharp_move" // large, corroborated repricing
  | "stale_line" // price hasn't moved while the match has
  | "outlier_print" // single bad print far from the robust reference
  | "suspended" // book withdrew prices
  | "reopened" // book came back
  | "settlement_hold"; // result can't be settled from a verified proof

export type Severity = "info" | "warning" | "critical";

/** What the sentinel recommends the desk / downstream agents do. */
export type MarketAction =
  | "ALERT"
  | "WIDEN_SPREAD"
  | "SUSPEND_QUOTING"
  | "RESUME_QUOTING"
  | "HOLD"
  | "SETTLEMENT_HOLD";

export interface Signal {
  /** stable id: `${kind}:${seq}:${selId|market}` */
  id: string;
  seq: number;
  tsMs: number;
  fixtureId: string;
  kind: SignalKind;
  severity: Severity;
  confidence: number; // 0..1
  action: MarketAction;
  message: string;
  marketType?: OddsMarketType;
  selectionKey?: string;
  selId?: string;
  /** evidence snapshot at detection time. */
  evidence: {
    prob?: number;
    reference?: number;
    z?: number;
    ret?: number;
    msSinceChange?: number;
    deviation?: number;
  };
  /** hash of the market tick this signal reacted to (set by the engine). */
  reactedToHash?: string;
}

export interface SentinelAssessment {
  seq: number;
  tsMs: number;
  signals: Signal[];
  /** 0..100 live market-quality score for the fixture. */
  quality: number;
  /** market types currently suspended. */
  suspendedMarkets: OddsMarketType[];
  /** selection ids currently flagged stale. */
  staleSelections: string[];
}
