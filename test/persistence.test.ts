import assert from "node:assert/strict";
import test from "node:test";
import { fixtureById, getFixtures } from "../lib/data/worldcup";
import { resolveConfig } from "../lib/engine/config";
import { SweeperEngine } from "../lib/engine/engine";
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
