/** TxLINE mainnet snapshots + reconnecting fixture-scoped SSE adapters. */
import type { FeedHealth } from "@/lib/engine/state";
import type { MarketTick } from "@/lib/market/ticks";
import {
  normalizeFixture,
  normalizeOddsRecords,
  normalizeScoreRecord,
  PayloadValidationError,
  ScoreSequence,
  type NormalizedScoreRecord,
} from "@/lib/txline/normalize";
import type { TxLineSource } from "@/lib/txline/source";
import type { Fixture, OddsSnapshot, ScoreSnapshot } from "@/lib/txline/types";
import { getApiToken, getGuestJwt, refreshJwt, txlineBase, txlineHeaders } from "@/lib/txline/auth";
import type { ReferencePricingModel } from "@/lib/pricing/types";
import { TxlineConsensusReference } from "@/lib/pricing/txline-consensus-reference";

const WORLD_CUP_COMPETITION_ID = process.env.TXLINE_COMPETITION_ID;
const HEARTBEAT_MS = 30_000;

export class TxlineHttpError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    detail: string,
  ) {
    super(`TxLINE ${path} returned ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "TxlineHttpError";
  }
}

export interface RequestDependencies {
  fetch: typeof fetch;
  headers(): Promise<Record<string, string>>;
  refresh(): Promise<void>;
}

const REQUEST_DEFAULTS: RequestDependencies = {
  fetch: globalThis.fetch,
  headers: txlineHeaders,
  refresh: refreshJwt,
};

/** One 401 refresh is allowed. A 403 is always surfaced as fatal config. */
export async function txlineGetJson<T>(
  path: string,
  dependencies: RequestDependencies = REQUEST_DEFAULTS,
): Promise<T> {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await dependencies.fetch(`${txlineBase()}${path}`, {
      headers: await dependencies.headers(),
      cache: "no-store",
    });
    if (response.status !== 401 || attempt === 1) break;
    await dependencies.refresh();
  }
  const body = await response!.text();
  if (!response!.ok) throw new TxlineHttpError(response!.status, path, safeDetail(body));
  try {
    if (response!.headers.get("content-type")?.toLowerCase().includes("text/event-stream") || body.trimStart().startsWith("data:")) {
      return parseSseDocument(body) as T;
    }
    return JSON.parse(body) as T;
  } catch {
    throw new PayloadValidationError(`TxLINE ${path} returned malformed JSON`);
  }
}

/** TxLINE historical currently returns a finite SSE document despite its JSON schema. */
export function parseSseDocument(body: string): unknown[] {
  const records: unknown[] = [];
  const frames = body.replace(/\r\n/g, "\n").split("\n\n");
  for (const frame of frames) {
    const lines = frame.split("\n");
    if (lines.some((line) => line.startsWith("event:") && line.slice(6).trim() === "heartbeat")) continue;
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (!data) continue;
    records.push(JSON.parse(data));
  }
  return records;
}

export class LiveSource implements TxLineSource {
  readonly mode = "live" as const;

  async listFixtures(): Promise<Fixture[]> {
    const startEpochDay = Math.floor(Date.now() / 86_400_000) - 1;
    const query = new URLSearchParams({ startEpochDay: String(startEpochDay) });
    if (WORLD_CUP_COMPETITION_ID) query.set("competitionId", WORLD_CUP_COMPETITION_ID);
    const raw = await txlineGetJson<unknown[]>(`/api/fixtures/snapshot?${query}`);
    if (!Array.isArray(raw)) throw new PayloadValidationError("Fixture snapshot must be an array");
    return raw.map(normalizeFixture).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  }

  async listHistoricalFixtures(fromMs = Date.now() - 14 * 86_400_000, toMs = Date.now() - 6 * 3_600_000): Promise<Fixture[]> {
    const query = new URLSearchParams({ startEpochDay: String(Math.floor(fromMs / 86_400_000)) });
    if (WORLD_CUP_COMPETITION_ID) query.set("competitionId", WORLD_CUP_COMPETITION_ID);
    const raw = await txlineGetJson<unknown[]>(`/api/fixtures/snapshot?${query}`);
    if (!Array.isArray(raw)) throw new PayloadValidationError("Fixture snapshot must be an array");
    return raw.map(normalizeFixture).filter((fixture) => {
      const kickoff = Date.parse(fixture.kickoff);
      return kickoff >= fromMs && kickoff <= toMs;
    });
  }

  async getFixture(id: string): Promise<Fixture | undefined> {
    return (await this.listFixtures()).find((fixture) => fixture.id === id);
  }

  async getScoreRecords(fixture: Fixture): Promise<NormalizedScoreRecord[]> {
    const raw = await txlineGetJson<unknown[]>(`/api/scores/snapshot/${fixture.id}`);
    if (!Array.isArray(raw)) throw new PayloadValidationError("Score snapshot must be an array");
    return raw.map((record) => normalizeScoreRecord(record, fixture)).sort((a, b) => a.snapshot.seq - b.snapshot.seq);
  }

  async getHistoricalScoreRecords(fixture: Fixture): Promise<NormalizedScoreRecord[]> {
    const raw = await txlineGetJson<unknown[]>(`/api/scores/historical/${fixture.id}`);
    if (!Array.isArray(raw)) throw new PayloadValidationError("Historical score response must be an array");
    return raw.map((record) => normalizeScoreRecord(record, fixture)).sort((a, b) => a.snapshot.seq - b.snapshot.seq);
  }

  async getOddsRecords(fixture: Fixture): Promise<unknown[]> {
    const raw = await txlineGetJson<unknown[]>(`/api/odds/snapshot/${fixture.id}`);
    if (!Array.isArray(raw)) throw new PayloadValidationError("Odds snapshot must be an array");
    // Runtime validation happens here, before any record can enter the engine.
    normalizeOddsRecords(raw, fixture, 0);
    return raw;
  }

  async getScoreSnapshot(fixture: Fixture): Promise<ScoreSnapshot> {
    const records = await this.getScoreRecords(fixture);
    const latest = records.at(-1);
    if (!latest) throw new PayloadValidationError(`No score snapshot exists for fixture ${fixture.id}`);
    return latest.snapshot;
  }

  async getOddsSnapshot(fixture: Fixture): Promise<OddsSnapshot> {
    return normalizeOddsRecords(await this.getOddsRecords(fixture), fixture, 0);
  }
}

export interface LiveTickResult {
  tick: MarketTick | null;
  gap: FeedHealth["sequenceGap"];
  correction: boolean;
  finalised: boolean;
}

/** Combines independently updating score and odds snapshots into MarketTicks. */
export class LiveTickAssembler {
  private readonly scores: ScoreSequence;
  private readonly pricing: ReferencePricingModel;
  private score: ScoreSnapshot | null = null;
  private odds: OddsSnapshot | null = null;
  private oddsRecords: unknown[] = [];
  private localSeq = 0;
  private lastTickTsMs = 0;
  private lastScoreEventId = "";
  private lastOddsEventId = "";

  constructor(private readonly fixture: Fixture, pricing: ReferencePricingModel = new TxlineConsensusReference()) {
    this.scores = new ScoreSequence(fixture);
    this.pricing = pricing;
  }

  hydrate(scoreRecords: NormalizedScoreRecord[], oddsRecords: unknown[]): MarketTick {
    const latest = scoreRecords.at(-1);
    if (!latest) throw new PayloadValidationError("Cannot hydrate live feed without a score snapshot");
    this.scores.seed(latest);
    this.score = latest.snapshot;
    this.localSeq = Math.max(0, latest.snapshot.seq);
    this.oddsRecords = oddsRecords.slice(-500);
    this.odds = normalizeOddsRecords(this.oddsRecords, this.fixture, this.localSeq);
    return this.buildTick([], Math.max(timestamp(this.score.ts), timestamp(this.odds.ts)));
  }

  acceptScore(record: NormalizedScoreRecord, eventId = ""): LiveTickResult {
    const result = this.scores.accept(record);
    if (!result.accepted || !result.snapshot) {
      return { tick: null, gap: result.gap, correction: false, finalised: result.finalised };
    }
    if (eventId) this.lastScoreEventId = eventId;
    this.score = result.snapshot;
    return {
      tick: this.odds ? this.buildTick(result.events, timestamp(result.snapshot.ts)) : null,
      gap: result.gap,
      correction: result.correction,
      finalised: result.finalised,
    };
  }

  acceptOdds(raw: unknown, eventId = ""): MarketTick | null {
    // Validate each frame before retaining it; malformed frames never mutate state.
    normalizeOddsRecords([raw], this.fixture, this.localSeq + 1);
    this.oddsRecords = [...this.oddsRecords, raw].slice(-500);
    if (eventId) this.lastOddsEventId = eventId;
    const next = normalizeOddsRecords(this.oddsRecords, this.fixture, this.localSeq + 1, this.odds ?? undefined);
    this.odds = next;
    return this.score ? this.buildTick([], timestamp(next.ts)) : null;
  }

  /** Replay authoritative records without stepping over an unresolved gap. */
  recoverScores(records: NormalizedScoreRecord[]): LiveTickResult {
    let latest: LiveTickResult = { tick: null, gap: null, correction: false, finalised: false };
    for (const record of [...records].sort((a, b) => a.snapshot.seq - b.snapshot.seq)) {
      const result = this.acceptScore(record);
      if (result.gap) return result;
      if (result.tick) latest = result;
    }
    return latest;
  }

  heartbeat(now = Date.now()): MarketTick | null {
    return this.score && this.odds ? this.buildTick([], now, true) : null;
  }

  private buildTick(events: MarketTick["events"], upstreamTsMs: number, heartbeat = false): MarketTick {
    const score = this.score!;
    const odds = this.odds!;
    const tsMs = Math.max(this.lastTickTsMs, upstreamTsMs);
    this.lastTickTsMs = tsMs;
    this.localSeq = Math.max(this.localSeq + 1, score.seq);
    const reference = this.pricing.update({ fixture: this.fixture, score, odds, events, tsMs });
    return {
      fixtureId: this.fixture.id,
      seq: this.localSeq,
      tsMs,
      minute: score.minute,
      phase: score.phase,
      score,
      suspended: odds.lifecycle?.suspended ?? false,
      odds: { ...odds, seq: this.localSeq },
      reference: reference.snapshot,
      pricing: reference.provenance,
      events,
      upstream: {
        scoreSeq: score.seq,
        scoreTsMs: timestamp(score.ts),
        oddsTsMs: timestamp(odds.ts),
        oddsMessageId: odds.upstream?.messageIds.at(-1),
        scoreEventId: this.lastScoreEventId || undefined,
        oddsEventId: this.lastOddsEventId || undefined,
        heartbeat,
      },
    };
  }
}

export type LiveStreamKind = "score" | "odds";

export interface LiveFeedHandlers {
  onScore(record: NormalizedScoreRecord, eventId?: string): void;
  onOdds(raw: unknown, eventId?: string): void;
  onAccepted?(kind: LiveStreamKind): void;
  onReconnect?(kind: LiveStreamKind, count: number): void;
  onMalformed?(kind: LiveStreamKind, error: unknown): void;
  onFatal?(kind: LiveStreamKind, error: unknown): void;
  onError?(kind: LiveStreamKind, error: unknown): void;
  onCursor?(kind: LiveStreamKind, eventId: string, reconnectCount: number): void;
  initialEventIds?: Partial<Record<LiveStreamKind, string>>;
}

export interface LiveFeedHandle {
  close(): void;
  /** Resolves only after both upstream requests return accepted SSE responses. */
  accepted: Promise<void>;
}

interface StreamDependencies {
  fetch: typeof fetch;
  token(): Promise<string>;
  jwt(): Promise<string>;
  refresh(): Promise<void>;
  wait(ms: number): Promise<void>;
}

const STREAM_DEFAULTS: StreamDependencies = {
  fetch: globalThis.fetch,
  token: getApiToken,
  jwt: getGuestJwt,
  refresh: refreshJwt,
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export async function openLiveMatchFeed(
  fixture: Fixture,
  handlers: LiveFeedHandlers,
  dependencies: StreamDependencies = STREAM_DEFAULTS,
): Promise<LiveFeedHandle> {
  const controller = new AbortController();
  const token = await dependencies.token();
  const accepted = new Set<LiveStreamKind>();
  let resolveAccepted!: () => void;
  let rejectAccepted!: (error: unknown) => void;
  const acceptedPromise = new Promise<void>((resolve, reject) => {
    resolveAccepted = resolve;
    rejectAccepted = reject;
  });

  const run = async (kind: LiveStreamKind) => {
    const path = `/api/${kind === "score" ? "scores" : "odds"}/stream?fixtureId=${fixture.id}`;
    let lastEventId = handlers.initialEventIds?.[kind] ?? "";
    let reconnects = 0;
    let failures = 0;
    while (!controller.signal.aborted) {
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${await dependencies.jwt()}`,
          "X-Api-Token": token,
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        };
        if (lastEventId) headers["Last-Event-ID"] = lastEventId;
        const response = await dependencies.fetch(`${txlineBase()}${path}`, { headers, signal: controller.signal });
        if (response.status === 401) {
          await dependencies.refresh();
          failures += 1;
          continue;
        }
        if (response.status === 403) {
          const error = new TxlineHttpError(403, path, "invalid token or level-12 access is missing");
          handlers.onFatal?.(kind, error);
          rejectAccepted(error);
          return;
        }
        if (!response.ok || !response.body) throw new TxlineHttpError(response.status, path, "SSE response was not accepted");

        failures = 0;
        accepted.add(kind);
        handlers.onAccepted?.(kind);
        if (accepted.size === 2) resolveAccepted();
        lastEventId = await consumeSse(response.body, lastEventId, (json, eventId) => {
          try {
            if (kind === "score") handlers.onScore(normalizeScoreRecord(json, fixture), eventId);
            else {
              normalizeOddsRecords([json], fixture, 0);
              handlers.onOdds(json, eventId);
            }
          } catch (error) {
            handlers.onMalformed?.(kind, error);
          }
        }, (id) => {
          lastEventId = id;
          handlers.onCursor?.(kind, id, reconnects);
        });
        if (controller.signal.aborted) return;
        reconnects += 1;
        handlers.onReconnect?.(kind, reconnects);
      } catch (error) {
        if (controller.signal.aborted) return;
        failures += 1;
        reconnects += 1;
        handlers.onError?.(kind, error);
        handlers.onReconnect?.(kind, reconnects);
      }
      await dependencies.wait(Math.min(30_000, 500 * 2 ** Math.min(failures, 6)));
    }
  };

  void run("score");
  void run("odds");
  return { close: () => controller.abort(), accepted: acceptedPromise };
}

/** Parse a WHATWG stream and return the latest SSE id for Last-Event-ID. */
export async function consumeSse(
  body: ReadableStream<Uint8Array>,
  initialId: string,
  onData: (json: unknown, eventId: string) => void,
  onId?: (id: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let latestId = initialId;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const lines = frame.split("\n");
      const id = lines.find((line) => line.startsWith("id:"));
      if (id) {
        latestId = id.slice(3).trim();
        onId?.(latestId);
      }
      const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
      if (event === "heartbeat") continue;
      const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (!data) continue;
      try {
        onData(JSON.parse(data), latestId);
      } catch {
        onData(undefined, latestId);
      }
    }
  }
  return latestId;
}

export { HEARTBEAT_MS };

function timestamp(iso: string): number {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : Date.now();
}

function safeDetail(body: string): string {
  // Never echo long upstream bodies, bearer tokens, or HTML error documents.
  return body.replace(/txoracle_api_[A-Za-z0-9_-]+/g, "[redacted]").replace(/\s+/g, " ").slice(0, 180);
}
