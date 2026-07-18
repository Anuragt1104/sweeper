/**
 * Deterministic tempo synthesis for simulation/replay.
 *
 * Shots/SOT are enrichment-only. Goals from MatchSimulation are treated as
 * on-target shots so the tempo curve stays coherent with the scoreline.
 */
import type { Fixture } from "@/lib/txline/types";
import { hashStringToSeed, makeRng } from "@/lib/util/rng";
import type { TempoCounts, TempoEvent, TempoSnapshot } from "@/lib/tempo/types";
import { emptyTempoCounts } from "@/lib/tempo/diff";

interface SimTempoEvent {
  minute: number;
  kind: "shot" | "shot_on_target";
  side: "home" | "away";
}

export class TempoSynthesizer {
  readonly fixture: Fixture;
  private events: SimTempoEvent[] = [];

  constructor(fixture: Fixture, materialEvents: MatchEventLike[]) {
    this.fixture = fixture;
    this.events = buildTempoTimeline(fixture, materialEvents);
  }

  /** Cumulative counts at (or before) a match minute. */
  countsAt(minute: number): TempoCounts {
    const counts = emptyTempoCounts();
    for (const e of this.events) {
      if (e.minute > minute) continue;
      counts.shots[e.side] += 1;
      if (e.kind === "shot_on_target") counts.sot[e.side] += 1;
    }
    return counts;
  }

  snapshot(minute: number, tsMs: number): TempoSnapshot {
    return {
      fixtureId: this.fixture.id,
      minute,
      tsMs,
      counts: this.countsAt(minute),
      source: "sim",
    };
  }

  eventsBetween(afterMinute: number, throughMinute: number, tsMs: number): TempoEvent[] {
    const out: TempoEvent[] = [];
    for (const e of this.events) {
      if (e.minute > afterMinute && e.minute <= throughMinute) {
        out.push({
          fixtureId: this.fixture.id,
          minute: e.minute,
          tsMs,
          kind: e.kind,
          side: e.side,
          label: e.kind === "shot_on_target" ? `Shot on target — ${sideName(this.fixture, e.side)}` : `Shot — ${sideName(this.fixture, e.side)}`,
          source: "sim",
        });
      }
    }
    return out;
  }
}

type MatchEventLike = { minute: number; kind: string; side?: "home" | "away" };

function buildTempoTimeline(fixture: Fixture, material: MatchEventLike[]): SimTempoEvent[] {
  const rng = makeRng(hashStringToSeed(fixture.id + ":tempo"));
  const ev: SimTempoEvent[] = [];

  // Goals imply an on-target shot at that minute.
  for (const m of material) {
    if (m.kind === "goal" && m.side) {
      ev.push({ minute: m.minute, kind: "shot_on_target", side: m.side });
    }
  }

  const ratingShare = fixture.home.rating / (fixture.home.rating + fixture.away.rating);
  const shotsH = 8 + Math.round(rng.next() * 6) + Math.round(ratingShare * 4);
  const shotsA = 8 + Math.round(rng.next() * 6) + Math.round((1 - ratingShare) * 4);

  placeShots(ev, "home", shotsH, rng);
  placeShots(ev, "away", shotsA, rng);

  ev.sort((a, b) => a.minute - b.minute || (a.kind === "shot_on_target" ? -1 : 1));
  return ev;
}

function placeShots(
  ev: SimTempoEvent[],
  side: "home" | "away",
  targetShots: number,
  rng: ReturnType<typeof makeRng>,
) {
  const existing = ev.filter((e) => e.side === side).length;
  const need = Math.max(0, targetShots - existing);
  for (let i = 0; i < need; i++) {
    const minute = 1 + Math.floor(rng.next() * 89);
    // ~35% of enrichment shots are on target
    const onTarget = rng.next() < 0.35;
    ev.push({ minute, kind: onTarget ? "shot_on_target" : "shot", side });
  }
}

function sideName(fixture: Fixture, side: "home" | "away"): string {
  return side === "home" ? fixture.home.name : fixture.away.name;
}
