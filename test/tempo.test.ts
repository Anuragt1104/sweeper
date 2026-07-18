import assert from "node:assert/strict";
import test from "node:test";
import { getFixtures } from "../lib/data/worldcup";
import { resolveConfig } from "../lib/engine/config";
import { MarketTickGenerator } from "../lib/market/ticks";
import { HorizonMachine } from "../lib/horizon/machine";
import { ShockStripAssembler } from "../lib/tempo/strip";
import { diffTempo } from "../lib/tempo/diff";
import { materialSeverity, tempoSeverity } from "../lib/tempo/severity";
import { nameScore } from "../lib/tempo/api-football";
import { blendPressure, oddsVelocityFromDelta } from "../lib/tempo/hybrid";
import type { TempoSnapshot } from "../lib/tempo/types";
import { loadFrequencyArtifact } from "../lib/horizon/artifact";

test("diffTempo emits SOT then remaining shots", () => {
  const snap: TempoSnapshot = {
    fixtureId: "f1",
    minute: 20,
    tsMs: 1,
    source: "sim",
    counts: {
      shots: { home: 3, away: 1 },
      sot: { home: 2, away: 0 },
      fouls: { home: 0, away: 0 },
      offsides: { home: 0, away: 0 },
      attacks: { home: 0, away: 0 },
      dangerousAttacks: { home: 0, away: 0 },
      possession: { home: 50, away: 50 },
    },
  };
  const events = diffTempo(null, snap);
  assert.equal(events.filter((e) => e.kind === "shot_on_target" && e.side === "home").length, 2);
  assert.equal(events.filter((e) => e.kind === "shot" && e.side === "home").length, 1);
  assert.equal(events.filter((e) => e.side === "away").length, 1);
});

test("diffTempo emits fouls and possession shifts when enrichment advances", () => {
  const first: TempoSnapshot = {
    fixtureId: "f1",
    minute: 10,
    tsMs: 1,
    source: "sim",
    counts: {
      shots: { home: 0, away: 0 },
      sot: { home: 0, away: 0 },
      fouls: { home: 1, away: 0 },
      offsides: { home: 0, away: 0 },
      attacks: { home: 0, away: 0 },
      dangerousAttacks: { home: 0, away: 0 },
      possession: { home: 50, away: 50 },
    },
  };
  const second: TempoSnapshot = {
    ...first,
    minute: 12,
    counts: {
      ...first.counts,
      fouls: { home: 2, away: 0 },
      possession: { home: 62, away: 38 },
    },
  };
  const events = diffTempo(first.counts, second);
  assert.ok(events.some((e) => e.kind === "foul" && e.side === "home"));
  assert.ok(events.some((e) => e.kind === "possession_shift"));
});

test("severity ranks goal above tempo shot", () => {
  assert.ok(materialSeverity("goal", 40) > tempoSeverity("shot_on_target", 40));
  assert.ok(materialSeverity("red", 80) > materialSeverity("yellow", 80));
  assert.ok(materialSeverity("goal", 88) >= materialSeverity("goal", 20));
});

test("hybrid blend stays in unit interval", () => {
  assert.equal(blendPressure(1, 1), 1);
  assert.ok(oddsVelocityFromDelta(0.08) === 1);
  assert.ok(blendPressure(0.5, 0.5) > 0.4 && blendPressure(0.5, 0.5) < 0.6);
});

test("nameScore matches club aliases softly", () => {
  assert.ok(nameScore("Paris Saint-Germain", "Paris Saint Germain") > 0.8);
  assert.ok(nameScore("FC Barcelona", "Barcelona") >= 0.85);
  assert.ok(nameScore("Arsenal", "Chelsea") < 0.3);
});

test("sim ticks feed Tempo · Odds · Hybrid without Horizon coupling", () => {
  const fixture = getFixtures()[0];
  const gen = new MarketTickGenerator(fixture, resolveConfig({ seed: 3, tickMinutes: 1 }));
  const horizon = new HorizonMachine(loadFrequencyArtifact());
  const strip = new ShockStripAssembler();

  for (let i = 0; i < 50; i++) {
    const tick = gen.at(i);
    assert.ok(tick.tempo, "sim ticks carry tempo snapshots");
    horizon.processTick(tick);
    const hz = horizon.getState();
    strip.ingestTick(tick, {
      oddsSwing: hz.oddsSwing,
      lastCollapse: hz.lastCollapse,
      horizon: hz.current,
    });
    // Engine commits desk-model Hybrid after ingest (fair home, not Horizon class P).
    const home = tick.odds.markets
      .find((m) => m.type === "match_result")
      ?.selections.find((s) => s.key === "home")?.impliedProb ?? 0.4;
    strip.setHybridPoint({
      minute: tick.minute,
      fairHome: home,
      tempoIntensity: 0.3,
      oddsVelocity: 0.1,
      pressure: 0.35,
      thesis: hz.current?.thesis ?? null,
    });
  }

  const state = strip.getState();
  assert.ok(state.tempo.series.length > 5);
  assert.equal(state.tempo.source, "sim");
  assert.equal(state.tempo.status, "ready");
  assert.ok(state.tempo.latest!.shots.home + state.tempo.latest!.shots.away > 0);
  assert.ok(state.tempo.markers.every((s) => s.track === "tempo"));
  assert.ok(state.tempo.markers.some((s) => s.source === "txline" || s.source === "sim"));

  assert.ok(state.odds.availableViews.includes("next_score"));
  assert.ok(state.odds.availableViews.includes("match_1x2"));
  assert.ok(state.odds.views.next_score.points.length > 5);
  assert.ok(state.odds.views.match_1x2.available);

  assert.ok(state.hybrid.series.length > 5);
  assert.ok(state.hybrid.series.every((p) => p.thesisProb >= 0 && p.thesisProb <= 1));
  assert.ok(state.hybrid.series.every((p) => p.pressure >= 0 && p.pressure <= 1));

  assert.ok(state.strategies.next_score.available);
  assert.ok(state.strategies.match_1x2.available);
  assert.ok(state.strategies.next_score.series.length > 5);
  const ns = state.strategies.next_score.series.at(-1)!;
  const mx = state.strategies.match_1x2.series.at(-1)!;
  assert.equal(ns.minute, mx.minute);
  assert.ok(Math.abs(ns.oddsProb - mx.oddsProb) > 0.01 || Math.abs(ns.hybridProb - mx.hybridProb) > 0.01);
});

test("missing odds market stays unavailable and is never invented", () => {
  const fixture = getFixtures()[0];
  const gen = new MarketTickGenerator(fixture, resolveConfig({ seed: 1, tickMinutes: 1 }));
  const strip = new ShockStripAssembler();
  const tick = gen.at(0);
  tick.odds = {
    ...tick.odds,
    markets: tick.odds.markets.filter((m) => m.type !== "total_corners"),
  };
  strip.ingestTick(tick);
  const state = strip.getState();
  assert.equal(state.odds.views.corners_ou.available, false);
  assert.equal(state.odds.views.corners_ou.points.length, 0);
  assert.ok(state.odds.views.match_1x2.available);
});

test("hybrid records collapse markers from Horizon side-input only", () => {
  const strip = new ShockStripAssembler();
  const fixture = getFixtures()[0];
  const gen = new MarketTickGenerator(fixture, resolveConfig({ seed: 2, tickMinutes: 1 }));
  const tick = gen.at(10);
  strip.ingestTick(tick, {
    lastCollapse: {
      id: "c1",
      fixtureId: fixture.id,
      horizonId: "h1",
      winner: "goal_home",
      minute: 10,
      tsMs: tick.tsMs,
      triggerSeq: tick.seq,
      settlingProbability: 0.12,
      thesis: "quiet",
      action: "goal_home",
      surprise: true,
      thesisDead: false,
      brierScore: 0.4,
      latencyMs: 100,
      settledSnapshot: {
        id: "h1",
        fixtureId: fixture.id,
        openedMinute: 0,
        closesMinute: 10,
        openedAtMs: tick.tsMs,
        lastRefreshAtMs: tick.tsMs,
        refreshNumber: 1,
        probabilities: { goal_home: 0.2, goal_away: 0.2, card: 0.2, quiet: 0.4 },
        thesis: "quiet",
        action: "goal_home",
        support: 10,
        bucket: "b",
        fallback: "global",
        lowData: false,
        source: "simulation-bootstrap",
        provenance: "test",
      },
    },
    horizon: {
      id: "h2",
      fixtureId: fixture.id,
      openedMinute: 10,
      closesMinute: 20,
      openedAtMs: tick.tsMs,
      lastRefreshAtMs: tick.tsMs,
      refreshNumber: 1,
      probabilities: { goal_home: 0.35, goal_away: 0.2, card: 0.15, quiet: 0.3 },
      thesis: "goal_home",
      action: "goal_home",
      support: 40,
      bucket: "b",
      fallback: "exact",
      lowData: false,
      source: "txline-historical",
      provenance: "test",
    },
  });
  strip.setHybridPoint({
    minute: tick.minute,
    fairHome: 0.42,
    tempoIntensity: 0.3,
    oddsVelocity: 0.1,
    pressure: 0.4,
    thesis: "goal_home",
  });
  const state = strip.getState();
  assert.equal(state.hybrid.markers.length, 1);
  assert.equal(state.hybrid.markers[0].track, "hybrid");
  assert.ok(state.hybrid.markers[0].severity >= 0.9);
  assert.equal(state.hybrid.series.at(-1)?.thesis, "goal_home");
  assert.ok((state.hybrid.series.at(-1)?.thesisProb ?? 0) > 0.3);
});
