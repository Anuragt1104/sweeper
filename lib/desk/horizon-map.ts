/**
 * Map Horizon 10′ event-class hazards onto full-match 1X2 tilts.
 * Never treat P(goal_home | next event in window) as P(home wins match).
 */
import type { HorizonPublication } from "@/lib/horizon/machine";
import { DESK_WEIGHTS, type DeskWeights } from "@/lib/desk/weights";

export function horizonHazardTo1x2Tilt(
  horizon: HorizonPublication | null,
  minute: number,
  weights: DeskWeights = DESK_WEIGHTS,
): { homeTilt: number; drive: "goal_home" | "goal_away" | null } {
  if (!horizon) return { homeTilt: 0, drive: null };

  const thesis = horizon.thesis;
  const action = horizon.action;
  let drive: "goal_home" | "goal_away" | null = null;
  if (thesis === "goal_home" || thesis === "goal_away") drive = thesis;
  else if (action === "goal_home" || action === "goal_away") drive = action;

  const pHome = horizon.probabilities.goal_home;
  const pAway = horizon.probabilities.goal_away;
  const remainingFrac = clamp(
    (weights.matchMinutes - minute) / weights.matchMinutes,
    0.15,
    1,
  );
  let homeTilt = weights.horizonTo1x2K * (pHome - pAway) * remainingFrac;
  homeTilt = clamp(homeTilt, -weights.horizonTiltCap, weights.horizonTiltCap);

  // If Horizon is Quiet/card with no directional ACTION, suppress tilt.
  if (!drive) homeTilt = 0;

  return { homeTilt, drive };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
