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

const TEMPO_POLL_MS = 45_000;

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

class EngineManager {
  private engine: SweeperEngine | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private subscribers = new Set<Subscriber>();
  private liveFeed: LiveFeedHandle | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private tempoTimer: ReturnType<typeof setInterval> | null = null;

  async resolveFixture(fixtureId?: string, mode: "simulation" | "live" = "simulation"): Promise<Fixture> {
    if (mode === "live") {
      const src = new LiveSource();
      const all = await src.listFixtures();
      const requested = fixtureId ?? process.env.TXLINE_FIXTURE_ID ?? "18237038";
      const fixture = all.find((candidate) => candidate.id === requested);
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
    if (mode === "live") return this.startLive(engine);

    engine.step();
    while (!engine.isFinished && opts.startMinute !== undefined && (engine.getState().current?.minute ?? 0) < opts.startMinute) {
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
      const [scoreRecords, oddsRecords] = await Promise.all([
        source.getScoreRecords(engine.fixture),
        source.getOddsRecords(engine.fixture),
      ]);
      if (this.engine !== engine) return engine.getState();
      const assembler = new LiveTickAssembler(engine.fixture);
      const hydrationTick = assembler.hydrate(scoreRecords, oddsRecords);
      engine.ingest(hydrationTick, Date.now());
      updateHealth({
        hydratedScore: true,
        hydratedOdds: true,
        lastScoreAtMs: hydrationTick.upstream?.scoreTsMs ?? hydrationTick.tsMs,
        lastOddsAtMs: hydrationTick.upstream?.oddsTsMs ?? hydrationTick.tsMs,
        detail: "Snapshots hydrated; accepting TxLINE score and odds streams",
      });

      this.liveFeed = await openLiveMatchFeed(engine.fixture, {
        onAccepted: (kind) => updateHealth(kind === "score" ? { scoreStreamAccepted: true } : { oddsStreamAccepted: true }),
        onScore: (record) => {
          if (this.engine !== engine) return;
          const result = assembler.acceptScore(record);
          const patch: Partial<FeedHealth> = { lastScoreAtMs: Date.parse(record.snapshot.ts) };
          if (result.gap) Object.assign(patch, { status: "degraded", sequenceGap: result.gap });
          updateHealth(patch);
          if (result.tick) {
            engine.ingest(result.tick, Date.now());
            this.notify();
          }
        },
        onOdds: (raw) => {
          if (this.engine !== engine) return;
          const tick = assembler.acceptOdds(raw);
          if (!tick) return;
          updateHealth({ lastOddsAtMs: tick.upstream?.oddsTsMs ?? tick.tsMs });
          engine.ingest(tick, Date.now());
          this.notify();
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
      });
      void this.liveFeed.accepted.catch(() => undefined);
      this.heartbeatTimer = setInterval(() => {
        if (this.engine !== engine || engine.isFinished) return;
        const tick = assembler.heartbeat();
        if (tick) {
          engine.ingest(tick, Date.now());
          this.notify();
        }
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

function replayWindows(fixture: Fixture, config: EngineConfig, scenario?: ScenarioEvent[]) {
  return new MarketTickGenerator(fixture, config, scenario ?? []).plannedWindows();
}

// ── singleton (survives HMR) ──────────────────────────────────────────────────
const g = globalThis as unknown as { __sweeperManager?: EngineManager };
export function manager(): EngineManager {
  if (!g.__sweeperManager) g.__sweeperManager = new EngineManager();
  return g.__sweeperManager;
}
