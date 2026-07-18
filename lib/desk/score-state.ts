/**
 * Score-state 1X2 model — our fair from minute, score, cards only.
 * Identical code path for live and simulation (no MatchSimulation oracle).
 */
import type { ScoreSnapshot } from "@/lib/txline/types";
import { DESK_WEIGHTS } from "@/lib/desk/weights";

export interface Match1x2 {
  home: number;
  draw: number;
  away: number;
}

export function scoreState1x2(
  minute: number,
  score: ScoreSnapshot,
  weights = DESK_WEIGHTS,
): Match1x2 {
  const frac = clamp((weights.matchMinutes - minute) / weights.matchMinutes, 0, 1);
  let lh = weights.priorExpGoalsHome * frac;
  let la = weights.priorExpGoalsAway * frac;
  const lead = score.goals.home - score.goals.away;
  if (lead < 0) lh *= weights.chaseLambdaMult;
  if (lead > 0) la *= weights.chaseLambdaMult;
  if (score.red.home > 0) lh *= weights.redCardLambdaMult;
  if (score.red.away > 0) la *= weights.redCardLambdaMult;
  lh = Math.max(0.02, lh);
  la = Math.max(0.02, la);

  const CAP = weights.poissonCap;
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  for (let h = 0; h <= CAP; h++) {
    const ph = poissonPmf(h, lh);
    for (let a = 0; a <= CAP; a++) {
      const p = ph * poissonPmf(a, la);
      const margin = lead + h - a;
      if (margin > 0) pHome += p;
      else if (margin === 0) pDraw += p;
      else pAway += p;
    }
  }
  return normalize1x2({ home: pHome, draw: pDraw, away: pAway });
}

export function normalize1x2(p: Match1x2): Match1x2 {
  const t = Math.max(1e-9, p.home + p.draw + p.away);
  return { home: p.home / t, draw: p.draw / t, away: p.away / t };
}

export function applyTilt1x2(base: Match1x2, homeTilt: number): Match1x2 {
  // Positive homeTilt increases home, decreases away, draw absorbs residual.
  const home = clamp(base.home + homeTilt, 0.02, 0.92);
  const away = clamp(base.away - homeTilt * 0.85, 0.02, 0.92);
  const draw = clamp(1 - home - away, 0.02, 0.9);
  return normalize1x2({ home, draw, away });
}

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
