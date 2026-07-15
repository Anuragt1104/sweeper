import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG } from "../lib/engine/config";
import { HorizonMachine } from "../lib/horizon/machine";
import { samplesFromHistorical } from "../lib/horizon/training";
import {
  lookupProbabilities,
  lockBadges,
  type FrequencyArtifact,
  type HorizonOutcome,
} from "../lib/horizon/probability";
import { MarketTickGenerator, type MarketTick } from "../lib/market/ticks";
import { getFixtures } from "../lib/data/worldcup";
import { normalizeScoreRecord } from "../lib/txline/normalize";

const table: FrequencyArtifact = {
  version: 1,
  generatedAt: "2026-07-14T00:00:00.000Z",
  alpha: 1,
  supportThreshold: 30,
  provenance: {
    source: "txline-historical",
    label: "TxLINE historical test table",
    fixtureCount: 40,
    sampleCount: 400,
  },
  rows: {
    "0-15|0|0": { goal_home: 38, goal_away: 18, card: 12, quiet: 32 },
    "0-15|0|*": { goal_home: 32, goal_away: 20, card: 18, quiet: 30 },
    "0-15|*|0": { goal_home: 25, goal_away: 25, card: 20, quiet: 30 },
    "0-15|*|*": { goal_home: 20, goal_away: 20, card: 20, quiet: 40 },
    "global|*|*": { goal_home: 20, goal_away: 20, card: 20, quiet: 40 },
  },
};

function baseTick(index = 0): MarketTick {
  const fixture = getFixtures()[0];
  return new MarketTickGenerator(fixture, { ...DEFAULT_CONFIG, seed: 7 }).at(index);
}

function tickAt(minute: number, patch: Partial<MarketTick> = {}): MarketTick {
  const tick = baseTick(Math.round(minute / DEFAULT_CONFIG.tickMinutes));
  return {
    ...tick,
    seq: Math.round(minute * 10),
    minute,
    tsMs: 1_800_000_000_000 + minute * 60_000,
    events: [],
    ...patch,
  };
}

test("historical sampling uses the maximum observed minute when terminal records arrive out of order", () => {
  const fixture = getFixtures()[0];
  const raw = (seq: number, minute: number) => normalizeScoreRecord({
    fixtureId: fixture.id,
    seq,
    ts: 1_800_000_000_000 + seq,
    gameState: minute >= 90 ? "FINISHED" : "H2",
    participant1IsHome: true,
    scoreSoccer: {
      participant1: { Total: { Goals: 0, YellowCards: 0, RedCards: 0, Corners: 0 } },
      participant2: { Total: { Goals: 0, YellowCards: 0, RedCards: 0, Corners: 0 } },
    },
    dataSoccer: { Minutes: minute },
  }, fixture);
  const samples = samplesFromHistorical(fixture, [raw(1, 0), raw(2, 90), raw(3, 0)]);
  assert.equal(samples.length, 90);
});

test("probability lookup is normalized and follows the full fallback hierarchy", () => {
  const exact = lookupProbabilities(table, { minute: 10, scoreDiff: 0, cardDiff: 0 });
  assert.equal(exact.fallback, "exact");
  assert.equal(Object.values(exact.probabilities).reduce((a, b) => a + b, 0), 1);

  const dropCard = lookupProbabilities(table, { minute: 10, scoreDiff: 0, cardDiff: 2 });
  assert.equal(dropCard.fallback, "drop_card_difference");

  const dropScore = lookupProbabilities(table, { minute: 10, scoreDiff: 2, cardDiff: 0 });
  assert.equal(dropScore.fallback, "drop_score_difference");

  const minuteOnly = lookupProbabilities(table, { minute: 10, scoreDiff: 2, cardDiff: 2 });
  assert.equal(minuteOnly.fallback, "minute_band");

  const global = lookupProbabilities(table, { minute: 40, scoreDiff: 2, cardDiff: 2 });
  assert.equal(global.fallback, "global");
  assert.equal(global.lowData, true);
});

test("badge locks preserve the prior card on exact ties and use catalog order initially", () => {
  const tied = { goal_home: 0.3, goal_away: 0.3, card: 0.2, quiet: 0.2 };
  assert.deepEqual(lockBadges(tied), { thesis: "goal_home", action: "goal_home" });
  assert.deepEqual(lockBadges(tied, { thesis: "goal_away", action: "goal_away" }), {
    thesis: "goal_away",
    action: "goal_away",
  });
  assert.deepEqual(lockBadges({ goal_home: 0.2, goal_away: 0.15, card: 0.15, quiet: 0.5 }), {
    thesis: "quiet",
    action: "goal_home",
  });
});

test("soft refresh updates publication without moving the fixed ten-minute close", () => {
  const machine = new HorizonMachine(table);
  const opened = machine.processTick(tickAt(12));
  const close = opened.current?.closesMinute;
  const refreshed = machine.processTick(tickAt(12.5));
  assert.equal(refreshed.current?.closesMinute, close);
  assert.equal(refreshed.current?.refreshNumber, 1);
});

test("first sequence-ordered material event settles and immediately opens the next Horizon", () => {
  const machine = new HorizonMachine(table);
  machine.processTick(tickAt(12));
  const tick = tickAt(14, {
    events: [
      { fixtureId: "f", seq: 9, ts: new Date(0).toISOString(), minute: 14, phase: baseTick().phase, kind: "yellow", side: "away", label: "Yellow" },
      { fixtureId: "f", seq: 8, ts: new Date(0).toISOString(), minute: 14, phase: baseTick().phase, kind: "goal", side: "home", label: "Goal" },
    ],
  });
  const state = machine.processTick(tick);
  assert.equal(state.lastCollapse?.winner, "goal_home");
  assert.equal(state.current?.openedMinute, 14);
  assert.equal(state.metrics.horizonsSettled, 1);
});

test("a Horizon settles Quiet exactly at its fixed closing minute", () => {
  const machine = new HorizonMachine(table);
  machine.processTick(tickAt(12));
  const state = machine.processTick(tickAt(22));
  assert.equal(state.lastCollapse?.winner, "quiet");
  assert.equal(state.lastCollapse?.minute, 22);
  assert.equal(state.current?.openedMinute, 22);
});

test("Surprise is strict below 15%; otherwise a wrong thesis is THESIS DEAD", () => {
  const lowGoal: FrequencyArtifact = {
    ...table,
    rows: { ...table.rows, "0-15|0|0": { goal_home: 4, goal_away: 40, card: 20, quiet: 36 } },
  };
  const surpriseMachine = new HorizonMachine(lowGoal);
  surpriseMachine.processTick(tickAt(12));
  const surprise = surpriseMachine.processTick(eventTick("goal_home", 13));
  assert.equal(surprise.lastCollapse?.surprise, true);
  assert.equal(surprise.lastCollapse?.thesisDead, false);

  const exactlyFifteen: FrequencyArtifact = {
    ...table,
    alpha: 0,
    rows: { ...table.rows, "0-15|0|0": { goal_home: 15, goal_away: 45, card: 20, quiet: 20 } },
  };
  const deadMachine = new HorizonMachine(exactlyFifteen);
  deadMachine.processTick(tickAt(12));
  const dead = deadMachine.processTick(eventTick("goal_home", 13));
  assert.equal(dead.lastCollapse?.settlingProbability, 0.15);
  assert.equal(dead.lastCollapse?.surprise, false);
  assert.equal(dead.lastCollapse?.thesisDead, true);
});

test("odds swing requires eight points over 180 seconds with no goal", () => {
  const machine = new HorizonMachine(table);
  machine.processTick(withOneXTwo(tickAt(12), 0.42, 0.30));
  const swing = machine.processTick(withOneXTwo(tickAt(15), 0.51, 0.25));
  assert.equal(swing.oddsSwing.active, true);
  assert.equal(swing.oddsSwing.favorite, "home");
  assert.ok(swing.oddsSwing.delta >= 0.08);

  const suppressed = new HorizonMachine(table);
  suppressed.processTick(withOneXTwo(tickAt(12), 0.42, 0.30));
  const goal = eventTick("goal_home", 14);
  suppressed.processTick(withOneXTwo(goal, 0.48, 0.27));
  const afterGoal = suppressed.processTick(withOneXTwo(tickAt(15), 0.53, 0.24));
  assert.equal(afterGoal.oddsSwing.active, false);
});

test("Machine Ledger tracks Brier score, hit rates, collapse latency, and proof records", () => {
  const records: { kind: string; reactedToHash?: string }[] = [];
  const machine = new HorizonMachine(table, (record) => records.push(record));
  machine.processTick(tickAt(12), { tickHash: "abc", processedAtMs: tickAt(12).tsMs });
  machine.processTick(tickAt(12.5), { tickHash: "refresh", processedAtMs: tickAt(12.5).tsMs });
  const result = machine.processTick(eventTick("goal_home", 13), {
    tickHash: "def",
    processedAtMs: eventTick("goal_home", 13).tsMs + 250,
  });
  assert.equal(result.metrics.horizonsOpened, 2);
  assert.equal(result.metrics.horizonsSettled, 1);
  assert.equal(result.metrics.thesisHitRate, 1);
  assert.equal(result.metrics.actionHitRate, 1);
  assert.ok(result.metrics.meanBrierScore > 0);
  assert.equal(result.metrics.liveCollapseLatencyMs, 250);
  assert.deepEqual(records.map((r) => r.kind), ["horizon_open", "horizon_refresh", "horizon_collapse", "horizon_open"]);
  assert.equal(records[2].reactedToHash, "def");
});

function eventTick(outcome: Exclude<HorizonOutcome, "quiet">, minute: number): MarketTick {
  const kind = outcome === "card" ? "yellow" : "goal";
  const side = outcome === "goal_away" ? "away" : "home";
  return tickAt(minute, {
    events: [{
      fixtureId: "f",
      seq: Math.round(minute * 10),
      ts: new Date(1_800_000_000_000 + minute * 60_000).toISOString(),
      minute,
      phase: baseTick().phase,
      kind,
      side,
      label: kind,
    }],
  });
}

function withOneXTwo(tick: MarketTick, home: number, away: number): MarketTick {
  const draw = Math.max(0.01, 1 - home - away);
  const selections = [
    { key: "home", label: "Home", impliedProb: home, price: 1 / home, prevPrice: 1 / home },
    { key: "draw", label: "Draw", impliedProb: draw, price: 1 / draw, prevPrice: 1 / draw },
    { key: "away", label: "Away", impliedProb: away, price: 1 / away, prevPrice: 1 / away },
  ];
  return { ...tick, odds: { ...tick.odds, markets: [{ type: "match_result", label: "1X2", selections }] } };
}
