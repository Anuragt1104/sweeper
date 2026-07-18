/**
 * Session-level desk scorecard for the Arena hero — Sentinel A/B edge,
 * Hybrid Thesis activity vs Horizon collapses, path regime.
 */
import type { AgentView } from "@/lib/engine/state";
import type { HorizonState } from "@/lib/horizon/machine";
import type { DeskPathFeatures } from "@/lib/agents/desk-features";
import type { EngineConfig } from "@/lib/engine/config";
import { classifyRegime, type RegimeKind } from "@/lib/agents/regime";

export interface SessionScorecard {
  leaderId: string | null;
  leaderName: string | null;
  leaderPnl: number;
  /** Guarded Momentum PnL − Naive Momentum PnL (Sentinel value). */
  guardedEdge: number | null;
  hybridThesisTrades: number;
  hybridThesisPnl: number;
  collapseFadeTrades: number;
  collapseFadePnl: number;
  horizonSettled: number;
  horizonThesisHitRate: number | null;
  /** Agents currently stood down. */
  stoodDownCount: number;
  regime: RegimeKind;
  homeRet5: number | null;
  hybridSlope5: number | null;
  homePathVol: number | null;
  warmedTicks: number;
}

export function buildSessionScorecard(
  agents: AgentView[],
  horizon: HorizonState,
  leaderId: string | null,
  path?: DeskPathFeatures | null,
  cfg?: EngineConfig,
  warmedTicks = 0,
): SessionScorecard {
  const leader = leaderId ? agents.find((a) => a.id === leaderId) : null;
  const naive = agents.find((a) => a.id === "momentum_naive");
  const guarded = agents.find((a) => a.id === "momentum_guarded");
  const hybrid = agents.find((a) => a.id === "hybrid_thesis");
  const fade = agents.find((a) => a.id === "collapse_fade");

  const guardedEdge =
    naive && guarded ? round2(guarded.metrics.pnl - naive.metrics.pnl) : null;

  return {
    leaderId: leader?.id ?? null,
    leaderName: leader?.name ?? null,
    leaderPnl: leader ? round2(leader.metrics.pnl) : 0,
    guardedEdge,
    hybridThesisTrades: hybrid?.metrics.trades ?? 0,
    hybridThesisPnl: hybrid ? round2(hybrid.metrics.pnl) : 0,
    collapseFadeTrades: fade?.metrics.trades ?? 0,
    collapseFadePnl: fade ? round2(fade.metrics.pnl) : 0,
    horizonSettled: horizon.metrics.horizonsSettled,
    horizonThesisHitRate:
      horizon.metrics.horizonsSettled > 0 ? round3(horizon.metrics.thesisHitRate) : null,
    stoodDownCount: agents.filter((a) => a.stoodDown).length,
    regime: cfg ? classifyRegime(path ?? undefined, cfg) : "normal",
    homeRet5: path?.homeRet5 != null ? round4(path.homeRet5) : null,
    hybridSlope5: path?.hybridSlope5 != null ? round4(path.hybridSlope5) : null,
    homePathVol: path?.homePathVol != null ? round4(path.homePathVol) : null,
    warmedTicks,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
