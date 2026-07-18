/**
 * Serializable engine state — the single object the dashboard renders and the
 * SSE stream emits. Kept bounded (ring buffers, sampled curves) so each frame is
 * small even late in a match.
 */
import type { GamePhase, OddsMarketType } from "@/lib/txline/types";
import type { EngineConfig } from "@/lib/engine/config";
import type { Signal, SignalKind } from "@/lib/sentinel/types";
import type { PortfolioMetrics } from "@/lib/execution/portfolio";
import type { SettlementReceipt } from "@/lib/proof/settlement";
import type { AnomalyKind } from "@/lib/market/ticks";
import type { HorizonState } from "@/lib/horizon/machine";
import type { ShockStripState } from "@/lib/tempo/types";

export type RunStatus = "idle" | "running" | "finished";

export interface SelectionView {
  marketType: OddsMarketType;
  key: string;
  label: string;
  prob: number;
  price: number;
  prevPrice: number;
  decimal: number;
  fairProb: number;
  movement: "up" | "down" | "flat";
  z: number;
  vol: number;
  stale: boolean;
}

export interface MarketView {
  type: OddsMarketType;
  label: string;
  line?: number;
  selections: SelectionView[];
}

export interface TickView {
  seq: number;
  minute: number;
  phase: GamePhase;
  phaseLabel: string;
  clock: string;
  tsMs: number;
  homeName: string;
  awayName: string;
  homeCode: string;
  awayCode: string;
  homeGoals: number;
  awayGoals: number;
  homeCorners: number;
  awayCorners: number;
  suspended: boolean;
  quality: number;
  markets: MarketView[];
  events: { kind: string; label: string; minute: number }[];
  /** ground-truth injected anomaly (replay transparency only). */
  anomaly?: AnomalyKind;
}

export interface PositionView {
  selId: string;
  label: string;
  net: number;
  avg: number;
  mark: number;
  unrealized: number;
}

export interface AgentView {
  id: string;
  name: string;
  kind: string;
  blurb: string;
  mode: "taker" | "maker";
  metrics: PortfolioMetrics;
  positions: PositionView[];
  lastRationale: string;
  curve: number[];
}

export interface LedgerView {
  seq: number;
  tick: number;
  kind: string;
  summary: string;
  hash: string;
  reactedToHash?: string;
  tsMs: number;
}

export interface AnchorInfo {
  sig: string;
  url: string;
  root: string;
}

export type FeedStatus = "connecting" | "live" | "degraded" | "offline";

export interface FeedHealth {
  status: FeedStatus;
  detail: string;
  watching: number;
  scoreStreamAccepted: boolean;
  oddsStreamAccepted: boolean;
  hydratedScore: boolean;
  hydratedOdds: boolean;
  lastScoreAtMs: number | null;
  lastOddsAtMs: number | null;
  reconnectCount: number;
  sequenceGap: { expected: number; received: number } | null;
  fatal: boolean;
}

export interface EngineState {
  sessionId: string;
  status: RunStatus;
  mode: "simulation" | "live";
  fixture: {
    id: string;
    home: string;
    away: string;
    homeCode: string;
    awayCode: string;
    stage: string;
    competition: string;
  };
  config: EngineConfig;
  progress: { tick: number; total: number; minute: number; pct: number };
  current: TickView | null;
  quality: number;
  signals: Signal[];
  signalCounts: Record<SignalKind, number>;
  agents: AgentView[];
  leader: string | null;
  ledger: { size: number; root: string; recent: LedgerView[]; anchor: AnchorInfo | null };
  settlement: SettlementReceipt | null;
  feedHealth: FeedHealth;
  horizon: HorizonState;
  /** Dual-track shock strip — material (TxLINE) + tempo enrichment (non-settlement). */
  shockStrip: ShockStripState;
  /** whether Solana devnet anchoring is configured on the server. */
  anchorAvailable: boolean;
  startedAtMs: number;
  updatedAtMs: number;
}

export const OFFLINE_FEED_HEALTH: FeedHealth = {
  status: "offline",
  detail: "Simulation/replay adapter — no TxLINE upstream connection",
  watching: 0,
  scoreStreamAccepted: false,
  oddsStreamAccepted: false,
  hydratedScore: false,
  hydratedOdds: false,
  lastScoreAtMs: null,
  lastOddsAtMs: null,
  reconnectCount: 0,
  sequenceGap: null,
  fatal: false,
};

export const EMPTY_SIGNAL_COUNTS: Record<SignalKind, number> = {
  sharp_move: 0,
  stale_line: 0,
  outlier_print: 0,
  suspended: 0,
  reopened: 0,
  settlement_hold: 0,
};

/** Down-sample an equity curve to at most `n` points for the UI. */
export function sampleCurve(values: number[], n = 60): number[] {
  if (values.length <= n) return values.map((v) => round2(v));
  const out: number[] = [];
  const stride = (values.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(round2(values[Math.round(i * stride)]));
  return out;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
