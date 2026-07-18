import type { SupervisorStatus } from "@/lib/engine/state";
import { EngineManager, manager } from "@/lib/engine/manager";
import type { EventStore, SupervisorLock } from "@/lib/persistence/event-store";
import { eventStore } from "@/lib/persistence/runtime-store";
import { LiveSource } from "@/lib/txline/live";
import type { Fixture } from "@/lib/txline/types";

const DEFAULT_WATCH_IDS = ["18257865", "18257739"];
const POLL_MS = 5 * 60_000;
const LOCK_RETRY_MS = 15_000;
const START_EARLY_MS = 30 * 60_000;
const WINDOW_PAST_MS = 3 * 60 * 60_000;
const WINDOW_FUTURE_MS = 36 * 60 * 60_000;

export class FixtureSupervisor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lockRetryTimer: ReturnType<typeof setInterval> | null = null;
  private lock: SupervisorLock | null = null;
  private polling = false;
  private completedIds = new Set<string>();
  private competitionId: string | null = null;
  private status: SupervisorStatus = {
    state: "booting",
    detail: "Supervisor has not started",
    activeFixtureId: null,
    nextFixtureId: null,
    competitionId: null,
    updatedAtMs: Date.now(),
  };

  constructor(
    private readonly engineManager: EngineManager = manager(),
    private readonly store: EventStore = eventStore(),
    private readonly source: Pick<LiveSource, "listFixtures"> = new LiveSource(),
    private readonly now: () => number = Date.now,
  ) {}

  async start(): Promise<void> {
    if (this.lock) return;
    this.setStatus({ state: "booting", detail: "Acquiring the production supervisor lock" });
    this.lock = await this.store.tryAcquireSupervisorLock();
    if (!this.lock) {
      // Rolling deploys: previous replica still holds the lock. Stay healthy and retry.
      this.setStatus({
        state: "standby",
        detail: "Standby: waiting for production supervisor lock",
      });
      this.startLockRetry();
      return;
    }
    await this.runAsLeader();
  }

  async stop(): Promise<void> {
    this.clearLockRetry();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.engineManager.stop();
    await this.releaseLock();
    this.setStatus({ state: "completed", detail: "Supervisor stopped" });
  }

  getStatus(): SupervisorStatus {
    return { ...this.status };
  }

  private startLockRetry(): void {
    if (this.lockRetryTimer) return;
    this.lockRetryTimer = setInterval(() => {
      void this.tryPromote();
    }, LOCK_RETRY_MS);
  }

  private clearLockRetry(): void {
    if (this.lockRetryTimer) clearInterval(this.lockRetryTimer);
    this.lockRetryTimer = null;
  }

  private async tryPromote(): Promise<void> {
    if (this.lock) {
      this.clearLockRetry();
      return;
    }
    this.lock = await this.store.tryAcquireSupervisorLock();
    if (!this.lock) return;
    this.clearLockRetry();
    await this.runAsLeader();
  }

  private async runAsLeader(): Promise<void> {
    try {
      this.competitionId = await this.store.loadCompetitionId();
      const recovered = await this.engineManager.recoverUnfinished();
      if (recovered) {
        this.setStatus({
          state: "watching",
          detail: `Recovered session ${recovered.sessionId}`,
          activeFixtureId: recovered.fixture.id,
          competitionId: recovered.fixture.competitionId ?? this.competitionId,
        });
      } else {
        await this.poll();
      }
      if (!this.timer) {
        this.timer = setInterval(() => {
          void this.poll();
        }, POLL_MS);
      }
    } catch (error) {
      this.setStatus({
        state: "failed",
        detail: error instanceof Error ? error.message : "Supervisor startup failed",
      });
      await this.releaseLock();
    }
  }

  private async poll(): Promise<void> {
    if (this.polling || !this.lock) return;
    this.polling = true;
    try {
      const active = this.engineManager.getState();
      if (active?.status === "running") {
        this.setStatus({
          state: "watching",
          detail: `Watching ${active.fixture.home} v ${active.fixture.away}`,
          activeFixtureId: active.fixture.id,
          competitionId: active.fixture.competitionId ?? this.competitionId,
        });
        return;
      }
      if (active?.status === "finished") {
        this.completedIds.add(active.fixture.id);
        this.setStatus({
          state: "completed",
          detail: `Completed fixture ${active.fixture.id}`,
          activeFixtureId: null,
        });
      }

      const fixtures = await this.source.listFixtures();
      const selection = selectFixture(fixtures, {
        nowMs: this.now(),
        watchIds: configuredWatchIds(),
        competitionId: this.competitionId,
        completedIds: this.completedIds,
      });
      if (!selection.fixture) {
        this.setStatus({
          state: "awaiting_fixture",
          detail: selection.reason,
          activeFixtureId: null,
          nextFixtureId: null,
        });
        return;
      }
      this.competitionId = selection.fixture.competitionId ?? this.competitionId;
      const kickoffMs = Date.parse(selection.fixture.kickoff);
      if (kickoffMs - this.now() > START_EARLY_MS) {
        this.setStatus({
          state: "awaiting_fixture",
          detail: `Selected ${selection.fixture.home.name} v ${selection.fixture.away.name}; connecting 30 minutes before kickoff`,
          activeFixtureId: null,
          nextFixtureId: selection.fixture.id,
          competitionId: this.competitionId,
        });
        return;
      }

      this.setStatus({
        state: "connecting",
        detail: `Hydrating fixture ${selection.fixture.id}`,
        activeFixtureId: selection.fixture.id,
        nextFixtureId: selection.nextFixtureId,
        competitionId: this.competitionId,
      });
      const state = await this.engineManager.start({ fixtureId: selection.fixture.id, mode: "live" });
      this.setStatus({
        state: "watching",
        detail: `Watching ${state.fixture.home} v ${state.fixture.away}`,
        activeFixtureId: state.fixture.id,
        nextFixtureId: selection.nextFixtureId,
        competitionId: this.competitionId,
      });
    } catch (error) {
      this.setStatus({
        state: "failed",
        detail: error instanceof Error ? error.message : "Fixture polling failed",
      });
    } finally {
      this.polling = false;
    }
  }

  private setStatus(patch: Partial<SupervisorStatus> & Pick<SupervisorStatus, "state" | "detail">): void {
    this.status = {
      ...this.status,
      ...patch,
      competitionId: patch.competitionId === undefined ? this.competitionId : patch.competitionId,
      updatedAtMs: this.now(),
    };
    this.engineManager.setSupervisorStatus(this.status);
  }

  private async releaseLock() {
    const lock = this.lock;
    this.lock = null;
    await lock?.release();
  }
}

export interface FixtureSelectionOptions {
  nowMs: number;
  watchIds: string[];
  competitionId: string | null;
  completedIds?: Set<string>;
}

export function selectFixture(
  fixtures: Fixture[],
  options: FixtureSelectionOptions,
): { fixture: Fixture | null; nextFixtureId: string | null; reason: string } {
  const completed = options.completedIds ?? new Set<string>();
  const eligible = fixtures.filter((fixture) => {
    const kickoff = Date.parse(fixture.kickoff);
    return Number.isFinite(kickoff)
      && kickoff >= options.nowMs - WINDOW_PAST_MS
      && kickoff <= options.nowMs + WINDOW_FUTURE_MS
      && !completed.has(fixture.id);
  });
  const queued = options.watchIds
    .map((id) => eligible.find((fixture) => fixture.id === id))
    .filter((fixture): fixture is Fixture => Boolean(fixture))
    .filter((fixture) => !options.competitionId || fixture.competitionId === options.competitionId)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  const scoped = eligible
    .filter((fixture) => options.competitionId
      ? fixture.competitionId === options.competitionId
      : /world cup/i.test(`${fixture.competition} ${fixture.stage}`))
    .sort((a, b) => Math.abs(Date.parse(a.kickoff) - options.nowMs) - Math.abs(Date.parse(b.kickoff) - options.nowMs));
  const ordered = queued.length ? queued : scoped;
  return {
    fixture: ordered[0] ?? null,
    nextFixtureId: ordered[1]?.id ?? null,
    reason: ordered.length ? "fixture selected" : "No eligible World Cup fixture in the -3h/+36h window",
  };
}

function configuredWatchIds(): string[] {
  const raw = process.env.TXLINE_WATCH_FIXTURE_IDS;
  return (raw ? raw.split(",") : DEFAULT_WATCH_IDS).map((id) => id.trim()).filter(Boolean);
}

export { DEFAULT_WATCH_IDS, POLL_MS };
