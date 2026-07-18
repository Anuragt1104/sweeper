/**
 * Desk model weights — every coefficient agents trade on lives here.
 * Same weights for simulation and live; no privileged oracle inputs.
 */
export const DESK_WEIGHTS = {
  /** Prior remaining λ for a 0–0 at minute 0 (home / away). */
  priorExpGoalsHome: 1.35,
  priorExpGoalsAway: 1.15,
  /** Red-card λ multiplier for that side. */
  redCardLambdaMult: 0.82,
  /** Trailing side attack bump. */
  chaseLambdaMult: 1.12,
  /** Cap on additional goals in Poisson convolution. */
  poissonCap: 6,
  matchMinutes: 90,

  /** Tempo differential → 1X2 tilt (prob units per unit of signed intensity). */
  tempoTiltScale: 0.045,
  /** Signed home odds velocity (3′) → tilt. */
  oddsTiltScale: 0.08,
  /** Max |tilt| from hybrid layer alone. */
  hybridTiltCap: 0.06,
  /** Blend: fair = (1−α)·scoreState + α·(obs + hybridTilt) clipped via renormalize. */
  hybridBlendAlpha: 0.35,

  /**
   * Horizon hazard → 1X2 tilt.
   * (P(goal_home)−P(goal_away)) × remainingFrac × k — never use raw class P as 1X2 fair.
   */
  horizonTo1x2K: 0.22,
  horizonTiltCap: 0.08,

  /** Tempo intensity from side-differential markers (normalize). */
  tempoDiffDenom: 2.2,
  /** Odds velocity window (match minutes). */
  oddsVelocityMinutes: 3,
  /** Tempo window for intensity markers (match minutes). */
  tempoWindowMinutes: 5,

  /** Value / Hybrid Thesis min edge vs desk fair (prob). */
  modelEdgeFloor: 0.02,
} as const;

export type DeskWeights = typeof DESK_WEIGHTS;
