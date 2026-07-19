/**
 * Forward projection for strategy charts — replaces flat hybrid holds.
 *
 * Horizon lens: material outcomes (goal/card) decay as the window closes;
 * Quiet absorbs the residue so probs stay on the simplex. Aggregated hybrid
 * follows the evolving thesis probability.
 *
 * Other bet lenses: project top market selections with a light tempo/pressure tilt.
 */
import {
  lockBadges,
  type HorizonOutcome,
  type HorizonProbabilities,
} from "@/lib/horizon/probability";
import type { HorizonPublication } from "@/lib/horizon/machine";
import type { OddsViewId, OddsViewPoint, StrategyLensPoint } from "@/lib/tempo/types";

export interface ForecastPoint {
  minute: number;
  /** Aggregated hybrid / thesis path. */
  hybrid: number;
  thesis: HorizonOutcome | string | null;
  /** Per-outcome (Horizon) or per-selection (odds) probabilities. */
  paths: Record<string, number>;
}

const OUTCOME_ORDER: HorizonOutcome[] = ["goal_home", "goal_away", "card", "quiet"];

/** Step size along the forecast (match-minutes). */
const STEP = 0.5;

/**
 * Project Horizon publication from playhead → closesMinute.
 * Material probs shrink with remaining time; Quiet rises to keep sum = 1.
 */
export function projectHorizonForecast(
  horizon: HorizonPublication,
  playheadMinute: number,
  hybridAtPlayhead?: number,
): ForecastPoint[] {
  const start = Math.max(playheadMinute, horizon.openedMinute);
  const end = horizon.closesMinute;
  if (end <= start + 1e-6) return [];

  const p0 = horizon.probabilities;
  const points: ForecastPoint[] = [];

  for (let m = start; m <= end + 1e-9; m = round1(m + STEP)) {
    const minute = Math.min(m, end);
    const elapsed = (minute - start) / Math.max(1e-6, end - start);
    // Convex: material decays toward 0; Quiet takes the residual.
    const decay = Math.pow(1 - elapsed, 1.15);
    const material = {
      goal_home: p0.goal_home * decay,
      goal_away: p0.goal_away * decay,
      card: p0.card * decay,
    };
    const materialSum = material.goal_home + material.goal_away + material.card;
    const quiet = clamp01(1 - materialSum);
    const paths: HorizonProbabilities = {
      goal_home: material.goal_home,
      goal_away: material.goal_away,
      card: material.card,
      quiet,
    };
    const { thesis } = lockBadges(paths);
    let hybrid = paths[thesis];
    // Smooth join to observed hybrid at the playhead so the dotted path doesn't jump.
    if (hybridAtPlayhead != null && elapsed < 0.15) {
      const w = elapsed / 0.15;
      hybrid = hybridAtPlayhead * (1 - w) + hybrid * w;
    }
    points.push({ minute, hybrid, thesis, paths });
    if (minute >= end) break;
  }
  return points;
}

/**
 * Project an odds-market lens forward a short horizon (default 10′ or to 90′).
 * Top selections mean-revert slightly; tempo pressure nudges the favorite up.
 */
export function projectOddsLensForecast(
  viewId: OddsViewId,
  last: StrategyLensPoint,
  lastOddsPoint: OddsViewPoint | undefined,
  playheadMinute: number,
  horizonMinutes = 10,
): ForecastPoint[] {
  const end = Math.min(90, playheadMinute + horizonMinutes);
  if (end <= playheadMinute + 1e-6) return [];

  const selections =
    viewId === "swing"
      ? [{ key: last.label ?? "favorite", prob: last.oddsProb }]
      : (lastOddsPoint?.selections ?? []).map((s) => ({ key: s.key, prob: s.prob }));

  if (selections.length === 0) {
    selections.push({ key: last.label ?? "primary", prob: last.oddsProb });
  }

  const favoriteKey =
    selections.reduce((best, s) => (s.prob > best.prob ? s : best), selections[0]).key;
  const pressure = last.pressure;
  const points: ForecastPoint[] = [];

  for (let m = playheadMinute; m <= end + 1e-9; m = round1(m + STEP)) {
    const minute = Math.min(m, end);
    const elapsed = (minute - playheadMinute) / Math.max(1e-6, end - playheadMinute);
    // Mild mean-reversion toward equal, plus favorite boost from pressure.
    const n = selections.length;
    const equal = 1 / n;
    const paths: Record<string, number> = {};
    let sum = 0;
    for (const s of selections) {
      let p = s.prob * (1 - 0.35 * elapsed) + equal * (0.35 * elapsed);
      if (s.key === favoriteKey) p += 0.12 * pressure * elapsed;
      paths[s.key] = Math.max(0.001, p);
      sum += paths[s.key];
    }
    for (const key of Object.keys(paths)) paths[key] /= sum;

    const topKey = Object.entries(paths).sort((a, b) => b[1] - a[1])[0]?.[0] ?? favoriteKey;
    let hybrid = 0.62 * paths[topKey] + 0.38 * last.pressure;
    if (elapsed < 0.15) {
      const w = elapsed / 0.15;
      hybrid = last.hybridProb * (1 - w) + hybrid * w;
    }
    points.push({ minute, hybrid: clamp01(hybrid), thesis: topKey, paths });
    if (minute >= end) break;
  }
  return points;
}

export const HORIZON_PATH_COLORS: Record<HorizonOutcome, string> = {
  goal_home: "#c8f751",
  goal_away: "#2fe0cf",
  card: "#f5b942",
  quiet: "#8b92a6",
};

export const HORIZON_PATH_LABELS: Record<HorizonOutcome, string> = {
  goal_home: "Goal home",
  goal_away: "Goal away",
  card: "Card",
  quiet: "Quiet",
};

export { OUTCOME_ORDER };

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
