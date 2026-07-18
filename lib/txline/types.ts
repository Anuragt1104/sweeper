/**
 * TxLINE normalized schema (consumer-facing subset).
 *
 * TxLINE exposes a single normalized JSON schema across all competitions. This
 * file models the documented soccer primitives we build on: fixtures, score
 * snapshots with stat encodings (goals / yellow / red / corners, plus
 * period-specific variants), game-phase encodings, and consensus odds.
 *
 * The SimulationSource produces objects in exactly this shape, and the
 * LiveSource maps the real API into the same shape — so the entire app above
 * the data layer is identical whether it runs on simulated or live data.
 */

/** Documented game-phase encodings (numeric codes + readable label). */
export enum GamePhase {
  PreMatch = 0,
  FirstHalf = 1,
  HalfTime = 2,
  SecondHalf = 3,
  FullTime = 4,
  ExtraTimeFirstHalf = 5,
  ExtraTimeHalfTime = 6,
  ExtraTimeSecondHalf = 7,
  Penalties = 8,
  Finished = 9,
  Abandoned = 10,
}

export const PHASE_LABEL: Record<GamePhase, string> = {
  [GamePhase.PreMatch]: "Pre-match",
  [GamePhase.FirstHalf]: "1st half",
  [GamePhase.HalfTime]: "Half-time",
  [GamePhase.SecondHalf]: "2nd half",
  [GamePhase.FullTime]: "Full-time",
  [GamePhase.ExtraTimeFirstHalf]: "ET 1st half",
  [GamePhase.ExtraTimeHalfTime]: "ET half-time",
  [GamePhase.ExtraTimeSecondHalf]: "ET 2nd half",
  [GamePhase.Penalties]: "Penalties",
  [GamePhase.Finished]: "Finished",
  [GamePhase.Abandoned]: "Abandoned",
};

/** Whether the ball is in play for the given phase. */
export function isLivePhase(phase: GamePhase): boolean {
  return (
    phase === GamePhase.FirstHalf ||
    phase === GamePhase.SecondHalf ||
    phase === GamePhase.ExtraTimeFirstHalf ||
    phase === GamePhase.ExtraTimeSecondHalf ||
    phase === GamePhase.Penalties
  );
}

export interface Team {
  id: string;
  name: string;
  /** 3-letter code, e.g. "POR". */
  code: string;
  /** Flag emoji for lightweight rendering. */
  flag: string;
  /** Pre-tournament strength rating (0..100), drives the simulation. */
  rating: number;
  groupId?: string;
}

export type FixtureStatus = "scheduled" | "live" | "finished";

export interface Fixture {
  id: string;
  /** TxLINE competition identifier used to keep autonomous selection scoped. */
  competitionId?: string;
  competition: string;
  /** e.g. "Group A", "Round of 16", "Final". */
  stage: string;
  groupId?: string;
  home: Team;
  away: Team;
  /** ISO 8601 kickoff time. */
  kickoff: string;
  venue: string;
  status: FixtureStatus;
  /** TxLINE participant ordering is independent of venue/home ordering. */
  participant1IsHome?: boolean;
}

/**
 * Documented stat-type encodings. TxLINE encodes match stats as typed numeric
 * codes; we mirror the documented soccer set (totals + period-specific).
 */
export enum StatType {
  Participant1Goals = 1,
  Participant2Goals = 2,
  Participant1YellowCards = 3,
  Participant2YellowCards = 4,
  Participant1RedCards = 5,
  Participant2RedCards = 6,
  Participant1Corners = 7,
  Participant2Corners = 8,
}

/** Per-side counts for a single stat dimension. */
export interface StatPair {
  home: number;
  away: number;
}

/** A normalized live score snapshot for a fixture. */
export interface ScoreSnapshot {
  fixtureId: string;
  /** Monotonic update sequence number (matches historical replay ordering). */
  seq: number;
  /** Server timestamp (ISO) for this snapshot. */
  ts: string;
  phase: GamePhase;
  /** Match clock in minutes (0..90+, includes added time as e.g. 45, 90, 120). */
  minute: number;
  goals: StatPair;
  yellow: StatPair;
  red: StatPair;
  corners: StatPair;
  /** Original lifecycle fields required for authoritative settlement. */
  lifecycle?: {
    action: string;
    gameState: string;
    statusId?: number;
    period?: number;
    participant1IsHome: boolean;
  };
  /** Period-specific breakdowns keyed by StatType. */
  periods: {
    firstHalf: { goals: StatPair; yellow: StatPair; red: StatPair; corners: StatPair };
    secondHalf: { goals: StatPair; yellow: StatPair; red: StatPair; corners: StatPair };
  };
}

/** A single discrete match event in the historical sequence. */
export type MatchEventKind =
  | "kickoff"
  | "goal"
  | "yellow"
  | "red"
  | "corner"
  | "phase"
  | "half-time"
  | "full-time";

export interface MatchEvent {
  fixtureId: string;
  seq: number;
  ts: string;
  minute: number;
  phase: GamePhase;
  kind: MatchEventKind;
  /** "home" | "away" for team-attributed events. */
  side?: "home" | "away";
  /** Human label, e.g. "Goal — Portugal". */
  label: string;
}

/** Consensus odds. */
export type OddsMarketType =
  | "match_result" // 1X2
  | "total_goals" // over/under 2.5
  | "next_team_to_score"
  | "total_corners"
  | `txline:${string}`;

export interface OddsSelection {
  /** e.g. "home" | "draw" | "away" | "over" | "under". */
  key: string;
  label: string;
  /** Decimal price. */
  price: number;
  /** Previous decimal price for movement display. */
  prevPrice: number;
  /** Implied probability (0..1), de-margined for the snapshot. */
  impliedProb: number;
}

export interface OddsMarket {
  type: OddsMarketType;
  label: string;
  /** Reference line for handicap/total markets (e.g. 2.5). */
  line?: number;
  selections: OddsSelection[];
}

export interface OddsSnapshot {
  fixtureId: string;
  seq: number;
  ts: string;
  markets: OddsMarket[];
  lifecycle?: {
    inRunning: boolean | null;
    gameState: string | null;
    suspended: boolean;
  };
  upstream?: {
    messageIds: string[];
    eventId?: string;
    sources: string[];
    bookmakers: string[];
  };
}

/** Combined live tick the simulation/live source emits to the room runner. */
export interface FeedTick {
  fixtureId: string;
  score: ScoreSnapshot;
  odds: OddsSnapshot;
  /** Discrete events that occurred since the previous tick (may be empty). */
  events: MatchEvent[];
}
