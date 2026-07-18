import type { TempoCounts, TempoEvent, TempoSnapshot } from "@/lib/tempo/types";

/** Diff two cumulative tempo snapshots into discrete shot / SOT events. */
export function diffTempo(previous: TempoCounts | null, current: TempoSnapshot): TempoEvent[] {
  const prev = previous ?? {
    shots: { home: 0, away: 0 },
    sot: { home: 0, away: 0 },
  };
  const events: TempoEvent[] = [];

  for (const side of ["home", "away"] as const) {
    const dSot = Math.max(0, current.counts.sot[side] - prev.sot[side]);
    const dShots = Math.max(0, current.counts.shots[side] - prev.shots[side]);
    // Prefer SOT markers when both rise; remaining shots are off-target attempts.
    const sotEvents = dSot;
    const shotOnly = Math.max(0, dShots - dSot);

    for (let i = 0; i < sotEvents; i++) {
      events.push({
        fixtureId: current.fixtureId,
        minute: current.minute,
        tsMs: current.tsMs,
        kind: "shot_on_target",
        side,
        label: `Shot on target — ${side}`,
        source: current.source,
      });
    }
    for (let i = 0; i < shotOnly; i++) {
      events.push({
        fixtureId: current.fixtureId,
        minute: current.minute,
        tsMs: current.tsMs,
        kind: "shot",
        side,
        label: `Shot — ${side}`,
        source: current.source,
      });
    }
  }

  return events;
}

export function emptyTempoCounts(): TempoCounts {
  return { shots: { home: 0, away: 0 }, sot: { home: 0, away: 0 } };
}
