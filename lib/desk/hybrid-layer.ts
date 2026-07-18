/**
 * Hybrid layer — tempo differential + signed odds velocity.
 * Independent of Horizon. Outputs a home-side tilt in probability units.
 */
import type { TempoCounts } from "@/lib/tempo/types";
import { DESK_WEIGHTS, type DeskWeights } from "@/lib/desk/weights";

export interface HybridInputs {
  /** Cumulative tempo counts (latest), or null. */
  tempo: TempoCounts | null;
  /** Home implied now. */
  homeProb: number | null;
  /** Home implied ~oddsVelocityMinutes ago. */
  homeProbPrior: number | null;
  /** Recent marker severities in tempo window (optional intensity). */
  markerSeverities?: number[];
}

export interface HybridLayerResult {
  /** Additive tilt on home 1X2 (positive → lean home). */
  homeTilt: number;
  tempoIntensity: number;
  /** Signed (home − away) attack proxy in [-1,1]. */
  tempoDifferential: number;
  /** Signed home odds move over window (prob units). */
  signedOddsVelocityHome: number;
  /** Unsigned pressure for UI / regime (0..1). */
  pressure: number;
}

export function computeHybridLayer(
  input: HybridInputs,
  weights: DeskWeights = DESK_WEIGHTS,
): HybridLayerResult {
  const tempoDifferential = tempoDiff(input.tempo, weights);
  const tempoIntensity =
    input.markerSeverities && input.markerSeverities.length
      ? clamp(input.markerSeverities.reduce((a, b) => a + b, 0) / 1.8, 0, 1)
      : clamp(Math.abs(tempoDifferential), 0, 1);

  const signedOddsVelocityHome =
    input.homeProb != null && input.homeProbPrior != null
      ? input.homeProb - input.homeProbPrior
      : 0;

  const oddsSpeed = clamp(
    Math.abs(signedOddsVelocityHome) / 0.08,
    0,
    1,
  );
  const pressure = clamp(0.55 * tempoIntensity + 0.45 * oddsSpeed, 0, 1);

  let homeTilt =
    weights.tempoTiltScale * tempoDifferential +
    weights.oddsTiltScale * signedOddsVelocityHome;
  homeTilt = clamp(homeTilt, -weights.hybridTiltCap, weights.hybridTiltCap);

  return {
    homeTilt,
    tempoIntensity,
    tempoDifferential,
    signedOddsVelocityHome,
    pressure,
  };
}

function tempoDiff(tempo: TempoCounts | null, weights: DeskWeights): number {
  if (!tempo) return 0;
  // Weighted attack proxy — SOT and dangerous attacks matter more than fouls.
  const home =
    tempo.sot.home * 1.4 +
    tempo.shots.home * 0.35 +
    tempo.dangerousAttacks.home * 0.25 +
    tempo.attacks.home * 0.08 -
    tempo.fouls.home * 0.05;
  const away =
    tempo.sot.away * 1.4 +
    tempo.shots.away * 0.35 +
    tempo.dangerousAttacks.away * 0.25 +
    tempo.attacks.away * 0.08 -
    tempo.fouls.away * 0.05;
  return clamp((home - away) / weights.tempoDiffDenom, -1, 1);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
