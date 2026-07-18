/**
 * Per-bet strategy lenses — Tempo · Odds · Hybrid tuned to each Odds view.
 * Still three strategies; views are lenses, not a fourth strategy type.
 */
import type {
  OddsViewId,
  ShockSpike,
  StrategyLensPoint,
  StrategyLensSeries,
  TempoSeriesPoint,
} from "@/lib/tempo/types";
import { ODDS_VIEW_LABELS, ODDS_VIEW_ORDER } from "@/lib/tempo/types";
import {
  blendPressure,
  HYBRID_BLEND,
  oddsVelocityFromDelta,
  tempoIntensityFromSeverities,
} from "@/lib/tempo/hybrid";

export const LENS_BLURB: Record<OddsViewId, string> = {
  next_score: "Shots / SOT tempo · next-goal book · Horizon thesis hybrid",
  ou_25: "Scoring-pressure tempo · O/U 2.5 · goals-market hybrid",
  match_1x2: "Attack / possession tempo · match result · 1X2 hybrid",
  corners_ou: "Corner-rate tempo · corners O/U · corners hybrid",
  swing: "Heat tempo · short-term favorite swing · heat hybrid",
};

const TEMPO_KINDS: Record<OddsViewId, Set<string>> = {
  next_score: new Set(["goal", "shot", "shot_on_target", "dangerous_attack", "attack"]),
  ou_25: new Set(["goal", "shot", "shot_on_target", "dangerous_attack"]),
  match_1x2: new Set(["goal", "attack", "dangerous_attack", "possession_shift", "shot_on_target"]),
  corners_ou: new Set(["corner", "attack", "dangerous_attack"]),
  swing: new Set(["goal", "shot_on_target", "dangerous_attack", "red", "yellow", "odds_swing"]),
};

export function emptyStrategyLenses(): Record<OddsViewId, StrategyLensSeries> {
  const out = {} as Record<OddsViewId, StrategyLensSeries>;
  for (const id of ODDS_VIEW_ORDER) {
    out[id] = {
      id,
      label: ODDS_VIEW_LABELS[id],
      available: false,
      blurb: LENS_BLURB[id],
      series: [],
    };
  }
  return out;
}

export function lensTempoIntensity(
  id: OddsViewId,
  minute: number,
  markers: ShockSpike[],
  tempoSeries: TempoSeriesPoint[],
): number {
  const windowStart = minute - HYBRID_BLEND.tempoWindowMinutes;
  const kinds = TEMPO_KINDS[id];
  const recent = markers.filter(
    (m) => m.minute >= windowStart && m.minute <= minute && kinds.has(m.kind),
  );
  let intensity = tempoIntensityFromSeverities(recent.map((m) => m.severity));

  const last = lastPointAtOrBefore(tempoSeries, minute);
  const prior = lastPointAtOrBefore(tempoSeries, windowStart);
  if (last && prior) {
    const shape = cumulativeShapeDelta(id, prior, last);
    intensity = clamp(Math.max(intensity, shape), 0, 1);
  }
  return intensity;
}

export function oddsPrimaryProb(
  point: { selections: { key: string; prob: number }[]; favoriteProb?: number } | undefined,
  viewId: OddsViewId,
): { prob: number; label: string | null } {
  if (!point) return { prob: 0, label: null };
  if (viewId === "swing") {
    return { prob: point.favoriteProb ?? 0, label: "favorite" };
  }
  const top = point.selections.reduce<{ key: string; prob: number } | null>((best, s) => {
    if (!best || s.prob > best.prob) return s;
    return best;
  }, null);
  return { prob: top?.prob ?? 0, label: top?.key ?? null };
}

export function lensHybridProb(args: {
  viewId: OddsViewId;
  oddsProb: number;
  tempoIntensity: number;
  oddsVelocity: number;
  horizonThesisProb: number | null;
}): { hybridProb: number; pressure: number } {
  const pressure = blendPressure(args.tempoIntensity, args.oddsVelocity);
  const anchor =
    args.viewId === "next_score" && args.horizonThesisProb != null
      ? args.horizonThesisProb
      : args.oddsProb;
  const hybridProb = clamp(0.62 * anchor + 0.38 * pressure, 0, 1);
  return { hybridProb, pressure };
}

export function oddsVelocityFromHistory(
  history: { minute: number; prob: number }[],
  minute: number,
  currentProb: number,
): number {
  const windowStart = minute - HYBRID_BLEND.oddsWindowMinutes;
  const prior = [...history].reverse().find((p) => p.minute <= windowStart);
  const delta = prior ? currentProb - prior.prob : 0;
  return oddsVelocityFromDelta(delta);
}

export function upsertLensPoint(
  lens: StrategyLensSeries,
  point: StrategyLensPoint,
  maxPoints = 200,
): void {
  const last = lens.series[lens.series.length - 1];
  if (last && last.minute === point.minute) {
    lens.series[lens.series.length - 1] = point;
  } else {
    lens.series.push(point);
  }
  if (lens.series.length > maxPoints) {
    lens.series = lens.series.slice(-maxPoints);
  }
}

function cumulativeShapeDelta(
  id: OddsViewId,
  prior: TempoSeriesPoint,
  last: TempoSeriesPoint,
): number {
  if (id === "corners_ou") {
    const d =
      last.cornersHome + last.cornersAway - (prior.cornersHome + prior.cornersAway);
    return clamp(d / 3, 0, 1);
  }
  if (id === "match_1x2") {
    const dAtt = last.shotsHome + last.shotsAway - (prior.shotsHome + prior.shotsAway);
    const possShift = Math.abs(last.possessionHome - prior.possessionHome) / 20;
    return clamp(dAtt / 4 + possShift, 0, 1);
  }
  const dSot = last.sotHome + last.sotAway - (prior.sotHome + prior.sotAway);
  const dShots = last.shotsHome + last.shotsAway - (prior.shotsHome + prior.shotsAway);
  return clamp(dSot / 2 + dShots / 5, 0, 1);
}

function lastPointAtOrBefore<T extends { minute: number }>(series: T[], minute: number): T | null {
  let best: T | null = null;
  for (const p of series) {
    if (p.minute > minute) break;
    best = p;
  }
  return best;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
