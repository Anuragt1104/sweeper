/**
 * Pure detection functions. Each takes the current tick + features and returns
 * zero or more raw detections; the Sentinel adds rising-edge dedup, ids, and
 * proof references. Keeping these pure makes them unit-testable in isolation.
 *
 * The disambiguation between a genuine SHARP MOVE and a bad OUTLIER PRINT is the
 * interesting bit: both look like a big z-score in a single tick. We separate
 * them with **event corroboration** — a real 1X2 repricing is almost always
 * tied to a goal / red card, whereas a bad operator print is not. So a large
 * move far from the robust reference *with no recent match event* is an outlier;
 * the same move *with* a corroborating event is a legitimate sharp move.
 */
import type { MarketTick } from "@/lib/market/ticks";
import type { SelectionFeatures } from "@/lib/market/features";
import { isLivePhase } from "@/lib/txline/types";
import type { SentinelThresholds } from "@/lib/engine/config";
import type { MarketAction, Severity, SignalKind } from "@/lib/sentinel/types";

export interface RawDetection {
  kind: SignalKind;
  severity: Severity;
  confidence: number;
  action: MarketAction;
  message: string;
  marketType: SelectionFeatures["marketType"];
  selectionKey: string;
  selId: string;
  evidence: {
    prob?: number;
    reference?: number;
    z?: number;
    ret?: number;
    msSinceChange?: number;
    deviation?: number;
  };
}

const WARMUP = 4;

function confFromZ(z: number, zThresh: number): number {
  // map |z| in [zThresh, zThresh+6] → [0.5, 0.95]
  const t = (Math.abs(z) - zThresh) / 6;
  return clamp(0.5 + t * 0.45, 0.5, 0.95);
}

/**
 * SHARP MOVE / OUTLIER PRINT — both derive from a single large standardized move.
 * `ticksSinceBigEvent` lets us corroborate against goals/red cards.
 */
export function detectMoves(
  tick: MarketTick,
  features: Map<string, SelectionFeatures>,
  th: SentinelThresholds,
  ticksSinceBigEvent: number,
): RawDetection[] {
  if (tick.suspended) return []; // suspension detector owns this tick
  const out: RawDetection[] = [];
  const corroborated = ticksSinceBigEvent <= 3;

  for (const f of features.values()) {
    if (f.samples < WARMUP) continue;
    if (Math.abs(f.ret) < th.minReturn) continue;
    if (Math.abs(f.z) < th.sharpZ) continue;

    const deviation = Math.abs(f.prob - f.reference);
    const dir = f.ret > 0 ? "shortened" : "drifted";

    if (deviation > th.outlierBand && !corroborated) {
      // big, off-reference, with no match event to justify it → bad print
      out.push({
        kind: "outlier_print",
        severity: "critical",
        confidence: clamp(0.6 + deviation, 0.6, 0.97),
        action: "ALERT",
        message: `Outlier print on ${label(f)} — ${pct(f.prob)} vs reference ${pct(
          f.reference,
        )} with no corroborating event`,
        marketType: f.marketType,
        selectionKey: f.key,
        selId: f.selId,
        evidence: { prob: f.prob, reference: f.reference, z: f.z, ret: f.ret, deviation },
      });
    } else {
      out.push({
        kind: "sharp_move",
        severity: Math.abs(f.z) >= th.sharpZ * 1.8 ? "critical" : "warning",
        confidence: confFromZ(f.z, th.sharpZ),
        action: "ALERT",
        message: `Sharp move: ${label(f)} ${dir} to ${pct(f.prob)} (z=${f.z.toFixed(1)})${
          corroborated ? " — event-corroborated" : ""
        }`,
        marketType: f.marketType,
        selectionKey: f.key,
        selId: f.selId,
        evidence: { prob: f.prob, reference: f.reference, z: f.z, ret: f.ret },
      });
    }
  }
  return out;
}

/** STALE LINE — price frozen while the ball is in play. */
export function detectStale(
  tick: MarketTick,
  features: Map<string, SelectionFeatures>,
  th: SentinelThresholds,
): RawDetection[] {
  if (!isLivePhase(tick.phase)) return [];
  if (tick.suspended) return []; // a withdrawn book is "suspended", not "stale"
  const out: RawDetection[] = [];
  for (const f of features.values()) {
    if (f.msSinceChange < th.staleMs) continue;
    const over = f.msSinceChange / th.staleMs;
    out.push({
      kind: "stale_line",
      severity: over >= 2 ? "critical" : "warning",
      confidence: clamp(0.55 + (over - 1) * 0.3, 0.55, 0.95),
      action: "WIDEN_SPREAD",
      message: `Stale line: ${label(f)} unchanged for ${Math.round(
        f.msSinceChange / 1000,
      )}s while live`,
      marketType: f.marketType,
      selectionKey: f.key,
      selId: f.selId,
      evidence: { prob: f.prob, msSinceChange: f.msSinceChange },
    });
  }
  return out;
}

function label(f: SelectionFeatures): string {
  return `${f.marketType}/${f.key}`;
}
function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}
function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
