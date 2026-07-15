/**
 * Deterministic match simulation that emits TxLINE-shaped feeds.
 *
 * Seeded by fixture id: a given fixture always plays out identically, which is
 * what makes replay reliable for the demo. The engine precomputes a realistic
 * timeline of goals / cards / corners from team ratings, then can report a
 * normalized ScoreSnapshot, a live-moving OddsSnapshot, and the discrete
 * MatchEvents for any minute — the same primitives TxLINE documents.
 */
import {
  GamePhase,
  type Fixture,
  type MatchEvent,
  type OddsSnapshot,
  type ScoreSnapshot,
  type StatPair,
} from "@/lib/txline/types";
import { hashStringToSeed, makeRng, type Rng } from "@/lib/util/rng";

export const MATCH_MINUTES = 90;
const HALF_TIME_MINUTE = 45;

interface SimEvent {
  minute: number;
  kind: MatchEvent["kind"];
  side?: "home" | "away";
}

// ── small Poisson toolkit ────────────────────────────────────────────────────
function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logp = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logp -= Math.log(i);
  return Math.exp(logp);
}
function samplePoisson(lambda: number, rng: Rng): number {
  // Knuth's algorithm
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L);
  return k - 1;
}

export class MatchSimulation {
  readonly fixture: Fixture;
  private rng: Rng;
  private events: SimEvent[] = [];

  /** Full-match expected goals (the model behind the odds). */
  readonly expH: number;
  readonly expA: number;
  /** Full-match expected corners per side. */
  private expCornersH: number;
  private expCornersA: number;

  constructor(fixture: Fixture) {
    this.fixture = fixture;
    this.rng = makeRng(hashStringToSeed(fixture.id));

    const rh = fixture.home.rating;
    const ra = fixture.away.rating;
    const diff = (rh - ra) / 100;
    // home edge baked in
    this.expH = clamp(1.35 * Math.exp(0.55 * diff) * 1.06, 0.35, 3.6);
    this.expA = clamp(1.35 * Math.exp(-0.55 * diff), 0.3, 3.4);

    const attShare = rh / (rh + ra);
    this.expCornersH = 10.5 * attShare * 1.05;
    this.expCornersA = 10.5 * (1 - attShare);

    this.buildTimeline();
  }

  private buildTimeline() {
    const r = this.rng;
    const ev: SimEvent[] = [];

    ev.push({ minute: 0, kind: "kickoff" });

    // goals (slight second-half lean)
    const goalsH = samplePoisson(this.expH, r);
    const goalsA = samplePoisson(this.expA, r);
    for (let i = 0; i < goalsH; i++) ev.push({ minute: this.goalMinute(), kind: "goal", side: "home" });
    for (let i = 0; i < goalsA; i++) ev.push({ minute: this.goalMinute(), kind: "goal", side: "away" });

    // corners
    const cornersH = samplePoisson(this.expCornersH, r);
    const cornersA = samplePoisson(this.expCornersA, r);
    for (let i = 0; i < cornersH; i++) ev.push({ minute: r.int(2, 90), kind: "corner", side: "home" });
    for (let i = 0; i < cornersA; i++) ev.push({ minute: r.int(2, 90), kind: "corner", side: "away" });

    // yellow cards (avg ~4.2, more in 2nd half)
    const yellows = samplePoisson(4.2, r);
    for (let i = 0; i < yellows; i++) {
      const side: "home" | "away" = r.chance(0.5) ? "home" : "away";
      ev.push({ minute: r.int(12, 90), kind: "yellow", side });
    }

    // red cards (rare)
    if (r.chance(0.22)) {
      const side: "home" | "away" = r.chance(0.5) ? "home" : "away";
      ev.push({ minute: r.int(35, 90), kind: "red", side });
    }

    ev.push({ minute: HALF_TIME_MINUTE, kind: "half-time" });
    ev.push({ minute: MATCH_MINUTES, kind: "full-time" });

    // sort by minute, with phase markers ordered sensibly within the minute
    const order: Record<string, number> = {
      kickoff: 0,
      goal: 1,
      corner: 2,
      yellow: 3,
      red: 4,
      "half-time": 5,
      "full-time": 6,
      phase: 7,
    };
    ev.sort((a, b) => a.minute - b.minute || order[a.kind] - order[b.kind]);
    this.events = ev;
  }

  private goalMinute(): number {
    // bias goals slightly later in the match
    const u = this.rng.next();
    const m = Math.floor(2 + (1 - Math.pow(1 - u, 1.25)) * 88);
    return clamp(m, 1, 90);
  }

  phaseAt(minute: number): GamePhase {
    if (minute <= 0) return GamePhase.PreMatch;
    if (minute < HALF_TIME_MINUTE) return GamePhase.FirstHalf;
    if (minute === HALF_TIME_MINUTE) return GamePhase.HalfTime;
    if (minute < MATCH_MINUTES) return GamePhase.SecondHalf;
    return GamePhase.FullTime;
  }

  /** Discrete events that occur in (afterMinute, throughMinute]. */
  eventsBetween(afterMinute: number, throughMinute: number, ts: string): MatchEvent[] {
    const out: MatchEvent[] = [];
    let seq = 0;
    for (const e of this.events) {
      seq++;
      if (e.minute > afterMinute && e.minute <= throughMinute) {
        out.push(this.toMatchEvent(e, seq, ts));
      }
    }
    return out;
  }

  private toMatchEvent(e: SimEvent, seq: number, ts: string): MatchEvent {
    const team = e.side === "away" ? this.fixture.away : this.fixture.home;
    const labels: Record<string, string> = {
      kickoff: "Kick-off",
      goal: `Goal — ${team?.name}`,
      yellow: `Yellow card — ${team?.name}`,
      red: `Red card — ${team?.name}`,
      corner: `Corner — ${team?.name}`,
      "half-time": "Half-time",
      "full-time": "Full-time whistle",
      phase: "Phase change",
    };
    return {
      fixtureId: this.fixture.id,
      seq,
      ts,
      minute: e.minute,
      phase: this.phaseAt(e.minute),
      kind: e.kind,
      side: e.side,
      label: labels[e.kind],
    };
  }

  private countAt(minute: number, kind: MatchEvent["kind"], half?: "1" | "2"): StatPair {
    let home = 0;
    let away = 0;
    for (const e of this.events) {
      if (e.kind !== kind || e.minute > minute) continue;
      if (half === "1" && e.minute >= HALF_TIME_MINUTE) continue;
      if (half === "2" && e.minute < HALF_TIME_MINUTE) continue;
      if (e.side === "away") away++;
      else if (e.side === "home") home++;
    }
    return { home, away };
  }

  scoreSnapshot(minute: number, seq: number, ts: string): ScoreSnapshot {
    return {
      fixtureId: this.fixture.id,
      seq,
      ts,
      phase: this.phaseAt(minute),
      minute,
      goals: this.countAt(minute, "goal"),
      yellow: this.countAt(minute, "yellow"),
      red: this.countAt(minute, "red"),
      corners: this.countAt(minute, "corner"),
      periods: {
        firstHalf: {
          goals: this.countAt(minute, "goal", "1"),
          yellow: this.countAt(minute, "yellow", "1"),
          red: this.countAt(minute, "red", "1"),
          corners: this.countAt(minute, "corner", "1"),
        },
        secondHalf: {
          goals: this.countAt(minute, "goal", "2"),
          yellow: this.countAt(minute, "yellow", "2"),
          red: this.countAt(minute, "red", "2"),
          corners: this.countAt(minute, "corner", "2"),
        },
      },
    };
  }

  /** Remaining expected goals for each side given current state. */
  private remainingLambdas(minute: number, score: ScoreSnapshot): { lh: number; la: number } {
    const frac = clamp((MATCH_MINUTES - minute) / MATCH_MINUTES, 0, 1);
    let lh = this.expH * frac;
    let la = this.expA * frac;
    // chasing teams attack more
    const lead = score.goals.home - score.goals.away;
    if (lead < 0) lh *= 1.15;
    if (lead > 0) la *= 1.15;
    // a red card hurts that side
    if (score.red.home > 0) lh *= 0.82;
    if (score.red.away > 0) la *= 0.82;
    return { lh: Math.max(0.02, lh), la: Math.max(0.02, la) };
  }

  oddsSnapshot(minute: number, score: ScoreSnapshot, seq: number, ts: string): OddsSnapshot {
    const { lh, la } = this.remainingLambdas(minute, score);
    const lead = score.goals.home - score.goals.away;

    // distribution of additional goals (cap 6 each) -> margin distribution
    const CAP = 6;
    let pHome = 0;
    let pDraw = 0;
    let pAway = 0;
    for (let h = 0; h <= CAP; h++) {
      const ph = poissonPmf(h, lh);
      for (let a = 0; a <= CAP; a++) {
        const pa = poissonPmf(a, la);
        const finalMargin = lead + h - a;
        const p = ph * pa;
        if (finalMargin > 0) pHome += p;
        else if (finalMargin === 0) pDraw += p;
        else pAway += p;
      }
    }
    const norm = pHome + pDraw + pAway || 1;
    pHome /= norm;
    pDraw /= norm;
    pAway /= norm;

    // total goals over/under 2.5
    const currentTotal = score.goals.home + score.goals.away;
    const lTot = lh + la;
    let pUnder = 0; // <= 2 final total
    for (let extra = 0; extra + currentTotal <= 2; extra++) {
      pUnder += poissonPmf(extra, lTot);
    }
    pUnder = clamp(pUnder, 0.001, 0.999);
    const pOver = 1 - pUnder;

    // next team to score (within remaining match)
    const pNoMore = poissonPmf(0, lTot);
    const pHomeNext = (1 - pNoMore) * (lh / (lh + la));
    const pAwayNext = (1 - pNoMore) * (la / (lh + la));

    // total corners over/under (line current + remaining)
    const currentCorners = score.corners.home + score.corners.away;
    const remCorners = (this.expCornersH + this.expCornersA) * clamp((MATCH_MINUTES - minute) / MATCH_MINUTES, 0, 1);
    const cornerLine = 9.5;
    let pCornUnder = 0;
    for (let extra = 0; extra + currentCorners < cornerLine; extra++) {
      pCornUnder += poissonPmf(extra, remCorners);
    }
    pCornUnder = clamp(pCornUnder, 0.001, 0.999);
    const pCornOver = 1 - pCornUnder;

    const OVERROUND = 1.05;
    const price = (p: number) => round2(OVERROUND / clamp(p, 0.01, 0.99));

    return {
      fixtureId: this.fixture.id,
      seq,
      ts,
      markets: [
        {
          type: "match_result",
          label: "Match result",
          selections: [
            { key: "home", label: this.fixture.home.code, price: price(pHome), prevPrice: price(pHome), impliedProb: pHome },
            { key: "draw", label: "Draw", price: price(pDraw), prevPrice: price(pDraw), impliedProb: pDraw },
            { key: "away", label: this.fixture.away.code, price: price(pAway), prevPrice: price(pAway), impliedProb: pAway },
          ],
        },
        {
          type: "total_goals",
          label: "Total goals",
          line: 2.5,
          selections: [
            { key: "over", label: "Over 2.5", price: price(pOver), prevPrice: price(pOver), impliedProb: pOver },
            { key: "under", label: "Under 2.5", price: price(pUnder), prevPrice: price(pUnder), impliedProb: pUnder },
          ],
        },
        {
          type: "next_team_to_score",
          label: "Next goal",
          selections: [
            { key: "home", label: this.fixture.home.code, price: price(pHomeNext), prevPrice: price(pHomeNext), impliedProb: pHomeNext },
            { key: "none", label: "No more", price: price(pNoMore), prevPrice: price(pNoMore), impliedProb: pNoMore },
            { key: "away", label: this.fixture.away.code, price: price(pAwayNext), prevPrice: price(pAwayNext), impliedProb: pAwayNext },
          ],
        },
        {
          type: "total_corners",
          label: "Total corners",
          line: cornerLine,
          selections: [
            { key: "over", label: `Over ${cornerLine}`, price: price(pCornOver), prevPrice: price(pCornOver), impliedProb: pCornOver },
            { key: "under", label: `Under ${cornerLine}`, price: price(pCornUnder), prevPrice: price(pCornUnder), impliedProb: pCornUnder },
          ],
        },
      ],
    };
  }

  /** Final scoreline (for finished fixtures / leaderboards). */
  finalScore(): { home: number; away: number } {
    const s = this.scoreSnapshot(MATCH_MINUTES, 0, new Date(0).toISOString());
    return { home: s.goals.home, away: s.goals.away };
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
