/**
 * Recorded minute-aligned tempo for demos.
 * Cumulative counts are looked up by match minute (floor last point ≤ minute).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TempoCounts, TempoKind, TempoSnapshot } from "@/lib/tempo/types";
import { emptyTempoCounts } from "@/lib/tempo/diff";

export interface RecordedTempoEvent {
  minute: number;
  kind: TempoKind;
  side: "home" | "away";
  label?: string;
}

export interface RecordedTempoArtifact {
  version: 1;
  fixtureId: string;
  /** Human provenance — never settles Horizon. */
  provenance: {
    match: string;
    source: string;
    note?: string;
  };
  /** Discrete events used to rebuild cumulatives (preferred). */
  events: RecordedTempoEvent[];
  /** Optional precomputed cumulative ladder (0.5′ steps). */
  points?: Array<{ minute: number; counts: TempoCounts }>;
}

export class RecordedTempoProvider {
  readonly artifact: RecordedTempoArtifact;
  private readonly points: Array<{ minute: number; counts: TempoCounts }>;

  constructor(artifact: RecordedTempoArtifact) {
    this.artifact = artifact;
    this.points = artifact.points?.length
      ? [...artifact.points].sort((a, b) => a.minute - b.minute)
      : buildCumulativePoints(artifact.events);
  }

  snapshot(minute: number, tsMs: number): TempoSnapshot {
    return {
      fixtureId: this.artifact.fixtureId,
      minute,
      tsMs,
      counts: this.countsAt(minute),
      source: "recorded",
    };
  }

  countsAt(minute: number): TempoCounts {
    let best = emptyTempoCounts();
    for (const p of this.points) {
      if (p.minute > minute) break;
      best = p.counts;
    }
    return cloneCounts(best);
  }
}

export function loadAct2TempoArtifact(): RecordedTempoArtifact | null {
  const file = path.join(process.cwd(), "data", "act2-tempo.json");
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as RecordedTempoArtifact;
  if (parsed.version !== 1 || !Array.isArray(parsed.events)) {
    throw new Error("Invalid act2-tempo artifact");
  }
  return parsed;
}

function buildCumulativePoints(
  events: RecordedTempoEvent[],
): Array<{ minute: number; counts: TempoCounts }> {
  const sorted = [...events].sort((a, b) => a.minute - b.minute || a.kind.localeCompare(b.kind));
  const points: Array<{ minute: number; counts: TempoCounts }> = [
    { minute: 0, counts: emptyTempoCounts() },
  ];
  const counts = emptyTempoCounts();
  let possHome = 50;
  for (const e of sorted) {
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
        possHome = e.side === "home" ? Math.min(78, possHome + 3) : Math.max(22, possHome - 3);
        break;
    }
    counts.possession = { home: possHome, away: 100 - possHome };
    points.push({ minute: e.minute, counts: cloneCounts(counts) });
  }
  return points;
}

function cloneCounts(c: TempoCounts): TempoCounts {
  return {
    shots: { ...c.shots },
    sot: { ...c.sot },
    fouls: { ...c.fouls },
    offsides: { ...c.offsides },
    attacks: { ...c.attacks },
    dangerousAttacks: { ...c.dangerousAttacks },
    possession: { ...c.possession },
  };
}
