import type { TempoCounts, TempoEvent, TempoKind, TempoSnapshot } from "@/lib/tempo/types";

const KIND_BY_KEY = {
  fouls: "foul",
  offsides: "offside",
  attacks: "attack",
  dangerousAttacks: "dangerous_attack",
} as const satisfies Record<string, TempoKind>;


const LABEL: Record<TempoKind, string> = {
  shot: "Shot",
  shot_on_target: "Shot on target",
  foul: "Foul",
  offside: "Offside",
  attack: "Attack",
  dangerous_attack: "Dangerous attack",
  possession_shift: "Possession shift",
};

/** Diff two cumulative tempo snapshots into discrete enrichment events. */
export function diffTempo(previous: TempoCounts | null, current: TempoSnapshot): TempoEvent[] {
  const prev = previous ?? emptyTempoCounts();
  const events: TempoEvent[] = [];

  for (const side of ["home", "away"] as const) {
    const dSot = Math.max(0, current.counts.sot[side] - prev.sot[side]);
    const dShots = Math.max(0, current.counts.shots[side] - prev.shots[side]);
    const sotEvents = dSot;
    const shotOnly = Math.max(0, dShots - dSot);

    for (let i = 0; i < sotEvents; i++) {
      events.push(makeEvent(current, "shot_on_target", side));
    }
    for (let i = 0; i < shotOnly; i++) {
      events.push(makeEvent(current, "shot", side));
    }

    for (const key of ["fouls", "offsides", "attacks", "dangerousAttacks"] as const) {
      const kind = KIND_BY_KEY[key];
      const delta = Math.max(0, current.counts[key][side] - prev[key][side]);
      for (let i = 0; i < delta; i++) {
        events.push(makeEvent(current, kind, side));
      }
    }
  }

  const prevPoss = Math.abs(prev.possession.home - prev.possession.away);
  const currPoss = Math.abs(current.counts.possession.home - current.counts.possession.away);
  if (currPoss - prevPoss >= 8 && (current.counts.possession.home > 0 || current.counts.possession.away > 0)) {
    const side = current.counts.possession.home >= current.counts.possession.away ? "home" : "away";
    events.push(makeEvent(current, "possession_shift", side));
  }

  return events;
}

function makeEvent(
  current: TempoSnapshot,
  kind: TempoKind,
  side: "home" | "away",
): TempoEvent {
  return {
    fixtureId: current.fixtureId,
    minute: current.minute,
    tsMs: current.tsMs,
    kind,
    side,
    label: `${LABEL[kind]} — ${side}`,
    source: current.source,
  };
}

export function emptyTempoCounts(): TempoCounts {
  return {
    shots: { home: 0, away: 0 },
    sot: { home: 0, away: 0 },
    fouls: { home: 0, away: 0 },
    offsides: { home: 0, away: 0 },
    attacks: { home: 0, away: 0 },
    dangerousAttacks: { home: 0, away: 0 },
    possession: { home: 50, away: 50 },
  };
}
