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

export class MemoryEventStore implements EventStore {
  private sessions = new Map<string, SessionRecord>();
  private ticks = new Map<string, StoredTick[]>();
  private cursors = new Map<string, StreamCursor>();
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
