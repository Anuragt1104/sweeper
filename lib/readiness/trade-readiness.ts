import type { FeedHealth, RunProvenance, TradeReadiness } from "@/lib/engine/state";
import type { MarketTick } from "@/lib/market/ticks";
import { GamePhase } from "@/lib/txline/types";

const MAX_AGE_MS = 90_000;
const TRADEABLE_GAME_STATES = new Set(["H1", "H2", "ET1", "ET2", "PE"]);
const BLOCKED_GAME_STATES = new Set(["C", "TXCC", "TXCS", "A"]);

export function evaluateTradeReadiness(
  tick: MarketTick,
  feed: FeedHealth,
  provenance: RunProvenance,
  nowMs = Date.now(),
): TradeReadiness {
  if (provenance === "simulation") {
    return { ready: !tick.suspended, reasons: tick.suspended ? ["market suspended"] : [], checkedAtMs: nowMs, scoreAgeMs: 0, oddsAgeMs: 0 };
  }

  const reasons: string[] = [];
  const scoreAgeMs = age(nowMs, tick.upstream?.scoreTsMs);
  const oddsAgeMs = age(nowMs, tick.upstream?.oddsTsMs);
  const lifecycle = tick.odds.lifecycle;
  const scoreLifecycle = tick.score?.lifecycle;
  const gameState = (lifecycle?.gameState ?? scoreLifecycle?.gameState ?? "").toUpperCase();
  const oneXTwo = tick.odds.markets.find((market) =>
    market.type === "match_result" && ["home", "draw", "away"].every((key) =>
      market.selections.some((selection) => selection.key === key && selection.impliedProb > 0),
    ),
  );

  if (tick.phase === GamePhase.CoveragePaused) reasons.push("coverage paused");
  if (tick.phase === GamePhase.Cancelled) reasons.push("fixture cancelled");
  if (tick.phase === GamePhase.Abandoned) reasons.push("fixture abandoned");
  if (BLOCKED_GAME_STATES.has(gameState)) {
    reasons.push(`non-tradeable lifecycle ${gameState}`);
  }
  if (tick.score?.coverageSecondary === false) {
    reasons.push("secondary coverage off");
  }
  if (feed.status !== "live") reasons.push(`feed ${feed.status}`);
  if (!feed.scoreStreamAccepted) reasons.push("score stream not accepted");
  if (!feed.oddsStreamAccepted) reasons.push("odds stream not accepted");
  if (feed.sequenceGap) reasons.push(`unresolved score gap ${feed.sequenceGap.expected}-${feed.sequenceGap.received}`);
  if (!oneXTwo) reasons.push("usable full-match 1X2 absent");
  if (lifecycle?.inRunning !== true) reasons.push("market not explicitly in-running");
  if (!lifecycle?.gameState || !TRADEABLE_GAME_STATES.has(lifecycle.gameState)) {
    reasons.push(`non-tradeable lifecycle ${lifecycle?.gameState ?? "unknown"}`);
  }
  if (scoreAgeMs === null || scoreAgeMs > MAX_AGE_MS) reasons.push("score stream stale");
  if (oddsAgeMs === null || oddsAgeMs > MAX_AGE_MS) reasons.push("odds stream stale");
  if (tick.suspended || lifecycle?.suspended) reasons.push("market suspended");
  if (!tick.pricing.ready) reasons.push(tick.pricing.standDownReason ?? "reference not ready");

  return { ready: reasons.length === 0, reasons, checkedAtMs: nowMs, scoreAgeMs, oddsAgeMs };
}

function age(nowMs: number, value: number | undefined): number | null {
  return value === undefined || !Number.isFinite(value) ? null : Math.max(0, nowMs - value);
}

export { MAX_AGE_MS as TRADE_READINESS_MAX_AGE_MS, TRADEABLE_GAME_STATES };
