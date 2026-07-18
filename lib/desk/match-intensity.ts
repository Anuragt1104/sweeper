/**
 * Shared match-intensity desk signals (not bet-scoped).
 * Ported from final-whistle-rooms MatchIntensity / story helpers.
 */
import type { MatchEvent, ScoreSnapshot } from "@/lib/txline/types";

export interface MatchIntensity {
  goalsLast10Min: number;
  cardsLast5Min: number;
  scoreJustChanged: boolean;
  isComeback: boolean;
  redCardActive: boolean;
  flurrySummary: string | null;
  lastScorer: string | null;
  lastGoalMinute: number | null;
  majorEvent: boolean;
}

export function emptyMatchIntensity(): MatchIntensity {
  return {
    goalsLast10Min: 0,
    cardsLast5Min: 0,
    scoreJustChanged: false,
    isComeback: false,
    redCardActive: false,
    flurrySummary: null,
    lastScorer: null,
    lastGoalMinute: null,
    majorEvent: false,
  };
}

/**
 * Derive intensity from the recent event tape + current score.
 * Events should be chronological (oldest → newest).
 */
export function computeMatchIntensity(
  score: ScoreSnapshot | null | undefined,
  events: MatchEvent[] | null | undefined,
  opts?: { recentGoalWindowMin?: number },
): MatchIntensity {
  const out = emptyMatchIntensity();
  if (!score) return out;

  const minute = score.minute;
  const goalWindow = opts?.recentGoalWindowMin ?? 2;
  const tape = events ?? [];

  let goalsLast10 = 0;
  let cardsLast5 = 0;
  let lastGoal: MatchEvent | null = null;

  for (const e of tape) {
    if (e.kind === "goal") {
      if (minute - e.minute <= 10 && e.minute <= minute) goalsLast10++;
      if (!lastGoal || e.minute >= lastGoal.minute) lastGoal = e;
    }
    if ((e.kind === "yellow" || e.kind === "red") && minute - e.minute <= 5 && e.minute <= minute) {
      cardsLast5++;
    }
  }

  out.goalsLast10Min = goalsLast10;
  out.cardsLast5Min = cardsLast5;
  out.redCardActive = score.red.home + score.red.away > 0;
  out.lastGoalMinute = lastGoal?.minute ?? null;
  out.lastScorer = lastGoal?.label?.replace(/^Goal\s*[—\-]\s*/i, "") ?? null;
  out.scoreJustChanged =
    lastGoal != null && minute - lastGoal.minute <= goalWindow && lastGoal.minute <= minute;

  const gh = score.goals.home;
  const ga = score.goals.away;
  // Comeback: trailing side scored and now leads or level after having been behind earlier.
  // Proxy: both sides have scored and the match is level or lead flipped recently.
  out.isComeback =
    out.scoreJustChanged &&
    gh > 0 &&
    ga > 0 &&
    (gh === ga || Math.abs(gh - ga) === 1);

  if (goalsLast10 >= 3) {
    out.flurrySummary = `${goalsLast10} goals in 10'`;
  } else if (goalsLast10 === 2) {
    out.flurrySummary = `2 goals in 10'`;
  }

  out.majorEvent =
    out.scoreJustChanged ||
    out.redCardActive ||
    out.cardsLast5Min >= 2 ||
    goalsLast10 >= 2;

  return out;
}
