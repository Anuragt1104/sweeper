import { createHash } from "node:crypto";
import type { EngineState, ExecutionMode, RecordingSummary, RunProvenance, StreamCursor } from "@/lib/engine/state";
import type { EngineConfig } from "@/lib/engine/config";
import type { MarketTick } from "@/lib/market/ticks";

export interface SessionRecord {
  sessionId: string;
  fixtureId: string;
  competitionId: string | null;
  provenance: RunProvenance;
  executionMode: ExecutionMode;
  configuration: EngineConfig;
  artifactHash: string;
  status: "running" | "settling" | "completed" | "failed";
  startedAtMs: number;
  completedAtMs: number | null;
  latestState: EngineState | null;
  ledgerRoot: string;
}

export interface StoredTick {
  id: string;
  sessionId: string;
  idempotencyHash: string;
  tick: MarketTick;
  processedAtMs: number;
  processingStatus: "pending" | "processed";
}

export interface ProofReceiptRecord {
  sessionId: string;
  fixtureId: string;
  finalSequence: number;
  statKeys: number[];
  responseHash: string;
  rootPda: string;
  verified: boolean;
  failureCode: string | null;
  receipt: unknown;
}

export interface LedgerAnchorRecord {
  sessionId: string;
  localRoot: string;
  network: string;
  signature: string;
  explorerUrl: string;
}

export interface SupervisorLock {
  release(): Promise<void>;
}

export interface EventStore {
  isReady(): Promise<boolean>;
  tryAcquireSupervisorLock(): Promise<SupervisorLock | null>;
  createSession(session: SessionRecord): Promise<void>;
  updateSession(session: SessionRecord): Promise<void>;
  loadUnfinishedSession(): Promise<SessionRecord | null>;
  loadCompetitionId(): Promise<string | null>;
  appendTick(sessionId: string, tick: MarketTick, processedAtMs: number): Promise<StoredTick | null>;
  markTickProcessed(id: string, state: EngineState): Promise<void>;
  listTicks(sessionId: string): Promise<StoredTick[]>;
  saveCursor(cursor: StreamCursor): Promise<void>;
  loadCursors(fixtureId: string): Promise<StreamCursor[]>;
  saveProofReceipt(receipt: ProofReceiptRecord): Promise<void>;
  saveLedgerAnchor(anchor: LedgerAnchorRecord): Promise<void>;
  listRecordings(): Promise<RecordingSummary[]>;
  loadSession(sessionId: string): Promise<SessionRecord | null>;
}

export function tickIdempotencyHash(tick: MarketTick): string {
  return createHash("sha256").update(canonical({
    fixtureId: tick.fixtureId,
    scoreSeq: tick.upstream?.scoreSeq,
    scoreEventId: tick.upstream?.scoreEventId,
    oddsEventId: tick.upstream?.oddsEventId,
    oddsMessageId: tick.upstream?.oddsMessageId,
    score: tick.score,
    odds: tick.odds,
    events: tick.events,
  })).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}
