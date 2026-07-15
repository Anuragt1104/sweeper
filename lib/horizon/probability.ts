export const HORIZON_OUTCOMES = ["goal_home", "goal_away", "card", "quiet"] as const;
export type HorizonOutcome = (typeof HORIZON_OUTCOMES)[number];
export type HorizonProbabilities = Record<HorizonOutcome, number>;
export type HorizonCounts = Record<HorizonOutcome, number>;

export type ProbabilitySource = "txline-historical" | "simulation-bootstrap";
export type ProbabilityFallback =
  | "exact"
  | "drop_card_difference"
  | "drop_score_difference"
  | "minute_band"
  | "global";

export interface FrequencyArtifact {
  version: number;
  generatedAt: string;
  alpha: number;
  supportThreshold: number;
  provenance: {
    source: ProbabilitySource;
    label: string;
    fixtureCount: number;
    sampleCount: number;
    historicalWindow?: { from: string; to: string };
  };
  /** Keys are minute-band|score-difference|card-difference. `*` is rolled up. */
  rows: Record<string, HorizonCounts>;
  /** Explicit unsmoothed support per row for audit/provenance tooling. */
  support?: Record<string, number>;
}

export interface HorizonFeatures {
  minute: number;
  scoreDiff: number;
  cardDiff: number;
}

export interface ProbabilityLookup {
  probabilities: HorizonProbabilities;
  support: number;
  bucket: string;
  fallback: ProbabilityFallback;
  lowData: boolean;
  source: ProbabilitySource;
  provenance: string;
}

export const MINUTE_BANDS = [
  { key: "0-15", min: 0, max: 15 },
  { key: "15-30", min: 15, max: 30 },
  { key: "30-45", min: 30, max: 45 },
  { key: "45-60", min: 45, max: 60 },
  { key: "60-75", min: 60, max: 75 },
  { key: "75+", min: 75, max: Number.POSITIVE_INFINITY },
] as const;

export function minuteBand(minute: number): string {
  const value = Math.max(0, minute);
  return MINUTE_BANDS.find((band) => value >= band.min && value < band.max)?.key ?? "75+";
}

export function clipDifference(value: number): number {
  return Math.max(-3, Math.min(3, Math.trunc(value)));
}

/**
 * Lookup is deliberately centralized here: callers never need to understand
 * bucket keys, smoothing, minimum support, or provenance semantics.
 */
export function lookupProbabilities(artifact: FrequencyArtifact, features: HorizonFeatures): ProbabilityLookup {
  const band = minuteBand(features.minute);
  const score = clipDifference(features.scoreDiff);
  const card = clipDifference(features.cardDiff);
  const candidates: { key: string; fallback: ProbabilityFallback }[] = [
    { key: `${band}|${score}|${card}`, fallback: "exact" },
    { key: `${band}|${score}|*`, fallback: "drop_card_difference" },
    { key: `${band}|*|${card}`, fallback: "drop_score_difference" },
    { key: `${band}|*|*`, fallback: "minute_band" },
    { key: "global|*|*", fallback: "global" },
  ];

  let chosen = candidates[candidates.length - 1];
  let counts = artifact.rows[chosen.key] ?? zeroCounts();
  for (const candidate of candidates) {
    const row = artifact.rows[candidate.key];
    if (row && supportOf(row) >= artifact.supportThreshold) {
      chosen = candidate;
      counts = row;
      break;
    }
  }

  const support = supportOf(counts);
  const probabilities = smooth(counts, artifact.alpha);
  return {
    probabilities,
    support,
    bucket: chosen.key,
    fallback: chosen.fallback,
    lowData: chosen.fallback !== "exact" || artifact.provenance.source === "simulation-bootstrap",
    source: artifact.provenance.source,
    provenance: artifact.provenance.label,
  };
}

export function lockBadges(
  probabilities: HorizonProbabilities,
  previous?: { thesis: HorizonOutcome; action: Exclude<HorizonOutcome, "quiet"> },
): { thesis: HorizonOutcome; action: Exclude<HorizonOutcome, "quiet"> } {
  const thesis = lockMaximum(HORIZON_OUTCOMES, probabilities, previous?.thesis);
  if (thesis !== "quiet") return { thesis, action: thesis };
  const actionOrder = HORIZON_OUTCOMES.filter((outcome): outcome is Exclude<HorizonOutcome, "quiet"> => outcome !== "quiet");
  const action = lockMaximum(actionOrder, probabilities, previous?.action);
  return { thesis, action };
}

function lockMaximum<T extends HorizonOutcome>(
  order: readonly T[],
  probabilities: HorizonProbabilities,
  previous?: T,
): T {
  const maximum = Math.max(...order.map((outcome) => probabilities[outcome]));
  const tied = order.filter((outcome) => probabilities[outcome] === maximum);
  if (previous && tied.includes(previous)) return previous;
  return tied[0];
}

function supportOf(counts: HorizonCounts): number {
  return HORIZON_OUTCOMES.reduce((sum, outcome) => sum + Math.max(0, counts[outcome] ?? 0), 0);
}

function smooth(counts: HorizonCounts, alpha: number): HorizonProbabilities {
  const support = supportOf(counts);
  const denominator = support + alpha * HORIZON_OUTCOMES.length;
  if (denominator <= 0) return { goal_home: 0.25, goal_away: 0.25, card: 0.25, quiet: 0.25 };
  const raw = Object.fromEntries(
    HORIZON_OUTCOMES.map((outcome) => [outcome, (Math.max(0, counts[outcome] ?? 0) + alpha) / denominator]),
  ) as HorizonProbabilities;
  // Assign floating-point residue to Quiet so the public invariant is exact.
  const residue = 1 - HORIZON_OUTCOMES.reduce((sum, outcome) => sum + raw[outcome], 0);
  raw.quiet += residue;
  return raw;
}

export function zeroCounts(): HorizonCounts {
  return { goal_home: 0, goal_away: 0, card: 0, quiet: 0 };
}
