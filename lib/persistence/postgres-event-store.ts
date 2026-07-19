import { Pool, type PoolClient } from "pg";
import { PUBLIC_SCHEMA_VERSION, type EngineState, type RecordingSummary, type StreamCursor } from "@/lib/engine/state";
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
import type { EngineConfig } from "@/lib/engine/config";
import type { LedgerEntry, LedgerKind } from "@/lib/proof/ledger";

const LOCK_NAME = "sweeper-fixture-supervisor-v2";

export class PostgresEventStore implements EventStore {
  private readonly pool: Pool;

  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error("DATABASE_URL is required for PostgresEventStore");
    this.pool = new Pool({ connectionString, max: 8 });
  }

  async isReady(): Promise<boolean> {
    try {
      const result = await this.pool.query<{ ok: number }>("SELECT 1 AS ok");
      return result.rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }

  async tryAcquireSupervisorLock(): Promise<SupervisorLock | null> {
    const client = await this.pool.connect();
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [LOCK_NAME],
    );
    if (!result.rows[0]?.acquired) {
      client.release();
      return null;
    }
    return new PostgresSupervisorLock(client);
  }

  async createSession(session: SessionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO sweeper_sessions (
        session_id, schema_version, fixture_id, competition_id, provenance, execution_mode,
        configuration, artifact_hash, status, started_at_ms, completed_at_ms,
        latest_state, ledger_root
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (session_id) DO NOTHING`,
      sessionValues(session),
    );
  }

  async updateSession(session: SessionRecord): Promise<void> {
    await this.pool.query(
      `UPDATE sweeper_sessions SET
        fixture_id=$3, competition_id=$4, provenance=$5, execution_mode=$6, configuration=$7,
        artifact_hash=$8, status=$9, started_at_ms=$10, completed_at_ms=$11,
        latest_state=$12, ledger_root=$13, updated_at=now()
      WHERE session_id=$1 AND schema_version=$2`,
      sessionValues(session),
    );
  }

  async loadUnfinishedSession(): Promise<SessionRecord | null> {
    const result = await this.pool.query(
      `SELECT * FROM sweeper_sessions
       WHERE status IN ('running','settling') ORDER BY started_at_ms DESC LIMIT 1`,
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async loadCompetitionId(): Promise<string | null> {
    const result = await this.pool.query<{ competition_id: string | null }>(
      `SELECT competition_id FROM sweeper_sessions
       WHERE competition_id IS NOT NULL ORDER BY started_at_ms DESC LIMIT 1`,
    );
    return result.rows[0]?.competition_id ?? null;
  }

  async appendTick(sessionId: string, tick: MarketTick, processedAtMs: number): Promise<StoredTick | null> {
    const hash = tickIdempotencyHash(tick);
    const result = await this.pool.query(
      `INSERT INTO sweeper_ingested_ticks (
        session_id, fixture_id, schema_version, idempotency_hash, tick,
        upstream_score_seq, score_event_id, odds_event_id, processed_at_ms
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (session_id, idempotency_hash) DO NOTHING
      RETURNING *`,
      [
        sessionId,
        tick.fixtureId,
        PUBLIC_SCHEMA_VERSION,
        hash,
        tick,
        tick.upstream?.scoreSeq ?? null,
        tick.upstream?.scoreEventId ?? null,
        tick.upstream?.oddsEventId ?? null,
        processedAtMs,
      ],
    );
    return result.rows[0] ? mapTick(result.rows[0]) : null;
  }

  async markTickProcessed(id: string, state: EngineState): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const tick = await client.query<{ session_id: string }>(
        `UPDATE sweeper_ingested_ticks SET processing_status='processed', processed_at=now()
         WHERE id=$1 RETURNING session_id`,
        [id],
      );
      const sessionId = tick.rows[0]?.session_id;
      if (!sessionId) throw new Error(`Stored tick ${id} does not exist`);
      await client.query(
        `UPDATE sweeper_sessions SET latest_state=$2, ledger_root=$3, updated_at=now()
         WHERE session_id=$1`,
        [sessionId, state, state.ledger.root],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listTicks(sessionId: string): Promise<StoredTick[]> {
    const result = await this.pool.query(
      "SELECT * FROM sweeper_ingested_ticks WHERE session_id=$1 ORDER BY id",
      [sessionId],
    );
    return result.rows.map(mapTick);
  }

  async listTicksPage(sessionId: string, afterId: string | null, limit: number): Promise<StoredTick[]> {
    const result = await this.pool.query(
      `SELECT * FROM sweeper_ingested_ticks
       WHERE session_id=$1 AND ($2::bigint IS NULL OR id > $2::bigint)
       ORDER BY id LIMIT $3`,
      [sessionId, afterId, Math.max(1, Math.min(limit, 1_000))],
    );
    return result.rows.map(mapTick);
  }

  async appendLedgerRecords(sessionId: string, records: LedgerEntry[]): Promise<void> {
    if (records.length === 0) return;
    const rows = records.map((entry) => ({
      seq: entry.record.seq,
      tick_seq: entry.record.tick,
      ts_ms: entry.record.tsMs,
      kind: entry.record.kind,
      summary: entry.record.summary,
      payload: entry.record.payload,
      reacted_to_hash: entry.record.reactedToHash ?? null,
      record_hash: entry.record.hash,
      canonical_leaf: entry.leaf,
      leaf_hash: entry.leafHash,
    }));
    await this.pool.query(
      `INSERT INTO sweeper_ledger_records (
         session_id, seq, tick_seq, ts_ms, kind, summary, payload,
         reacted_to_hash, record_hash, canonical_leaf, leaf_hash
       )
       SELECT $1, x.seq, x.tick_seq, x.ts_ms, x.kind, x.summary, x.payload,
              x.reacted_to_hash, x.record_hash, x.canonical_leaf, x.leaf_hash
       FROM jsonb_to_recordset($2::jsonb) AS x(
         seq bigint, tick_seq bigint, ts_ms bigint, kind text, summary text,
         payload jsonb, reacted_to_hash text, record_hash text,
         canonical_leaf text, leaf_hash text
       )
       ON CONFLICT (session_id, seq) DO NOTHING`,
      [sessionId, JSON.stringify(rows)],
    );
  }

  async loadLedgerRecord(sessionId: string, seq: number): Promise<LedgerEntry | null> {
    const result = await this.pool.query(
      "SELECT * FROM sweeper_ledger_records WHERE session_id=$1 AND seq=$2",
      [sessionId, seq],
    );
    return result.rows[0] ? mapLedgerEntry(result.rows[0]) : null;
  }

  async listLedgerLeafHashes(sessionId: string): Promise<string[]> {
    const result = await this.pool.query<{ leaf_hash: string }>(
      "SELECT leaf_hash FROM sweeper_ledger_records WHERE session_id=$1 ORDER BY seq",
      [sessionId],
    );
    return result.rows.map((row) => row.leaf_hash);
  }

  async saveCursor(cursor: StreamCursor): Promise<void> {
    await this.pool.query(
      `INSERT INTO sweeper_stream_cursors (
        fixture_id, stream_kind, last_event_id, reconnect_count, updated_at_ms
      ) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (fixture_id, stream_kind) DO UPDATE SET
        last_event_id=excluded.last_event_id,
        reconnect_count=excluded.reconnect_count,
        updated_at_ms=excluded.updated_at_ms`,
      [cursor.fixtureId, cursor.kind, cursor.lastEventId, cursor.reconnectCount, cursor.updatedAtMs],
    );
  }

  async loadCursors(fixtureId: string): Promise<StreamCursor[]> {
    const result = await this.pool.query(
      "SELECT * FROM sweeper_stream_cursors WHERE fixture_id=$1 ORDER BY stream_kind",
      [fixtureId],
    );
    return result.rows.map((row) => ({
      fixtureId: row.fixture_id,
      kind: row.stream_kind,
      lastEventId: row.last_event_id,
      reconnectCount: row.reconnect_count,
      updatedAtMs: toNumber(row.updated_at_ms),
    }));
  }

  async saveProofReceipt(receipt: ProofReceiptRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO sweeper_proof_receipts (
        session_id, fixture_id, final_sequence, stat_keys, response_hash,
        root_pda, verified, failure_code, receipt
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        receipt.sessionId, receipt.fixtureId, receipt.finalSequence, receipt.statKeys,
        receipt.responseHash, receipt.rootPda, receipt.verified, receipt.failureCode, receipt.receipt,
      ],
    );
  }

  async saveLedgerAnchor(anchor: LedgerAnchorRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO sweeper_ledger_anchors (
        session_id, local_root, network, signature, explorer_url
      ) VALUES ($1,$2,$3,$4,$5)`,
      [anchor.sessionId, anchor.localRoot, anchor.network, anchor.signature, anchor.explorerUrl],
    );
  }

  async listRecordings(): Promise<RecordingSummary[]> {
    const result = await this.pool.query(
      `SELECT s.session_id, s.fixture_id, s.latest_state, s.started_at_ms, s.completed_at_ms,
              count(t.id)::int AS tick_count,
              coalesce(bool_or(p.verified), false) AS proof_verified
       FROM sweeper_sessions s
       LEFT JOIN sweeper_ingested_ticks t ON t.session_id=s.session_id
       LEFT JOIN sweeper_proof_receipts p ON p.session_id=s.session_id
       WHERE s.status='completed'
       GROUP BY s.session_id ORDER BY s.completed_at_ms DESC`,
    );
    return result.rows.map((row) => ({
      sessionId: row.session_id,
      fixtureId: row.fixture_id,
      match: row.latest_state
        ? `${row.latest_state.fixture.home} v ${row.latest_state.fixture.away}`
        : row.fixture_id,
      startedAtMs: toNumber(row.started_at_ms),
      completedAtMs: row.completed_at_ms === null ? null : toNumber(row.completed_at_ms),
      tickCount: Number(row.tick_count),
      proofVerified: Boolean(row.proof_verified),
    }));
  }

  async loadSession(sessionId: string): Promise<SessionRecord | null> {
    const result = await this.pool.query("SELECT * FROM sweeper_sessions WHERE session_id=$1", [sessionId]);
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }
}

class PostgresSupervisorLock implements SupervisorLock {
  constructor(private client: PoolClient) {}

  async release(): Promise<void> {
    const client = this.client;
    this.client = null as unknown as PoolClient;
    if (!client) return;
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_NAME]);
    } finally {
      client.release();
    }
  }
}

function sessionValues(session: SessionRecord): unknown[] {
  return [
    session.sessionId,
    PUBLIC_SCHEMA_VERSION,
    session.fixtureId,
    session.competitionId,
    session.provenance,
    session.executionMode,
    session.configuration,
    session.artifactHash,
    session.status,
    session.startedAtMs,
    session.completedAtMs,
    session.latestState,
    session.ledgerRoot,
  ];
}

interface SessionRow {
  schema_version: number | string;
  session_id: string;
  fixture_id: string;
  competition_id: string | null;
  provenance: SessionRecord["provenance"];
  execution_mode: SessionRecord["executionMode"];
  configuration: EngineConfig;
  artifact_hash: string;
  status: SessionRecord["status"];
  started_at_ms: number | string;
  completed_at_ms: number | string | null;
  latest_state: EngineState | null;
  ledger_root: string;
}

interface TickRow {
  schema_version: number | string;
  id: number | string;
  session_id: string;
  idempotency_hash: string;
  tick: MarketTick;
  processed_at_ms: number | string;
  processing_status: StoredTick["processingStatus"];
}

interface LedgerRow {
  seq: number | string;
  tick_seq: number | string;
  ts_ms: number | string;
  kind: LedgerKind;
  summary: string;
  payload: unknown;
  reacted_to_hash: string | null;
  record_hash: string;
  canonical_leaf: string;
  leaf_hash: string;
}

function mapSession(row: SessionRow): SessionRecord {
  if (Number(row.schema_version) !== PUBLIC_SCHEMA_VERSION) {
    throw new Error(`Unsupported stored schema version ${row.schema_version}`);
  }
  return {
    sessionId: row.session_id,
    fixtureId: row.fixture_id,
    competitionId: row.competition_id,
    provenance: row.provenance,
    executionMode: row.execution_mode,
    configuration: row.configuration,
    artifactHash: row.artifact_hash,
    status: row.status,
    startedAtMs: toNumber(row.started_at_ms),
    completedAtMs: row.completed_at_ms === null ? null : toNumber(row.completed_at_ms),
    latestState: row.latest_state,
    ledgerRoot: row.ledger_root,
  };
}

function mapTick(row: TickRow): StoredTick {
  if (Number(row.schema_version) !== PUBLIC_SCHEMA_VERSION) {
    throw new Error(`Unsupported stored tick schema version ${row.schema_version}`);
  }
  return {
    id: String(row.id),
    sessionId: row.session_id,
    idempotencyHash: row.idempotency_hash,
    tick: row.tick as MarketTick,
    processedAtMs: toNumber(row.processed_at_ms),
    processingStatus: row.processing_status,
  };
}

function mapLedgerEntry(row: LedgerRow): LedgerEntry {
  return {
    record: {
      seq: toNumber(row.seq),
      tick: toNumber(row.tick_seq),
      tsMs: toNumber(row.ts_ms),
      kind: row.kind,
      summary: row.summary,
      payload: row.payload,
      reactedToHash: row.reacted_to_hash ?? undefined,
      hash: row.record_hash,
    },
    leaf: row.canonical_leaf,
    leafHash: row.leaf_hash,
  };
}

function toNumber(value: string | number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`Unsafe stored integer ${value}`);
  return result;
}
