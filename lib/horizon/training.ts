import {
  clipDifference,
  minuteBand,
  zeroCounts,
  type FrequencyArtifact,
  type HorizonCounts,
  type HorizonOutcome,
} from "@/lib/horizon/probability";
import { ScoreSequence, type NormalizedScoreRecord } from "@/lib/txline/normalize";
import type { Fixture, MatchEvent, ScoreSnapshot } from "@/lib/txline/types";

export interface HorizonSample {
  minute: number;
  scoreDiff: number;
  cardDiff: number;
  outcome: HorizonOutcome;
}

export function samplesFromHistorical(fixture: Fixture, records: NormalizedScoreRecord[]): HorizonSample[] {
  if (records.length === 0) return [];
  const ordered = [...records].sort((a, b) => a.snapshot.seq - b.snapshot.seq);
  const sequence = new ScoreSequence(fixture);
  const events: MatchEvent[] = [];
  const snapshots: ScoreSnapshot[] = [];
  for (const record of ordered) {
    const result = sequence.accept(record);
    if (!result.accepted || !result.snapshot) continue;
    snapshots.push(result.snapshot);
    if (!result.degraded) events.push(...result.events);
  }
  events.sort((a, b) => a.minute - b.minute || a.seq - b.seq);
  // Historical terminal frames are not guaranteed to be the highest-minute
  // frame, so using the final sequence can silently discard a whole match.
  const finalMinute = Math.max(0, Math.min(120, Math.ceil(
    snapshots.reduce((maximum, snapshot) => Math.max(maximum, snapshot.minute), 0),
  )));
  const samples: HorizonSample[] = [];
  for (let minute = 0; minute < finalMinute; minute += 1) {
    const snapshot = latestAt(snapshots, minute);
    if (!snapshot) continue;
    const event = events.find((candidate) => isMaterial(candidate) && candidate.minute > minute && candidate.minute <= minute + 10);
    samples.push({
      minute,
      scoreDiff: clipDifference(snapshot.goals.home - snapshot.goals.away),
      cardDiff: clipDifference(snapshot.yellow.home + 2 * snapshot.red.home - snapshot.yellow.away - 2 * snapshot.red.away),
      outcome: event ? eventOutcome(event) : "quiet",
    });
  }
  return samples;
}

export function buildFrequencyArtifact(
  samples: HorizonSample[],
  provenance: FrequencyArtifact["provenance"],
  generatedAt = new Date().toISOString(),
): FrequencyArtifact {
  const rows: Record<string, HorizonCounts> = {};
  for (const sample of samples) {
    const band = minuteBand(sample.minute);
    const score = clipDifference(sample.scoreDiff);
    const card = clipDifference(sample.cardDiff);
    const keys = [
      `${band}|${score}|${card}`,
      `${band}|${score}|*`,
      `${band}|*|${card}`,
      `${band}|*|*`,
      "global|*|*",
    ];
    for (const key of new Set(keys)) {
      const row = rows[key] ?? (rows[key] = zeroCounts());
      row[sample.outcome] += 1;
    }
  }
  const support = Object.fromEntries(
    Object.entries(rows).map(([key, row]) => [key, Object.values(row).reduce((sum, value) => sum + value, 0)]),
  );
  return { version: 1, generatedAt, alpha: 1, supportThreshold: 30, provenance, rows, support };
}

function latestAt(snapshots: ScoreSnapshot[], minute: number): ScoreSnapshot | undefined {
  return snapshots.filter((snapshot) => snapshot.minute <= minute).at(-1);
}

function isMaterial(event: MatchEvent): boolean {
  return event.kind === "goal" || event.kind === "yellow" || event.kind === "red";
}

function eventOutcome(event: MatchEvent): HorizonOutcome {
  if (event.kind === "goal") return event.side === "away" ? "goal_away" : "goal_home";
  return "card";
}
