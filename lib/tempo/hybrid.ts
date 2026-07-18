/**
 * Tunable Hybrid blend — ideation baseline, not product law.
 */
export const HYBRID_BLEND = {
  tempoWindowMinutes: 5,
  oddsWindowMinutes: 3,
  oddsVelocityDenom: 0.08,
  tempoWeight: 0.55,
  oddsWeight: 0.45,
} as const;

export function tempoIntensityFromSeverities(severities: number[]): number {
  if (severities.length === 0) return 0;
  const sum = severities.reduce((a, b) => a + b, 0);
  return clamp(sum / 1.8, 0, 1);
}

export function oddsVelocityFromDelta(absDelta: number): number {
  return clamp(Math.abs(absDelta) / HYBRID_BLEND.oddsVelocityDenom, 0, 1);
}

export function blendPressure(tempoIntensity: number, oddsVelocity: number): number {
  return clamp(
    HYBRID_BLEND.tempoWeight * tempoIntensity + HYBRID_BLEND.oddsWeight * oddsVelocity,
    0,
    1,
  );
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
