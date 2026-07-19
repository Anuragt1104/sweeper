/**
 * EngineManager — the server-side session singleton.
 *
 * Owns at most one *live* autonomous session (driven by a timer that calls
 * engine.step() on an interval) and fans its state out to SSE subscribers. Also
 * runs throwaway *replay* sessions to completion for the replay lab without
 * touching the live session. Persisted on globalThis so Next.js HMR in dev
 * doesn't spawn duplicates.
 */
import { fixtureById, getFixtures, featuredFixtureId } from "@/lib/data/worldcup";
import { resolveConfig, type DeepPartial, type EngineConfig } from "@/lib/engine/config";
import { SweeperEngine } from "@/lib/engine/engine";
import type { EngineState } from "@/lib/engine/state";
import { MarketTickGenerator, type ScenarioEvent } from "@/lib/market/ticks";
import type { Fixture } from "@/lib/txline/types";
import { HEARTBEAT_MS, LiveSource, LiveTickAssembler, openLiveMatchFeed, type LiveFeedHandle } from "@/lib/txline/live";
import type { FeedHealth } from "@/lib/engine/state";
import {
  apiFootballConfigured,
  fetchTempoSnapshot,
  resolveApiFootballFixtureId,
} from "@/lib/tempo/api-football";
import type { StreamCursor, SupervisorStatus } from "@/lib/engine/state";
import type { EventStore, SessionRecord } from "@/lib/persistence/event-store";
import { eventStore } from "@/lib/persistence/runtime-store";
import { createHash } from "node:crypto";
import { loadFrequencyArtifact } from "@/lib/horizon/artifact";
import {
  TxlineSettlementVerifier,
  TXLINE_SETTLEMENT_STAT_KEYS,
  type SettlementVerification,
} from "@/lib/proof/txline-settlement-verifier";
import type { NormalizedScoreRecord } from "@/lib/txline/normalize";

const TEMPO_POLL_MS = 45_000;
// A football session cannot truthfully be resumed indefinitely. Besides being
// stale, replaying an orphaned all-day odds stream can exhaust a small runtime
// before the server becomes ready.
export const RECOVERY_MAX_AGE_MS = 6 * 60 * 60_000;

export interface StartOptions {
  fixtureId?: string;
  mode?: "simulation" | "live";
  config?: DeepPartial<EngineConfig>;
  scenario?: ScenarioEvent[];
  /** Fast-forward a deterministic replay before the live timer begins. */
  startMinute?: number;
}

export interface ReplayResult {
  state: EngineState;
  /** per-agent full equity series for the comparison chart. */
  series: { agentId: string; name: string; kind: string; equity: number[] }[];
  /** ground-truth injected anomaly windows. */
  windows: { kind: string; startMinute: number; endMinute: number }[];
}

type Subscriber = (s: EngineState) => void;

export class EngineManager {
  private engine: SweeperEngine | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private subscribers = new Set<Subscriber>();
  private liveFeed: LiveFeedHandle | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private tempoTimer: ReturnType<typeof setInterval> | null = null;
  private ingestChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: EventStore = eventStore(),
    private readonly now: () => number = Date.now,
  ) {}

  async resolveFixture(fixtureId?: string, mode: "simulation" | "live" = "simulation"): Promise<Fixture> {
    if (mode === "live") {
      const src = new LiveSource();
      const all = await src.listFixtures();
      const requested = fixtureId
        ?? process.env.TXLINE_FIXTURE_ID
        ?? process.env.TXLINE_WATCH_FIXTURE_IDS?.split(",").map((id) => id.trim()).find(Boolean);
      const fixture = requested ? all.find((candidate) => candidate.id === requested) : undefined;
      if (fixture) return fixture;
      if (fixtureId) throw new Error(`TxLINE fixture ${fixtureId} was not found in the active schedule window`);
      if (!all[0]) throw new Error("TxLINE returned no fixtures in the active schedule window");
      return all[0];
    }
    if (fixtureId) {
      const f = fixtureById(fixtureId);
      if (f) return f;
    }
    return fixtureById(featuredFixtureId()) ?? getFixtures()[0];
  }

  async start(opts: StartOptions = {}): Promise<EngineState> {
    this.stop();
    const mode = opts.mode ?? (process.env.TXLINE_MODE === "live" ? "live" : "simulation");
    const fixture = await this.resolveFixture(opts.fixtureId, mode);
    const config = resolveConfig(opts.config);
    const engine = new SweeperEngine(fixture, config, mode, opts.scenario ?? []);
    this.engine = engine;
    if (mode === "live") {
      await this.store.createSession(this.sessionRecord(engine, "running"));
      return this.startLive(engine);
    }

    if (opts.startMinute !== undefined) {
      // Silent path warm-start from kickoff, then first trading ingest.
      engine.warmFeaturesUntil(opts.startMinute);
      if (!engine.isFinished) engine.step();
    } else {
      engine.step();
    }
    this.notify();

    // Drive ticks. The closure is bound to THIS engine, so a concurrent start()
    // that supersedes it makes the stale timer self-clear instead of double-stepping.
    this.clearTimer();
    const handle = setInterval(() => {
      if (this.engine !== engine) {
        clearInterval(handle);
        return;
      }
      const more = engine.step();
      this.notify();
      if (!more) clearInterval(handle);
    }, config.tickIntervalMs);
    this.timer = handle;
    return engine.getState();
  }

  stop(): void {
    this.clearTimer();
    this.liveFeed?.close();
    this.liveFeed = null;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.tempoTimer) {
      clearInterval(this.tempoTimer);
      this.tempoTimer = null;
    }
  }

  private clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getState(): EngineState | null {
    return this.engine?.getState() ?? null;
  }

  getEngine(): SweeperEngine | null {
    return this.engine;
  }

  setSupervisorStatus(status: SupervisorStatus): void {
    this.engine?.setSupervisorStatus(status);
    this.notify();
  }

  async anchor(): Promise<EngineState | null> {
    if (!this.engine) return null;
    await this.engine.anchor();
    this.notify();
    return this.engine.getState();
  }

  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  private notify() {
    if (!this.engine) return;
    const state = this.engine.getState();
    for (const cb of this.subscribers) {
      try {
        cb(state);
      } catch {
        /* drop dead subscriber silently */
      }
    }
  }

  private queuePersistedIngest(engine: SweeperEngine, tick: Parameters<SweeperEngine["ingest"]>[0], processedAtMs = Date.now()) {
    this.ingestChain = this.ingestChain.then(async () => {
      if (this.engine !== engine) return;
      const stored = await this.store.appendTick(engine.sessionId, tick, processedAtMs);
      if (!stored) return;
      const firstLedgerSeq = engine.getLedger().size();
      engine.ingest(tick, processedAtMs);
      await this.store.appendLedgerRecords(
        engine.sessionId,
        engine.getLedger().entriesSince(firstLedgerSeq),
      );
      const state = engine.getState();
      await this.store.markTickProcessed(stored.id, state);
      await this.store.updateSession(this.sessionRecord(
        engine,
        state.status === "finished"
          ? (engine.mode === "simulation" ? "completed" : "settling")
          : "running",
      ));
      this.notify();
    }).catch((error) => {
      if (this.engine !== engine) return;
      engine.setFeedHealth({
        ...engine.getState().feedHealth,
        status: "offline",
        detail: `Durable ingestion failed: ${error instanceof Error ? error.message : "unknown error"}`,
        fatal: true,
      });
      this.notify();
    });
  }

  private queueSettlementVerification(engine: SweeperEngine, finalRecord: NormalizedScoreRecord) {
    this.ingestChain = this.ingestChain.then(async () => {
      if (this.engine !== engine) return;
      const existingSupervisor = engine.getState().supervisor;
      if (existingSupervisor) {
        engine.setSupervisorStatus({
          ...existingSupervisor,
          state: "settling",
          detail: "Validating final TxLINE record against the mainnet daily score root",
          updatedAtMs: Date.now(),
        });
      }
      const verifier = new TxlineSettlementVerifier();
      let verification: SettlementVerification | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        verification = await verifier.verify({
          fixture: engine.fixture,
          finalRecord,
          observedScore: finalRecord.snapshot.goals,
        });
        if (verification.verified || !verification.retryable) break;
        await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
      }
      if (!verification) throw new Error("Settlement verifier produced no result");
      engine.applySettlementVerification(verification);
      const proof = verification.txlineSettlementProof;
      await this.store.saveProofReceipt({
        sessionId: engine.sessionId,
        fixtureId: engine.fixture.id,
        finalSequence: finalRecord.snapshot.seq,
        statKeys: [...TXLINE_SETTLEMENT_STAT_KEYS],
        responseHash: proof?.responseHash ?? "",
        rootPda: proof?.dailyRootPda ?? "",
        verified: verification.verified,
        failureCode: verification.failureCode,
        receipt: verification,
      });
      const anchor = await engine.anchor();
      if (anchor) {
        await this.store.saveLedgerAnchor({
          sessionId: engine.sessionId,
          localRoot: anchor.root,
          network: process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet",
          signature: anchor.sig,
          explorerUrl: anchor.url,
        });
      }
      const state = engine.getState();
      if (state.supervisor) {
        engine.setSupervisorStatus({
          ...state.supervisor,
          state: "completed",
          detail: verification.verified ? "Settlement proof verified" : `Settlement held: ${verification.failureCode}`,
          updatedAtMs: Date.now(),
        });
      }
      await this.store.updateSession(this.sessionRecord(engine, "completed"));
      this.notify();
    }).catch((error) => {
      const state = engine.getState();
      if (state.supervisor) {
        engine.setSupervisorStatus({
          ...state.supervisor,
          state: "failed",
          detail: error instanceof Error ? error.message : "Settlement verification failed",
          updatedAtMs: Date.now(),
        });
      }
      void this.store.updateSession(this.sessionRecord(engine, "failed"));
      this.notify();
    });
  }

  async recoverUnfinished(): Promise<EngineState | null> {
    const session = await this.store.loadUnfinishedSession();
    if (!session) return null;
    if (this.now() - session.startedAtMs > RECOVERY_MAX_AGE_MS) {
      await this.store.updateSession({
        ...session,
        status: "failed",
        completedAtMs: this.now(),
      });
      return null;
    }
    const fixture = await this.resolveFixture(session.fixtureId, "live");
    const engine = new SweeperEngine(
      fixture,
      session.configuration,
      "live",
      [],
      loadFrequencyArtifact(),
      session.sessionId,
    );
    this.engine = engine;
    await recoverTicksIntoEngine(engine, this.store, session);
    await this.store.updateSession(this.sessionRecord(engine, "running"));
    return this.startLive(engine);
  }

  private sessionRecord(
    engine: SweeperEngine,
    status: SessionRecord["status"],
  ): SessionRecord {
    const state = engine.getState();
    return {
      sessionId: engine.sessionId,
      fixtureId: engine.fixture.id,
      competitionId: engine.fixture.competitionId ?? null,
      provenance: state.provenance,
      executionMode: state.executionMode,
      configuration: engine.config,
      artifactHash: createHash("sha256").update(JSON.stringify(loadFrequencyArtifact())).digest("hex"),
      status,
      startedAtMs: state.startedAtMs || Date.now(),
      completedAtMs: status === "completed" ? Date.now() : null,
      latestState: state,
      ledgerRoot: state.ledger.root,
    };
  }

  private async startLive(engine: SweeperEngine): Promise<EngineState> {
    const source = new LiveSource();
    let health: FeedHealth = {
      status: "connecting",
      detail: "Hydrating TxLINE score and odds snapshots",
      watching: 1,
      scoreStreamAccepted: false,
      oddsStreamAccepted: false,
      hydratedScore: false,
      hydratedOdds: false,
      lastScoreAtMs: null,
      lastOddsAtMs: null,
      reconnectCount: 0,
      sequenceGap: null,
      fatal: false,
    };
    const updateHealth = (patch: Partial<FeedHealth>) => {
      if (this.engine !== engine) return;
      health = { ...health, ...patch };
      if (health.status !== "offline" && health.hydratedScore && health.hydratedOdds && health.scoreStreamAccepted && health.oddsStreamAccepted) {
        health.status = health.sequenceGap ? "degraded" : "live";
        health.detail = health.sequenceGap
          ? `Sequence gap ${health.sequenceGap.expected}→${health.sequenceGap.received}; waiting for authoritative continuity`
          : engine.getState().horizon.missingRequiredMarket
            ? "Both TxLINE streams live; usable full-match 1X2 is absent — trading agents standing down"
            : "Hydrated and receiving both fixture-scoped TxLINE streams";
      }
      engine.setFeedHealth(health);
      this.notify();
    };
    engine.setFeedHealth(health);

    try {
      const [scoreRecords, oddsRecords, historicalScores] = await Promise.all([
        source.getScoreRecords(engine.fixture),
        source.getOddsRecords(engine.fixture),
        source.getHistoricalScoreRecords(engine.fixture).catch(() => [] as Awaited<ReturnType<LiveSource["getHistoricalScoreRecords"]>>),
      ]);
      if (this.engine !== engine) return engine.getState();
      const assembler = new LiveTickAssembler(engine.fixture);
      const hydrationTick = assembler.hydrate(scoreRecords, oddsRecords);

      // Seed path features from score history + frozen current odds (no fills).
      if (historicalScores.length > 1) {
        const { ticksFromHistoricalScores } = await import("@/lib/market/warm-ticks");
        const warmTicks = ticksFromHistoricalScores(
          engine.fixture,
          historicalScores,
          hydrationTick.odds,
        );
        const warmed = engine.warmFeaturesFromTicks(warmTicks);
        if (warmed > 0) {
          updateHealth({
            detail: `Warmed ${warmed} path ticks from TxLINE score history; hydrating live streams`,
          });
        }
      }

      const hydrated = await this.store.appendTick(engine.sessionId, hydrationTick, Date.now());
      if (hydrated) {
        engine.ingest(hydrationTick, hydrated.processedAtMs);
        await this.store.markTickProcessed(hydrated.id, engine.getState());
      }
      updateHealth({
        hydratedScore: true,
        hydratedOdds: true,
        lastScoreAtMs: hydrationTick.upstream?.scoreTsMs ?? hydrationTick.tsMs,
        lastOddsAtMs: hydrationTick.upstream?.oddsTsMs ?? hydrationTick.tsMs,
        detail: "Snapshots hydrated; accepting TxLINE score and odds streams",
      });

      const storedCursors = await this.store.loadCursors(engine.fixture.id);
      const initialEventIds = Object.fromEntries(
        storedCursors.map((cursor) => [cursor.kind, cursor.lastEventId]),
      );
      let recoveringGap = false;
      const recoverGap = async () => {
        if (recoveringGap) return;
        recoveringGap = true;
        try {
          const records = await source.getHistoricalScoreRecords(engine.fixture);
          let unresolved: FeedHealth["sequenceGap"] = health.sequenceGap;
          for (const record of records) {
            const recovered = assembler.acceptScore(record);
            if (recovered.gap) {
              unresolved = recovered.gap;
              continue;
            }
            if (recovered.tick) this.queuePersistedIngest(engine, recovered.tick, Date.now());
            unresolved = null;
          }
          updateHealth(unresolved
            ? { status: "degraded", sequenceGap: unresolved, detail: "Authoritative rehydration did not restore score continuity" }
            : { sequenceGap: null, detail: "Authoritative score continuity restored" });
        } catch (error) {
          updateHealth({
            status: "degraded",
            detail: `Score gap rehydration failed: ${error instanceof Error ? error.message : "unknown error"}`,
          });
        } finally {
          recoveringGap = false;
        }
      };

      this.liveFeed = await openLiveMatchFeed(engine.fixture, {
        initialEventIds,
        onAccepted: (kind) => updateHealth(kind === "score" ? { scoreStreamAccepted: true } : { oddsStreamAccepted: true }),
        onScore: (record, eventId) => {
          if (this.engine !== engine) return;
          const result = assembler.acceptScore(record, eventId);
          const patch: Partial<FeedHealth> = { lastScoreAtMs: Date.parse(record.snapshot.ts) };
          if (result.gap) {
            Object.assign(patch, { status: "degraded", sequenceGap: result.gap });
            void recoverGap();
          }
          updateHealth(patch);
          if (result.tick) {
            this.queuePersistedIngest(engine, result.tick, Date.now());
            if (result.finalised) this.queueSettlementVerification(engine, record);
          }
        },
        onOdds: (raw, eventId) => {
          if (this.engine !== engine) return;
          const tick = assembler.acceptOdds(raw, eventId);
          if (!tick) return;
          updateHealth({ lastOddsAtMs: tick.upstream?.oddsTsMs ?? tick.tsMs });
          this.queuePersistedIngest(engine, tick, Date.now());
        },
        onReconnect: (_kind, count) => updateHealth({
          status: health.status === "connecting" ? "connecting" : "degraded",
          detail: "Upstream reconnect in progress; resuming with Last-Event-ID",
          reconnectCount: Math.max(health.reconnectCount, count),
        }),
        onMalformed: (kind) => updateHealth({ status: "degraded", detail: `Malformed ${kind} frame rejected by runtime validation` }),
        onError: (kind, error) => updateHealth({
          status: "degraded",
          detail: `${kind} stream interrupted: ${error instanceof Error ? error.message : "connection error"}`,
        }),
        onFatal: (_kind, error) => updateHealth({
          status: "offline",
          detail: error instanceof Error ? error.message : "TxLINE configuration rejected",
          fatal: true,
        }),
        onCursor: (kind, eventId, reconnectCount) => {
          const cursor: StreamCursor = {
            fixtureId: engine.fixture.id,
            kind,
            lastEventId: eventId,
            reconnectCount,
            updatedAtMs: Date.now(),
          };
          void this.store.saveCursor(cursor);
        },
      });
      void this.liveFeed.accepted.catch(() => undefined);
      this.heartbeatTimer = setInterval(() => {
        if (this.engine !== engine || engine.isFinished) return;
        const tick = assembler.heartbeat();
        if (tick) this.queuePersistedIngest(engine, tick, Date.now());
      }, HEARTBEAT_MS);

      void this.startTempoEnrichment(engine);
    } catch (error) {
      updateHealth({
        status: "offline",
        detail: error instanceof Error ? error.message : "TxLINE hydration failed",
        fatal: true,
      });
    }
    return engine.getState();
  }

  /** Optional API-Football shots/SOT poller — UI enrichment only. */
  private async startTempoEnrichment(engine: SweeperEngine): Promise<void> {
    if (!apiFootballConfigured()) {
      engine.setTempoStatus("unavailable", "Set API_FOOTBALL_KEY to enable live shots / SOT", "none");
      this.notify();
      return;
    }

    engine.setTempoStatus("polling", "Resolving API-Football fixture…", "api-football");
    this.notify();

    let apiFixtureId: number | null = null;
    try {
      apiFixtureId = await resolveApiFootballFixtureId(engine.fixture);
    } catch (error) {
      engine.setTempoStatus(
        "error",
        error instanceof Error ? error.message : "API-Football fixture resolve failed",
        "api-football",
      );
      this.notify();
      return;
    }

    if (!apiFixtureId) {
      engine.setTempoStatus("unavailable", "No API-Football fixture match for this TxLINE game", "api-football");
      this.notify();
      return;
    }

    const poll = async () => {
      if (this.engine !== engine || engine.isFinished) return;
      try {
        const minute = engine.getState().current?.minute;
        const snap = await fetchTempoSnapshot(engine.fixture, apiFixtureId!, minute);
        if (this.engine !== engine || !snap) return;
        engine.applyTempo(snap);
        this.notify();
      } catch (error) {
        engine.setTempoStatus(
          "error",
          error instanceof Error ? error.message : "API-Football stats poll failed",
          "api-football",
        );
        this.notify();
      }
    };

    await poll();
    this.tempoTimer = setInterval(() => {
      void poll();
    }, TEMPO_POLL_MS);
  }

  /** Run a throwaway session to completion (replay lab). */
  async runReplay(opts: StartOptions = {}): Promise<ReplayResult> {
    const mode = opts.mode ?? "simulation";
    const fixture = await this.resolveFixture(opts.fixtureId, mode);
    const config = resolveConfig(opts.config);
    const engine = new SweeperEngine(fixture, config, mode, opts.scenario ?? []);
    const state = engine.runToCompletion();
    const series = state.agents.map((a) => ({
      agentId: a.id,
      name: a.name,
      kind: a.kind,
      equity: a.curve,
    }));
    // recompute planned windows from a fresh generator view
    return { state, series, windows: replayWindows(fixture, config, opts.scenario) };
  }
}

type RecoveryStore = Pick<
  EventStore,
  "listTicksPage" | "appendLedgerRecords" | "markTickProcessed"
>;

type RecoverableEngine = Pick<SweeperEngine, "ingest" | "getLedger" | "getState">;

/**
 * Rebuild one deterministic engine without materialising an entire session.
 * Processed rows are verified at their stored boundary; pending rows resume
 * only after that root matches.
 */
export async function recoverTicksIntoEngine(
  engine: RecoverableEngine,
  store: RecoveryStore,
  session: SessionRecord,
  pageSize = 100,
): Promise<void> {
  let afterId: string | null = null;
  let pendingStarted = false;

  while (true) {
    const page = await store.listTicksPage(session.sessionId, afterId, pageSize);
    if (page.length === 0) break;
    for (const stored of page) {
      if (stored.processingStatus === "pending" && !pendingStarted) {
        assertRecoveryRoot(engine, session);
        pendingStarted = true;
      } else if (stored.processingStatus === "processed" && pendingStarted) {
        throw new Error(`Processed tick ${stored.id} follows a pending recovery tick`);
      }

      const firstLedgerSeq = engine.getLedger().size();
      engine.ingest(stored.tick, stored.processedAtMs);
      await store.appendLedgerRecords(
        session.sessionId,
        engine.getLedger().entriesSince(firstLedgerSeq),
      );
      if (stored.processingStatus === "pending") {
        await store.markTickProcessed(stored.id, engine.getState());
      }
    }
    afterId = page[page.length - 1].id;
  }

  if (!pendingStarted) assertRecoveryRoot(engine, session);
}

function assertRecoveryRoot(engine: RecoverableEngine, session: SessionRecord): void {
  if (session.ledgerRoot && engine.getLedger().root() !== session.ledgerRoot) {
    throw new Error(`Recovery ledger root mismatch for ${session.sessionId}`);
  }
}

function replayWindows(fixture: Fixture, config: EngineConfig, scenario?: ScenarioEvent[]) {
  return new MarketTickGenerator(fixture, config, scenario ?? []).plannedWindows();
}

// ── singleton (survives HMR) ──────────────────────────────────────────────────
const g = globalThis as unknown as { __sweeperManager?: EngineManager };
export function manager(): EngineManager {
  if (!g.__sweeperManager) g.__sweeperManager = new EngineManager();
  return g.__sweeperManager;
}
