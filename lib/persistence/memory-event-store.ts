import type { EngineState, RecordingSummary, StreamCursor } from "@/lib/engine/state";
import {
  tickIdempotencyHash,
  type EventStore,
  type LedgerAnchorRecord,
  type ProofReceiptRecord,
  type SessionRecord,
  type StoredTick,
  type SupervisorLock,
} from "@/lib/persistence/event-store";
import type { MarketTick } from "@/lib/market/ticks";
import type { LedgerEntry } from "@/lib/proof/ledger";

export class MemoryEventStore implements EventStore {
  private sessions = new Map<string, SessionRecord>();
  private ticks = new Map<string, StoredTick[]>();
  private cursors = new Map<string, StreamCursor>();
  private ledgerRecords = new Map<string, Map<number, LedgerEntry>>();
  private receipts: ProofReceiptRecord[] = [];
  private anchors: LedgerAnchorRecord[] = [];
  private locked = false;
  private nextId = 1;

  async isReady(): Promise<boolean> {
    return true;
  }

  async tryAcquireSupervisorLock(): Promise<SupervisorLock | null> {
    if (this.locked) return null;
    this.locked = true;
    return { release: async () => { this.locked = false; } };
  }

  async createSession(session: SessionRecord): Promise<void> {
    if (!this.sessions.has(session.sessionId)) this.sessions.set(session.sessionId, structuredClone(session));
  }

  async updateSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.sessionId, structuredClone(session));
  }

  async loadUnfinishedSession(): Promise<SessionRecord | null> {
    return [...this.sessions.values()]
      .filter((session) => session.status === "running" || session.status === "settling")
      .sort((a, b) => b.startedAtMs - a.startedAtMs)
      .map((session) => structuredClone(session))[0] ?? null;
  }

  async loadCompetitionId(): Promise<string | null> {
    return [...this.sessions.values()]
      .sort((a, b) => b.startedAtMs - a.startedAtMs)
      .find((session) => session.competitionId)?.competitionId ?? null;
  }

  async appendTick(sessionId: string, tick: MarketTick, processedAtMs: number): Promise<StoredTick | null> {
    const idempotencyHash = tickIdempotencyHash(tick);
    const records = this.ticks.get(sessionId) ?? [];
    if (records.some((record) => record.idempotencyHash === idempotencyHash)) return null;
    const stored: StoredTick = {
      id: String(this.nextId++),
      sessionId,
      idempotencyHash,
      tick: structuredClone(tick),
      processedAtMs,
      processingStatus: "pending",
    };
    records.push(stored);
    this.ticks.set(sessionId, records);
    return structuredClone(stored);
  }

  async markTickProcessed(id: string, state: EngineState): Promise<void> {
    for (const records of this.ticks.values()) {
      const record = records.find((candidate) => candidate.id === id);
      if (!record) continue;
      record.processingStatus = "processed";
      const session = this.sessions.get(record.sessionId);
      if (session) {
        session.latestState = structuredClone(state);
        session.ledgerRoot = state.ledger.root;
      }
      return;
    }
    throw new Error(`Stored tick ${id} does not exist`);
  }

  async listTicks(sessionId: string): Promise<StoredTick[]> {
    return structuredClone(this.ticks.get(sessionId) ?? []);
  }

  async listTicksPage(sessionId: string, afterId: string | null, limit: number): Promise<StoredTick[]> {
    const after = afterId === null ? -1 : Number(afterId);
    return structuredClone((this.ticks.get(sessionId) ?? [])
      .filter((tick) => Number(tick.id) > after)
      .slice(0, Math.max(1, limit)));
  }

  async appendLedgerRecords(sessionId: string, records: LedgerEntry[]): Promise<void> {
    const stored = this.ledgerRecords.get(sessionId) ?? new Map<number, LedgerEntry>();
    for (const entry of records) {
      const existing = stored.get(entry.record.seq);
      if (existing && existing.leafHash !== entry.leafHash) {
        throw new Error(`Ledger record conflict at ${sessionId}:${entry.record.seq}`);
      }
      stored.set(entry.record.seq, structuredClone(entry));
    }
    this.ledgerRecords.set(sessionId, stored);
  }

  async loadLedgerRecord(sessionId: string, seq: number): Promise<LedgerEntry | null> {
    const entry = this.ledgerRecords.get(sessionId)?.get(seq);
    return entry ? structuredClone(entry) : null;
  }

  async listLedgerLeafHashes(sessionId: string): Promise<string[]> {
    return [...(this.ledgerRecords.get(sessionId)?.values() ?? [])]
      .sort((a, b) => a.record.seq - b.record.seq)
      .map((entry) => entry.leafHash);
  }

  async saveCursor(cursor: StreamCursor): Promise<void> {
    this.cursors.set(`${cursor.fixtureId}:${cursor.kind}`, structuredClone(cursor));
  }

  async loadCursors(fixtureId: string): Promise<StreamCursor[]> {
    return [...this.cursors.values()]
      .filter((cursor) => cursor.fixtureId === fixtureId)
      .map((cursor) => structuredClone(cursor));
  }

  async saveProofReceipt(receipt: ProofReceiptRecord): Promise<void> {
    this.receipts.push(structuredClone(receipt));
  }

  async saveLedgerAnchor(anchor: LedgerAnchorRecord): Promise<void> {
    this.anchors.push(structuredClone(anchor));
  }

  async listRecordings(): Promise<RecordingSummary[]> {
    return [...this.sessions.values()]
      .filter((session) => session.status === "completed")
      .map((session) => ({
        sessionId: session.sessionId,
        fixtureId: session.fixtureId,
        match: session.latestState
          ? `${session.latestState.fixture.home} v ${session.latestState.fixture.away}`
          : session.fixtureId,
        startedAtMs: session.startedAtMs,
        completedAtMs: session.completedAtMs,
        tickCount: this.ticks.get(session.sessionId)?.length ?? 0,
        proofVerified: this.receipts.some((receipt) => receipt.sessionId === session.sessionId && receipt.verified),
      }));
  }

  async loadSession(sessionId: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(sessionId);
    return session ? structuredClone(session) : null;
  }
}
