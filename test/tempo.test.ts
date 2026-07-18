import assert from "node:assert/strict";
import test from "node:test";
import { getFixtures } from "../lib/data/worldcup";
import { resolveConfig } from "../lib/engine/config";
import { MarketTickGenerator } from "../lib/market/ticks";
import { ShockStripAssembler } from "../lib/tempo/strip";
import { diffTempo } from "../lib/tempo/diff";
import { materialSeverity, tempoSeverity } from "../lib/tempo/severity";
import { nameScore } from "../lib/tempo/api-football";
import type { TempoSnapshot } from "../lib/tempo/types";

test("diffTempo emits SOT then remaining shots", () => {
  const snap: TempoSnapshot = {
    fixtureId: "f1",
    minute: 20,
    tsMs: 1,
    source: "sim",
    counts: { shots: { home: 3, away: 1 }, sot: { home: 2, away: 0 } },
  };
  const events = diffTempo(null, snap);
  assert.equal(events.filter((e) => e.kind === "shot_on_target" && e.side === "home").length, 2);
  assert.equal(events.filter((e) => e.kind === "shot" && e.side === "home").length, 1);
  assert.equal(events.filter((e) => e.side === "away").length, 1);
});

test("severity ranks goal above tempo shot", () => {
  assert.ok(materialSeverity("goal", 40) > tempoSeverity("shot_on_target", 40));
  assert.ok(materialSeverity("red", 80) > materialSeverity("yellow", 80));
  assert.ok(materialSeverity("goal", 88) >= materialSeverity("goal", 20));
});

test("nameScore matches club aliases softly", () => {
  assert.ok(nameScore("Paris Saint-Germain", "Paris Saint Germain") > 0.8);
  assert.ok(nameScore("FC Barcelona", "Barcelona") >= 0.85);
  assert.ok(nameScore("Arsenal", "Chelsea") < 0.3);
});

test("sim ticks feed dual-track shock strip without Horizon coupling", () => {
  const fixture = getFixtures()[0];
  const gen = new MarketTickGenerator(fixture, resolveConfig({ seed: 3, tickMinutes: 1 }));
  const strip = new ShockStripAssembler();

  for (let i = 0; i < 50; i++) {
    const tick = gen.at(i);
    assert.ok(tick.tempo, "sim ticks carry tempo snapshots");
    strip.ingestTick(tick);
  }

  const state = strip.getState();
  assert.ok(state.tempo.series.length > 5);
  assert.equal(state.tempo.source, "sim");
  assert.equal(state.tempo.status, "ready");
  assert.ok(state.tempo.latest!.shots.home + state.tempo.latest!.shots.away > 0);
  // Material spikes only from TxLINE-shaped events
  assert.ok(state.material.every((s) => s.track === "material"));
  assert.ok(state.tempo.markers.every((s) => s.track === "tempo"));
});
