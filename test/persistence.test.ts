import assert from "node:assert/strict";
import test from "node:test";
import { fixtureById, getFixtures } from "../lib/data/worldcup";
import { resolveConfig } from "../lib/engine/config";
import { SweeperEngine } from "../lib/engine/engine";
import { EngineManager, RECOVERY_MAX_AGE_MS, recoverTicksIntoEngine } from "../lib/engine/manager";
import type { SessionRecord, StoredTick } from "../lib/persistence/event-store";
import { AuditLedger } from "../lib/proof/ledger";
import { MarketTickGenerator } from "../lib/market/ticks";
import { MemoryEventStore } from "../lib/persistence/memory-event-store";
import { selectFixture } from "../lib/supervisor/fixture-supervisor";
import type { Fixture } from "../lib/txline/types";

test("event store inserts ticks idempotently and persists state with cursors", async () => {
  const fixture = fixtureById("wc26-a-md2-arg-pol") ?? getFixtures()[0];
  const config = resolveConfig({ seed: 17 });
  const engine = new SweeperEngine(fixture, config, "simulation", [], undefined, "session-fixed");
  const tick = new MarketTickGenerator(fixture, config).at(0);
  const store = new MemoryEventStore();
  const lock = await store.tryAcquireSupervisorLock();
  assert.ok(lock);
  assert.equal(await store.tryAcquireSupervisorLock(), null);
  await lock.release();
  assert.ok(await store.tryAcquireSupervisorLock());
  await store.createSession({
    sessionId: engine.sessionId,
    fixtureId: fixture.id,
    competitionId: fixture.competitionId ?? null,
    provenance: "simulation",
    executionMode: "simulated",
    configuration: config,
    artifactHash: "artifact",
    status: "running",
    startedAtMs: tick.tsMs,
    completedAtMs: null,
    latestState: null,
    ledgerRoot: "",
  });

  const stored = await store.appendTick(engine.sessionId, tick, tick.tsMs);
  assert.ok(stored);
  assert.equal(await store.appendTick(engine.sessionId, tick, tick.tsMs), null);
  engine.ingest(tick, tick.tsMs);
  await store.markTickProcessed(stored.id, engine.getState());
  assert.equal((await store.listTicks(engine.sessionId))[0].processingStatus, "processed");
  assert.equal((await store.loadSession(engine.sessionId))?.ledgerRoot, engine.getState().ledger.root);

  await store.saveCursor({ fixtureId: fixture.id, kind: "odds", lastEventId: "odds-9", reconnectCount: 2, updatedAtMs: 9 });
  assert.equal((await store.loadCursors(fixture.id))[0].lastEventId, "odds-9");
});

test("event store pages ticks and archives ledger entries for historical proofs", async () => {
  const fixture = fixtureById("wc26-a-md2-arg-pol") ?? getFixtures()[0];
  const config = resolveConfig({ seed: 19 });
  const engine = new SweeperEngine(fixture, config, "live", [], undefined, "paged-session");
  const store = new MemoryEventStore();
  await store.createSession({
    sessionId: engine.sessionId,
    fixtureId: fixture.id,
    competitionId: fixture.competitionId ?? null,
    provenance: "live",
    executionMode: "shadow",
    configuration: config,
    artifactHash: "artifact",
    status: "running",
    startedAtMs: 1,
    completedAtMs: null,
    latestState: null,
    ledgerRoot: "",
  });

  const generator = new MarketTickGenerator(fixture, config);
  for (let index = 0; index < 205; index += 1) {
    const tick = generator.at(index);
    await store.appendTick(engine.sessionId, tick, tick.tsMs);
  }

  const first = await store.listTicksPage(engine.sessionId, null, 100);
  const second = await store.listTicksPage(engine.sessionId, first.at(-1)!.id, 100);
  const third = await store.listTicksPage(engine.sessionId, second.at(-1)?.id ?? first.at(-1)!.id, 100);
  assert.equal(first.length, 100);
  assert.ok(second.length <= 100);
  assert.equal(first.length + second.length + third.length, (await store.listTicks(engine.sessionId)).length);

  const tick = generator.at(0);
  engine.ingest(tick, tick.tsMs);
  const entries = engine.getLedger().entriesSince(0);
  await store.appendLedgerRecords(engine.sessionId, entries);
  const oldest = await store.loadLedgerRecord(engine.sessionId, 0);
  assert.equal(oldest?.record.seq, 0);
  assert.deepEqual(await store.listLedgerLeafHashes(engine.sessionId), entries.map((entry) => entry.leafHash));
});

test("replaying stored ticks with the original session identity reproduces the ledger root", () => {
  const fixture = fixtureById("wc26-a-md2-arg-pol") ?? getFixtures()[0];
  const config = resolveConfig({ seed: 23 });
  const ticks = new MarketTickGenerator(fixture, config);
  const first = new SweeperEngine(fixture, config, "simulation", [], undefined, "recovered-session");
  const second = new SweeperEngine(fixture, config, "simulation", [], undefined, "recovered-session");
  for (let index = 0; index < 12; index += 1) {
    const tick = ticks.at(index);
    first.ingest(tick, tick.tsMs);
    second.ingest(structuredClone(tick), tick.tsMs);
  }
  assert.equal(second.getState().ledger.root, first.getState().ledger.root);
});

test("6,000 processed ticks recover in pages with the identical bounded-ledger root", async () => {
  const tickCount = Number(process.env.SWEEPER_RECOVERY_TEST_TICKS ?? 6_000);
  const fixture = fixtureById("wc26-a-md2-arg-pol") ?? getFixtures()[0];
  const config = resolveConfig({ seed: 31 });
  const base = new MarketTickGenerator(fixture, config).at(0);
  const ticks: StoredTick[] = [];
  class RecoveryHarness {
    readonly sessionId = "large-live-session";
    private readonly ledger = new AuditLedger({ maxFullRecords: 256 });
    ingest(tick: typeof base, processedAtMs?: number) {
      void processedAtMs;
      this.ledger.append("tick", tick.seq, tick.tsMs, `tick ${tick.seq}`, { seq: tick.seq });
      return true;
    }
    getLedger() { return this.ledger; }
    getState(): never { throw new Error("processed-only recovery must not materialize EngineState per tick"); }
  }
  const source = new RecoveryHarness();
  for (let index = 0; index < tickCount; index += 1) {
    const tick = structuredClone(base);
    tick.seq = index;
    tick.tsMs += index * 1_000;
    tick.minute = index / 60;
    tick.upstream = {
      ...tick.upstream,
      scoreSeq: index,
      scoreTsMs: tick.upstream?.scoreTsMs ?? tick.tsMs,
      oddsTsMs: tick.upstream?.oddsTsMs ?? tick.tsMs,
    };
    source.ingest(tick, tick.tsMs);
    ticks.push({
      id: String(index + 1),
      sessionId: source.sessionId,
      idempotencyHash: String(index),
      tick,
      processedAtMs: tick.tsMs,
      processingStatus: "processed",
    });
  }
  const sourceRoot = source.getLedger().root();
  const session: SessionRecord = {
    sessionId: source.sessionId,
    fixtureId: fixture.id,
    competitionId: fixture.competitionId ?? null,
    provenance: "live",
    executionMode: "shadow",
    configuration: config,
    artifactHash: "artifact",
    status: "running",
    startedAtMs: base.tsMs,
    completedAtMs: null,
    latestState: null,
    ledgerRoot: sourceRoot,
  };
  let pageCalls = 0;
  const store = {
    async listTicksPage(_sessionId: string, afterId: string | null, limit: number) {
      pageCalls += 1;
      const start = afterId === null ? 0 : Number(afterId);
      return ticks.slice(start, start + limit);
    },
    async appendLedgerRecords() {},
    async markTickProcessed() { throw new Error("processed rows must not be marked again"); },
  };
  const recovered = new RecoveryHarness();
  await recoverTicksIntoEngine(recovered, store, session, 100);

  assert.equal(recovered.getLedger().root(), sourceRoot);
  assert.equal(recovered.getLedger().retainedRecordCount(), 256);
  assert.equal(pageCalls, Math.ceil(tickCount / 100) + 1);
});

test("recovery abandons stale sessions before loading their tick history", async () => {
  const fixture = fixtureById("wc26-a-md2-arg-pol") ?? getFixtures()[0];
  const config = resolveConfig({ seed: 29 });
  const now = Date.parse("2026-07-19T12:00:00.000Z");
  const store = new MemoryEventStore();
  await store.createSession({
    sessionId: "stale-live-session",
    fixtureId: fixture.id,
    competitionId: fixture.competitionId ?? null,
    provenance: "live",
    executionMode: "shadow",
    configuration: config,
    artifactHash: "artifact",
    status: "running",
    startedAtMs: now - RECOVERY_MAX_AGE_MS - 1,
    completedAtMs: null,
    latestState: null,
    ledgerRoot: "",
  });

  const manager = new EngineManager(store, () => now);
  assert.equal(await manager.recoverUnfinished(), null);
  const abandoned = await store.loadSession("stale-live-session");
  assert.equal(abandoned?.status, "failed");
  assert.equal(abandoned?.completedAtMs, now);
});

test("fixture selection honors queued kickoff order and World Cup competition scope", () => {
  const now = Date.now();
  const fixture = (id: string, offset: number, competitionId: string, competition = "World Cup"): Fixture => ({
    id,
    competitionId,
    competition,
    stage: "Final",
    home: { id: "h", name: "Home", code: "HOM", flag: "", rating: 80 },
    away: { id: "a", name: "Away", code: "AWY", flag: "", rating: 80 },
    kickoff: new Date(now + offset).toISOString(),
    venue: "",
    status: "scheduled",
  });
  const fixtures = [
    fixture("friendly", 1_000, "friendly", "International Friendly"),
    fixture("18257739", 7_000, "wc"),
    fixture("18257865", 5_000, "wc"),
  ];
  const selected = selectFixture(fixtures, {
    nowMs: now,
    watchIds: ["18257739", "18257865"],
    competitionId: null,
  });
  assert.equal(selected.fixture?.id, "18257865");
  assert.equal(selected.nextFixtureId, "18257739");

  const fallback = selectFixture(fixtures, {
    nowMs: now,
    watchIds: ["stale"],
    competitionId: "wc",
  });
  assert.notEqual(fallback.fixture?.id, "friendly");
});
