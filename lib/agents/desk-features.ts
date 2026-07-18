/**
 * DeskFeatureStore — rolling match-minute time series for agents.
 *
 * Lookbacks use last-observation-at-or-before target minute (not nearest).
 * Path vol is time-normalized (per match-minute), comparable across tick rates.
 */
import type { HorizonCollapse, HorizonPublication } from "@/lib/horizon/machine";
import type { MarketTick } from "@/lib/market/ticks";
import type { ShockStripState } from "@/lib/tempo/types";
import { obsProb } from "@/lib/agents/util";

const MAX_POINTS = 180;

export interface DeskSeriesPoint {
  minute: number;
  seq: number;
  homeProb: number | null;
  awayProb: number | null;
  favoriteProb: number | null;
  /** Desk fair home (model), not Horizon class P. */
  hybridThesisProb: number;
  pressure: number;
  tempoIntensity: number;
  oddsVelocity: number;
}

export interface DeskPathFeatures {
  series: DeskSeriesPoint[];
  windowMinutes: number;
  homeRet1: number | null;
  homeRet5: number | null;
  homeRet10: number | null;
  hybridSlope5: number | null;
  tempoAccel3: number | null;
  pressureDelta5: number | null;
  /** Std of homeProb returns per match-minute (time-normalized). */
  homePathVol: number | null;
  minutesSinceCollapse: number | null;
  lastCollapseWinner: string | null;
  lastCollapseSurprise: boolean;
  /** Tempo rising AND home odds falling. */
  tempoOddsDivergence: boolean;
}

export class DeskFeatureStore {
  private points: DeskSeriesPoint[] = [];

  reset() {
    this.points = [];
  }

  /** Home implied at-or-before (minute - lookback). */
  homeProbPrior(lookbackMinutes: number): number | null {
    if (this.points.length === 0) return null;
    const now = this.points[this.points.length - 1]!;
    return valueAtOrBefore(this.points, "homeProb", now.minute - lookbackMinutes);
  }

  update(
    tick: MarketTick,
    strip: ShockStripState,
    horizon: HorizonPublication | null,
    lastCollapse: HorizonCollapse | null,
    opts?: { fairHome?: number; pressure?: number; tempoIntensity?: number; oddsVelocity?: number },
  ): DeskPathFeatures {
    const hybridLast = strip.hybrid.series.at(-1);
    const nextView = strip.odds.views.next_score?.points.at(-1);
    const favoriteProb =
      nextView?.selections?.reduce(
        (best, s) => (s.prob > (best?.prob ?? -1) ? s : best),
        null as { prob: number } | null,
      )?.prob ?? null;

    const point: DeskSeriesPoint = {
      minute: tick.minute,
      seq: tick.seq,
      homeProb: obsProb(tick, "match_result", "home") ?? null,
      awayProb: obsProb(tick, "match_result", "away") ?? null,
      favoriteProb,
      hybridThesisProb:
        opts?.fairHome ??
        hybridLast?.thesisProb ??
        horizon?.probabilities[horizon.thesis] ??
        0,
      pressure: opts?.pressure ?? hybridLast?.pressure ?? 0,
      tempoIntensity: opts?.tempoIntensity ?? hybridLast?.tempoIntensity ?? 0,
      oddsVelocity: opts?.oddsVelocity ?? hybridLast?.oddsVelocity ?? 0,
    };

    const last = this.points[this.points.length - 1];
    if (last && last.minute === point.minute) this.points[this.points.length - 1] = point;
    else this.points.push(point);
    if (this.points.length > MAX_POINTS) this.points = this.points.slice(-MAX_POINTS);

    return this.snapshot(tick.minute, lastCollapse);
  }

  snapshot(minute: number, lastCollapse: HorizonCollapse | null): DeskPathFeatures {
    const series = this.points;
    const windowMinutes =
      series.length >= 2 ? series[series.length - 1]!.minute - series[0]!.minute : 0;

    const homeRet1 = retAt(series, "homeProb", 1);
    const homeRet5 = retAt(series, "homeProb", 5);
    const homeRet10 = retAt(series, "homeProb", 10);
    const hybridSlope5 = slopeAt(series, "hybridThesisProb", 5);
    const tempoAccel3 = deltaAt(series, "tempoIntensity", 3);
    const pressureDelta5 = deltaAt(series, "pressure", 5);
    const homePathVol = pathVolPerMinute(series, "homeProb", 12);

    const minutesSinceCollapse =
      lastCollapse != null ? Math.max(0, minute - lastCollapse.minute) : null;

    const tempoRising = (tempoAccel3 ?? 0) > 0.08;
    const oddsFalling = (homeRet5 ?? 0) < -0.02;
    const tempoOddsDivergence = tempoRising && oddsFalling;

    return {
      series: [...series],
      windowMinutes,
      homeRet1,
      homeRet5,
      homeRet10,
      hybridSlope5,
      tempoAccel3,
      pressureDelta5,
      homePathVol,
      minutesSinceCollapse,
      lastCollapseWinner: lastCollapse?.winner ?? null,
      lastCollapseSurprise: Boolean(lastCollapse?.surprise),
      tempoOddsDivergence,
    };
  }
}

type NumKey = keyof Pick<
  DeskSeriesPoint,
  | "homeProb"
  | "awayProb"
  | "favoriteProb"
  | "hybridThesisProb"
  | "pressure"
  | "tempoIntensity"
  | "oddsVelocity"
>;

/** Last observation with minute ≤ target (event-time correct). */
function valueAtOrBefore(
  series: DeskSeriesPoint[],
  key: NumKey,
  targetMinute: number,
): number | null {
  let best: DeskSeriesPoint | null = null;
  for (const p of series) {
    if (p.minute > targetMinute) break;
    best = p;
  }
  if (!best) return null;
  const v = best[key];
  return typeof v === "number" ? v : null;
}

function retAt(series: DeskSeriesPoint[], key: NumKey, minuteAgo: number): number | null {
  if (series.length < 2) return null;
  const now = series[series.length - 1]!;
  const nowV = now[key];
  const then = valueAtOrBefore(series, key, now.minute - minuteAgo);
  if (typeof nowV !== "number" || then == null) return null;
  return nowV - then;
}

function deltaAt(series: DeskSeriesPoint[], key: NumKey, minuteAgo: number): number | null {
  return retAt(series, key, minuteAgo);
}

function slopeAt(series: DeskSeriesPoint[], key: NumKey, minuteAgo: number): number | null {
  const d = retAt(series, key, minuteAgo);
  if (d == null || minuteAgo <= 0) return null;
  return d / minuteAgo;
}

function pathVolPerMinute(
  series: DeskSeriesPoint[],
  key: NumKey,
  lookbackMinutes = 12,
): number | null {
  if (series.length < 4) return null;
  const now = series[series.length - 1]!.minute;
  const cut = now - lookbackMinutes;
  const retsPerMin: number[] = [];
  for (let i = 1; i < series.length; i++) {
    if (series[i]!.minute < cut) continue;
    const a = series[i - 1]!;
    const b = series[i]!;
    const va = a[key];
    const vb = b[key];
    if (typeof va !== "number" || typeof vb !== "number") continue;
    const dt = Math.max(1e-3, b.minute - a.minute);
    retsPerMin.push((vb - va) / Math.sqrt(dt));
  }
  if (retsPerMin.length < 3) return null;
  const mean = retsPerMin.reduce((s, x) => s + x, 0) / retsPerMin.length;
  const varSum = retsPerMin.reduce((s, x) => s + (x - mean) ** 2, 0) / retsPerMin.length;
  return Math.sqrt(varSum);
}
