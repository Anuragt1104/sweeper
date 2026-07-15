import {
  GamePhase,
  type Fixture,
  type MatchEvent,
  type OddsMarket,
  type OddsMarketType,
  type OddsSnapshot,
  type ScoreSnapshot,
  type StatPair,
  type Team,
} from "@/lib/txline/types";

type JsonObject = Record<string, unknown>;

export class PayloadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadValidationError";
  }
}

const PHASE_MAP: Record<string, GamePhase> = {
  SCHEDULED: GamePhase.PreMatch,
  FINISHED: GamePhase.Finished,
  NS: GamePhase.PreMatch,
  H1: GamePhase.FirstHalf,
  HT: GamePhase.HalfTime,
  H2: GamePhase.SecondHalf,
  F: GamePhase.FullTime,
  WET: GamePhase.ExtraTimeHalfTime,
  ET1: GamePhase.ExtraTimeFirstHalf,
  HTET: GamePhase.ExtraTimeHalfTime,
  ET2: GamePhase.ExtraTimeSecondHalf,
  FET: GamePhase.Finished,
  WPE: GamePhase.ExtraTimeHalfTime,
  PE: GamePhase.Penalties,
  FPE: GamePhase.Finished,
  END: GamePhase.Finished,
  I: GamePhase.HalfTime,
  A: GamePhase.Abandoned,
  C: GamePhase.Abandoned,
  TXCC: GamePhase.PreMatch,
  TXCS: GamePhase.PreMatch,
  P: GamePhase.PreMatch,
};

const FLAGS: Record<string, string> = {
  argentina: "🇦🇷", brazil: "🇧🇷", france: "🇫🇷", spain: "🇪🇸", germany: "🇩🇪",
  england: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", portugal: "🇵🇹", netherlands: "🇳🇱", belgium: "🇧🇪", croatia: "🇭🇷",
  uruguay: "🇺🇾", mexico: "🇲🇽", usa: "🇺🇸", "united states": "🇺🇸", japan: "🇯🇵",
  morocco: "🇲🇦", senegal: "🇸🇳", denmark: "🇩🇰", switzerland: "🇨🇭", serbia: "🇷🇸",
  poland: "🇵🇱", "south korea": "🇰🇷", korea: "🇰🇷", canada: "🇨🇦", colombia: "🇨🇴",
};

export interface NormalizedScoreRecord {
  snapshot: ScoreSnapshot;
  action: string;
  finalised: boolean;
  explicitEvent: MatchEvent | null;
}

export interface ScoreAcceptResult {
  accepted: boolean;
  snapshot: ScoreSnapshot | null;
  events: MatchEvent[];
  degraded: boolean;
  gap: { expected: number; received: number } | null;
  correction: boolean;
  finalised: boolean;
}

export function normalizeFixture(raw: unknown): Fixture {
  const object = asObject(raw, "fixture");
  const id = requiredStringOrNumber(object, "fixtureId");
  const startTime = requiredNumber(object, "startTime");
  const competition = optionalString(object, "competition") ?? "TxLINE";
  const participant1Id = requiredStringOrNumber(object, "participant1Id");
  const participant2Id = requiredStringOrNumber(object, "participant2Id");
  const participant1 = requiredString(object, "participant1");
  const participant2 = requiredString(object, "participant2");
  const participant1IsHome = optionalBoolean(object, "participant1IsHome") ?? true;
  const p1 = team(participant1Id, participant1);
  const p2 = team(participant2Id, participant2);
  const kickoffMs = epochMs(startTime);
  const now = Date.now();
  return {
    id,
    competition,
    stage: optionalString(object, "fixtureGroup", "stage") ?? competition,
    groupId: optionalStringOrNumber(object, "fixtureGroupId"),
    home: participant1IsHome ? p1 : p2,
    away: participant1IsHome ? p2 : p1,
    kickoff: new Date(kickoffMs).toISOString(),
    venue: optionalString(object, "venue") ?? "—",
    status: kickoffMs > now ? "scheduled" : now - kickoffMs > 3 * 3_600_000 ? "finished" : "live",
    participant1IsHome,
  };
}

export function normalizeScoreRecord(raw: unknown, fixture: Fixture): NormalizedScoreRecord {
  const object = asObject(raw, "score");
  const fixtureId = requiredStringOrNumber(object, "fixtureId");
  if (fixtureId !== fixture.id) throw new PayloadValidationError(`Score fixture ${fixtureId} does not match ${fixture.id}`);
  const seq = requiredNumber(object, "seq");
  const tsMs = epochMs(requiredNumber(object, "ts"));
  const state = (optionalString(object, "gameState", "statusSoccerId") ?? "NS").toUpperCase();
  const action = (optionalString(object, "action") ?? "").toLowerCase();
  if (action !== "game_finalised" && PHASE_MAP[state] === undefined) {
    throw new PayloadValidationError(`Unsupported soccer GameState ${state}`);
  }
  const phase = action === "game_finalised" ? GamePhase.Finished : PHASE_MAP[state];
  const data = optionalObject(object, "dataSoccer");
  const minute = scoreMinute(object, data, phase);
  const participant1IsHome = optionalBoolean(object, "participant1IsHome") ?? fixture.participant1IsHome ?? true;
  const scoreSoccer = optionalObject(object, "scoreSoccer");
  const p1 = optionalObject(scoreSoccer, "participant1");
  const p2 = optionalObject(scoreSoccer, "participant2");
  const stats = optionalObject(object, "stats");

  const snapshot: ScoreSnapshot = {
    fixtureId,
    seq,
    ts: new Date(tsMs).toISOString(),
    phase,
    minute,
    goals: orient(pairFromTotal(p1, p2, "Goals", stats, 1, 2), participant1IsHome),
    yellow: orient(pairFromTotal(p1, p2, "YellowCards", stats, 3, 4), participant1IsHome),
    red: orient(pairFromTotal(p1, p2, "RedCards", stats, 5, 6), participant1IsHome),
    corners: orient(pairFromTotal(p1, p2, "Corners", stats, 7, 8), participant1IsHome),
    periods: {
      firstHalf: period(p1, p2, "H1", participant1IsHome),
      secondHalf: period(p1, p2, "H2", participant1IsHome),
    },
  };

  return {
    snapshot,
    action,
    finalised: action === "game_finalised" || phase === GamePhase.Finished || phase === GamePhase.FullTime,
    explicitEvent: explicitMaterialEvent(data, object, fixture, snapshot, participant1IsHome),
  };
}

/** Stateful ordering/delta adapter for one fixture's score records. */
export class ScoreSequence {
  private previous: NormalizedScoreRecord | null = null;
  private eventBaseline: ScoreSnapshot | null = null;

  constructor(private readonly fixture: Fixture) {}

  seed(record: NormalizedScoreRecord): void {
    this.previous = record;
    this.eventBaseline = record.snapshot;
  }

  accept(raw: unknown): ScoreAcceptResult {
    const record = isNormalizedRecord(raw) ? raw : normalizeScoreRecord(raw, this.fixture);
    const previous = this.previous;
    if (previous && record.snapshot.seq <= previous.snapshot.seq) {
      return emptyAccept(false, previous.snapshot, previous.finalised);
    }

    const gap = previous && record.snapshot.seq > previous.snapshot.seq + 1
      ? { expected: previous.snapshot.seq + 1, received: record.snapshot.seq }
      : null;
    const baseline = this.eventBaseline ?? previous?.snapshot ?? null;
    const correction = baseline ? hasCounterCorrection(baseline, record.snapshot) : false;
    let events: MatchEvent[] = [];
    if (previous && baseline && !gap) {
      const deltas = derivePositiveDeltas(baseline, record.snapshot, this.fixture);
      events = record.explicitEvent && explicitEventMatchesDelta(record.explicitEvent, baseline, record.snapshot)
        ? [record.explicitEvent]
        : deltas;
    }
    this.previous = record;
    this.eventBaseline = baseline ? mergeCounterMaximum(baseline, record.snapshot) : record.snapshot;
    return {
      accepted: true,
      snapshot: record.snapshot,
      events: gap ? [] : events,
      degraded: gap !== null,
      gap,
      correction,
      finalised: record.finalised,
    };
  }
}

export function normalizeOddsRecords(
  rawRecords: unknown,
  fixture: Fixture,
  seq: number,
  previous?: OddsSnapshot,
): OddsSnapshot {
  if (!Array.isArray(rawRecords)) throw new PayloadValidationError("Odds payload must be an array");
  const records = rawRecords.map((raw) => normalizeOddsRecord(raw, fixture));
  if (records.length === 0) {
    return { fixtureId: fixture.id, seq, ts: new Date().toISOString(), markets: [] };
  }
  const latest = new Map<string, ParsedOdds>();
  for (const record of records) {
    const prior = latest.get(record.lineKey);
    if (!prior || record.tsMs >= prior.tsMs) latest.set(record.lineKey, record);
  }
  const markets = [...latest.values()]
    .sort((a, b) => a.lineKey.localeCompare(b.lineKey))
    .map((record) => toMarket(record, fixture, previous));
  return {
    fixtureId: fixture.id,
    seq,
    ts: new Date(Math.max(...records.map((record) => record.tsMs))).toISOString(),
    markets,
  };
}

interface ParsedOdds {
  fixtureId: string;
  messageId: string;
  tsMs: number;
  superType: string;
  period: string;
  parameters: string;
  priceNames: string[];
  prices: number[];
  pct: (number | null)[];
  lineKey: string;
}

function normalizeOddsRecord(raw: unknown, fixture: Fixture): ParsedOdds {
  const object = asObject(raw, "odds");
  const fixtureId = requiredStringOrNumber(object, "fixtureId");
  if (fixtureId !== fixture.id) throw new PayloadValidationError(`Odds fixture ${fixtureId} does not match ${fixture.id}`);
  const messageId = requiredString(object, "messageId");
  const tsMs = epochMs(requiredNumber(object, "ts"));
  const superType = requiredString(object, "superOddsType");
  const period = optionalString(object, "marketPeriod") ?? "";
  const parameters = optionalString(object, "marketParameters") ?? "";
  const priceNames = stringArray(requiredValue(object, "priceNames"), "priceNames");
  const prices = numberArray(requiredValue(object, "prices"), "prices");
  if (priceNames.length === 0 || priceNames.length !== prices.length) {
    throw new PayloadValidationError("Odds PriceNames/Prices must be non-empty equal-length arrays");
  }
  const rawPct = value(object, "pct");
  const pct = Array.isArray(rawPct)
    ? rawPct.map((item) => pctValue(item))
    : priceNames.map(() => null);
  return {
    fixtureId,
    messageId,
    tsMs,
    superType,
    period,
    parameters,
    priceNames,
    prices,
    pct,
    lineKey: `${superType}|${period}|${parameters}`,
  };
}

function toMarket(record: ParsedOdds, fixture: Fixture, previous?: OddsSnapshot): OddsMarket {
  const isOneXTwo = record.superType.toUpperCase() === "1X2" && isFullMatchPeriod(record.period);
  const type = marketType(record, isOneXTwo);
  const rawProbabilities = record.priceNames.map((_, index) => {
    const pct = record.pct[index];
    if (pct !== null && pct > 0) return pct;
    const decimal = decimalPrice(record.prices[index]);
    return decimal > 0 ? 1 / decimal : 0;
  });
  const total = rawProbabilities.reduce((sum, probability) => sum + probability, 0) || 1;
  const previousSelections = previous?.markets.find((market) => market.type === type && market.label === marketLabel(record, isOneXTwo))?.selections;
  const selections = record.priceNames.map((name, index) => {
    const key = selectionKey(name, isOneXTwo, fixture.participant1IsHome ?? true);
    const price = decimalPrice(record.prices[index]);
    return {
      key,
      label: selectionLabel(key, name, fixture),
      price,
      prevPrice: previousSelections?.find((selection) => selection.key === key)?.price ?? price,
      impliedProb: rawProbabilities[index] / total,
    };
  });
  const line = numericLine(record.parameters);
  return { type, label: marketLabel(record, isOneXTwo), ...(line === undefined ? {} : { line }), selections };
}

function marketType(record: ParsedOdds, isOneXTwo: boolean): OddsMarketType {
  if (isOneXTwo) return "match_result";
  const value = record.superType.toUpperCase();
  if (["OU", "O/U", "TOTAL_GOALS"].includes(value)) return "total_goals";
  if (["NEXT_TEAM_TO_SCORE", "NTS"].includes(value)) return "next_team_to_score";
  if (["TOTAL_CORNERS", "CORNERS_OU"].includes(value)) return "total_corners";
  return `txline:${slug(`${record.superType}-${record.period}-${record.parameters}`)}`;
}

function marketLabel(record: ParsedOdds, oneXTwo: boolean): string {
  if (oneXTwo) return "Match result";
  return [record.superType, record.period, record.parameters].filter(Boolean).join(" · ");
}

function selectionKey(name: string, oneXTwo: boolean, participant1IsHome: boolean): string {
  const upper = name.trim().toUpperCase();
  if (oneXTwo) {
    if (upper === "X") return "draw";
    if (upper === "1") return participant1IsHome ? "home" : "away";
    if (upper === "2") return participant1IsHome ? "away" : "home";
  }
  if (upper === "O" || upper === "OVER") return "over";
  if (upper === "U" || upper === "UNDER") return "under";
  return slug(name);
}

function selectionLabel(key: string, original: string, fixture: Fixture): string {
  if (key === "home") return fixture.home.code;
  if (key === "away") return fixture.away.code;
  if (key === "draw") return "Draw";
  if (key === "over") return "Over";
  if (key === "under") return "Under";
  return original;
}

function derivePositiveDeltas(previous: ScoreSnapshot, current: ScoreSnapshot, fixture: Fixture): MatchEvent[] {
  const dimensions: { key: "goals" | "yellow" | "red"; kind: "goal" | "yellow" | "red" }[] = [
    { key: "goals", kind: "goal" },
    { key: "yellow", kind: "yellow" },
    { key: "red", kind: "red" },
  ];
  const events: MatchEvent[] = [];
  for (const dimension of dimensions) {
    for (const side of ["home", "away"] as const) {
      const delta = current[dimension.key][side] - previous[dimension.key][side];
      for (let i = 0; i < Math.max(0, delta); i += 1) {
        events.push(matchEvent(fixture, current, dimension.kind, side, current.seq + events.length / 100));
      }
    }
  }
  return events;
}

function explicitMaterialEvent(
  data: JsonObject | undefined,
  root: JsonObject,
  fixture: Fixture,
  snapshot: ScoreSnapshot,
  participant1IsHome: boolean,
): MatchEvent | null {
  if (!data) return null;
  const goal = optionalBoolean(data, "goal") === true;
  const yellow = optionalBoolean(data, "yellowCard") === true;
  const red = optionalBoolean(data, "redCard") === true;
  const kind = goal ? "goal" : red ? "red" : yellow ? "yellow" : null;
  if (!kind) return null;
  const participant = optionalNumber(data, "participant") ?? optionalNumber(root, "participant");
  const participant1Id = optionalNumber(root, "participant1Id");
  const participant2Id = optionalNumber(root, "participant2Id");
  const isP1 = participant === 1 || (participant1Id !== undefined && participant === participant1Id);
  const isP2 = participant === 2 || (participant2Id !== undefined && participant === participant2Id);
  const side = isP1
    ? (participant1IsHome ? "home" : "away")
    : isP2
      ? (participant1IsHome ? "away" : "home")
      : undefined;
  if (!side) return null;
  return matchEvent(fixture, snapshot, kind, side, snapshot.seq);
}

function matchEvent(
  fixture: Fixture,
  snapshot: ScoreSnapshot,
  kind: "goal" | "yellow" | "red",
  side: "home" | "away",
  seq: number,
): MatchEvent {
  const teamName = side === "home" ? fixture.home.name : fixture.away.name;
  const name = kind === "goal" ? "Goal" : kind === "yellow" ? "Yellow card" : "Red card";
  return {
    fixtureId: fixture.id,
    seq,
    ts: snapshot.ts,
    minute: snapshot.minute,
    phase: snapshot.phase,
    kind,
    side,
    label: `${name} — ${teamName}`,
  };
}

function hasCounterCorrection(previous: ScoreSnapshot, current: ScoreSnapshot): boolean {
  return (["goals", "yellow", "red"] as const).some((key) =>
    current[key].home < previous[key].home || current[key].away < previous[key].away,
  );
}

function explicitEventMatchesDelta(event: MatchEvent, previous: ScoreSnapshot, current: ScoreSnapshot): boolean {
  if (!event.side) return false;
  const key = event.kind === "goal" ? "goals" : event.kind === "yellow" ? "yellow" : event.kind === "red" ? "red" : null;
  return key !== null && current[key][event.side] > previous[key][event.side];
}

function mergeCounterMaximum(baseline: ScoreSnapshot, current: ScoreSnapshot): ScoreSnapshot {
  const maxPair = (left: StatPair, right: StatPair): StatPair => ({
    home: Math.max(left.home, right.home),
    away: Math.max(left.away, right.away),
  });
  return {
    ...current,
    goals: maxPair(baseline.goals, current.goals),
    yellow: maxPair(baseline.yellow, current.yellow),
    red: maxPair(baseline.red, current.red),
    corners: maxPair(baseline.corners, current.corners),
  };
}

function scoreMinute(root: JsonObject, data: JsonObject | undefined, phase: GamePhase): number {
  const direct = optionalNumber(root, "minute", "minutes") ?? optionalNumber(data, "minutes");
  if (direct !== undefined) return direct;
  const next = optionalObject(data, "new");
  const nested = optionalNumber(next, "minutes");
  if (nested !== undefined) return nested;
  const clock = optionalObject(root, "clock") ?? optionalObject(next, "clock");
  const seconds = optionalNumber(clock, "seconds");
  if (seconds !== undefined) return seconds / 60;
  if (phase === GamePhase.HalfTime) return 45;
  if (phase === GamePhase.SecondHalf) return 45;
  if (phase >= GamePhase.FullTime) return 90;
  return 0;
}

function period(p1: JsonObject | undefined, p2: JsonObject | undefined, key: string, homeIsP1: boolean) {
  return {
    goals: orient(pairFromPeriod(p1, p2, key, "Goals"), homeIsP1),
    yellow: orient(pairFromPeriod(p1, p2, key, "YellowCards"), homeIsP1),
    red: orient(pairFromPeriod(p1, p2, key, "RedCards"), homeIsP1),
    corners: orient(pairFromPeriod(p1, p2, key, "Corners"), homeIsP1),
  };
}

function pairFromPeriod(p1: JsonObject | undefined, p2: JsonObject | undefined, periodKey: string, stat: string): StatPair {
  return {
    home: optionalNumber(optionalObject(p1, periodKey), stat) ?? 0,
    away: optionalNumber(optionalObject(p2, periodKey), stat) ?? 0,
  };
}

function pairFromTotal(
  p1: JsonObject | undefined,
  p2: JsonObject | undefined,
  stat: string,
  fallback: JsonObject | undefined,
  p1Key: number,
  p2Key: number,
): StatPair {
  return {
    home: optionalNumber(optionalObject(p1, "total"), stat) ?? optionalNumber(fallback, String(p1Key)) ?? 0,
    away: optionalNumber(optionalObject(p2, "total"), stat) ?? optionalNumber(fallback, String(p2Key)) ?? 0,
  };
}

function orient(pair: StatPair, participant1IsHome: boolean): StatPair {
  return participant1IsHome ? pair : { home: pair.away, away: pair.home };
}

function emptyAccept(accepted: boolean, snapshot: ScoreSnapshot, finalised: boolean): ScoreAcceptResult {
  return { accepted, snapshot, events: [], degraded: false, gap: null, correction: false, finalised };
}

function isNormalizedRecord(raw: unknown): raw is NormalizedScoreRecord {
  return Boolean(raw && typeof raw === "object" && "snapshot" in raw && "finalised" in raw);
}

function team(id: string, name: string): Team {
  return {
    id,
    name,
    code: name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase(),
    flag: FLAGS[name.toLowerCase()] ?? "🏳️",
    rating: 75,
  };
}

function isFullMatchPeriod(period: string): boolean {
  const normalized = period.trim().toUpperCase();
  return !normalized || ["MATCH", "FT", "FULL_TIME", "REGULAR"].includes(normalized);
}

function numericLine(parameters: string): number | undefined {
  const match = parameters.match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : undefined;
}

function decimalPrice(value: number): number {
  return value >= 100 ? value / 100 : value;
}

function pctValue(value: unknown): number | null {
  if (typeof value === "string" && value.toUpperCase() === "NA") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / (parsed > 1 ? 100 : 1) : null;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "market";
}

function epochMs(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value;
}

function asObject(raw: unknown, label: string): JsonObject {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new PayloadValidationError(`${label} payload must be an object`);
  return raw as JsonObject;
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function value(object: JsonObject | undefined, ...names: string[]): unknown {
  if (!object) return undefined;
  const keys = new Map(Object.keys(object).map((key) => [normalizedKey(key), key]));
  for (const name of names) {
    const key = keys.get(normalizedKey(name));
    if (key !== undefined) return object[key];
  }
  return undefined;
}

function requiredValue(object: JsonObject, ...names: string[]): unknown {
  const result = value(object, ...names);
  if (result === undefined || result === null) throw new PayloadValidationError(`Missing required field ${names[0]}`);
  return result;
}

function requiredString(object: JsonObject, ...names: string[]): string {
  const result = requiredValue(object, ...names);
  if (typeof result !== "string" || result.length === 0) throw new PayloadValidationError(`${names[0]} must be a string`);
  return result;
}

function requiredStringOrNumber(object: JsonObject, ...names: string[]): string {
  const result = requiredValue(object, ...names);
  if (typeof result !== "string" && typeof result !== "number") throw new PayloadValidationError(`${names[0]} must be a string or number`);
  return String(result);
}

function requiredNumber(object: JsonObject, ...names: string[]): number {
  const result = requiredValue(object, ...names);
  const number = Number(result);
  if (!Number.isFinite(number)) throw new PayloadValidationError(`${names[0]} must be numeric`);
  return number;
}

function optionalString(object: JsonObject | undefined, ...names: string[]): string | undefined {
  const result = value(object, ...names);
  return typeof result === "string" ? result : undefined;
}

function optionalStringOrNumber(object: JsonObject | undefined, ...names: string[]): string | undefined {
  const result = value(object, ...names);
  return typeof result === "string" || typeof result === "number" ? String(result) : undefined;
}

function optionalNumber(object: JsonObject | undefined, ...names: string[]): number | undefined {
  const result = value(object, ...names);
  if (result === undefined || result === null || result === "") return undefined;
  const number = Number(result);
  return Number.isFinite(number) ? number : undefined;
}

function optionalBoolean(object: JsonObject | undefined, ...names: string[]): boolean | undefined {
  const result = value(object, ...names);
  if (typeof result === "boolean") return result;
  if (result === "true" || result === 1) return true;
  if (result === "false" || result === 0) return false;
  return undefined;
}

function optionalObject(object: JsonObject | undefined, ...names: string[]): JsonObject | undefined {
  const result = value(object, ...names);
  return result && typeof result === "object" && !Array.isArray(result) ? result as JsonObject : undefined;
}

function stringArray(raw: unknown, field: string): string[] {
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) {
    throw new PayloadValidationError(`${field} must be a string array`);
  }
  return raw as string[];
}

function numberArray(raw: unknown, field: string): number[] {
  if (!Array.isArray(raw)) throw new PayloadValidationError(`${field} must be a number array`);
  const numbers = raw.map(Number);
  if (numbers.some((item) => !Number.isFinite(item))) throw new PayloadValidationError(`${field} must be numeric`);
  return numbers;
}
