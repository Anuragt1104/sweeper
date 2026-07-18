/**
 * Deterministic tempo synthesis for simulation/replay.
 * Enrichment-only — never settles Horizon.
 */
import type { Fixture } from "@/lib/txline/types";
import { hashStringToSeed, makeRng } from "@/lib/util/rng";
import type { TempoCounts, TempoEvent, TempoKind, TempoSnapshot } from "@/lib/tempo/types";
import { emptyTempoCounts } from "@/lib/tempo/diff";

interface SimTempoEvent {
  minute: number;
  kind: TempoKind;
  side: "home" | "away";
}

export class TempoSynthesizer {
  readonly fixture: Fixture;
  private events: SimTempoEvent[] = [];

  constructor(fixture: Fixture, materialEvents: MatchEventLike[]) {
    this.fixture = fixture;
    this.events = buildTempoTimeline(fixture, materialEvents);
  }

  countsAt(minute: number): TempoCounts {
    const counts = emptyTempoCounts();
    let possHome = 50;
    for (const e of this.events) {
      if (e.minute > minute) continue;
      switch (e.kind) {
        case "shot":
          counts.shots[e.side] += 1;
          break;
        case "shot_on_target":
          counts.shots[e.side] += 1;
          counts.sot[e.side] += 1;
          break;
        case "foul":
          counts.fouls[e.side] += 1;
          break;
        case "offside":
          counts.offsides[e.side] += 1;
          break;
        case "attack":
          counts.attacks[e.side] += 1;
          break;
        case "dangerous_attack":
          counts.dangerousAttacks[e.side] += 1;
          break;
        case "possession_shift":
          possHome = e.side === "home" ? Math.min(70, possHome + 4) : Math.max(30, possHome - 4);
          break;
      }
    }
    counts.possession = { home: possHome, away: 100 - possHome };
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
          label: `${labelFor(e.kind)} — ${sideName(this.fixture, e.side)}`,
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

  for (const m of material) {
    if (m.kind === "goal" && m.side) {
      ev.push({ minute: m.minute, kind: "shot_on_target", side: m.side });
      ev.push({ minute: Math.max(0, m.minute - 0.2), kind: "dangerous_attack", side: m.side });
    }
  }

  const ratingShare = fixture.home.rating / (fixture.home.rating + fixture.away.rating);
  placeKind(ev, "home", "shot", 8 + Math.round(rng.next() * 6) + Math.round(ratingShare * 4), rng, 0.35);
  placeKind(ev, "away", "shot", 8 + Math.round(rng.next() * 6) + Math.round((1 - ratingShare) * 4), rng, 0.35);
  placeSimple(ev, "foul", 10 + Math.round(rng.next() * 8), rng);
  placeSimple(ev, "offside", 4 + Math.round(rng.next() * 4), rng);
  placeSimple(ev, "attack", 18 + Math.round(rng.next() * 10), rng);
  placeSimple(ev, "dangerous_attack", 8 + Math.round(rng.next() * 6), rng);
  placeSimple(ev, "possession_shift", 6 + Math.round(rng.next() * 4), rng);

  ev.sort((a, b) => a.minute - b.minute);
  return ev;
}

function placeKind(
  ev: SimTempoEvent[],
  side: "home" | "away",
  kind: "shot",
  target: number,
  rng: ReturnType<typeof makeRng>,
  onTargetRate: number,
) {
  const existing = ev.filter((e) => e.side === side && (e.kind === "shot" || e.kind === "shot_on_target")).length;
  const need = Math.max(0, target - existing);
  for (let i = 0; i < need; i++) {
    const minute = 1 + Math.floor(rng.next() * 89);
    const onTarget = rng.next() < onTargetRate;
    ev.push({ minute, kind: onTarget ? "shot_on_target" : "shot", side });
  }
}

function placeSimple(
  ev: SimTempoEvent[],
  kind: Exclude<TempoKind, "shot" | "shot_on_target">,
  count: number,
  rng: ReturnType<typeof makeRng>,
) {
  for (let i = 0; i < count; i++) {
    const minute = 1 + Math.floor(rng.next() * 89);
    const side = rng.next() < 0.52 ? "home" : "away";
    ev.push({ minute, kind, side });
  }
}

function labelFor(kind: TempoKind): string {
  switch (kind) {
    case "shot_on_target":
      return "Shot on target";
    case "dangerous_attack":
      return "Dangerous attack";
    case "possession_shift":
      return "Possession shift";
    default:
      return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
}

function sideName(fixture: Fixture, side: "home" | "away"): string {
  return side === "home" ? fixture.home.name : fixture.away.name;
}
