/**
 * Desk model unit tests — score-state, hybrid tilt, Horizon map, compose.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { scoreState1x2, applyTilt1x2 } from "@/lib/desk/score-state";
import { computeHybridLayer } from "@/lib/desk/hybrid-layer";
import { horizonHazardTo1x2Tilt } from "@/lib/desk/horizon-map";
import { composeDeskModel } from "@/lib/desk/compose";
import { emptyTempoCounts } from "@/lib/tempo/diff";
import type { HorizonPublication } from "@/lib/horizon/machine";
import type { MarketTick } from "@/lib/market/ticks";
import { GamePhase } from "@/lib/txline/types";

test("score-state 1x2 normalizes and reacts to lead", () => {
  const score = {
    goals: { home: 1, away: 0 },
    yellow: { home: 0, away: 0 },
    red: { home: 0, away: 0 },
    corners: { home: 0, away: 0 },
  } as MarketTick["score"];
  const p = scoreState1x2(60, score);
  assert.ok(Math.abs(p.home + p.draw + p.away - 1) < 1e-9);
  assert.ok(p.home > p.away, "home lead → higher home win P");
});

test("hybrid layer tilts home on SOT differential", () => {
  const tempo = emptyTempoCounts();
  tempo.sot.home = 4;
  tempo.sot.away = 0;
  tempo.shots.home = 8;
  tempo.shots.away = 1;
  const h = computeHybridLayer({
    tempo,
    homeProb: 0.45,
    homeProbPrior: 0.4,
  });
  assert.ok(h.homeTilt > 0);
  assert.ok(h.tempoDifferential > 0);
});

test("horizon map never returns class P as 1x2 fair; scales with remaining time", () => {
  const hz = {
    thesis: "goal_home",
    action: "goal_home",
    probabilities: { goal_home: 0.55, goal_away: 0.15, card: 0.1, quiet: 0.2 },
  } as HorizonPublication;
  const early = horizonHazardTo1x2Tilt(hz, 10);
  const late = horizonHazardTo1x2Tilt(hz, 85);
  assert.equal(early.drive, "goal_home");
  assert.ok(early.homeTilt > late.homeTilt);
  assert.ok(Math.abs(early.homeTilt) < 0.55, "tilt must not equal raw class P");
});

test("composeDeskModel fair differs from raw Horizon class P", () => {
  const tick = {
    fixtureId: "t",
    seq: 1,
    tsMs: 1,
    minute: 40,
    phase: GamePhase.FirstHalf,
    suspended: false,
    score: {
      goals: { home: 0, away: 0 },
      yellow: { home: 0, away: 0 },
      red: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
    },
    events: [],
    odds: {
      markets: [
        {
          type: "match_result",
          selections: [
            { key: "home", impliedProb: 0.42 },
            { key: "draw", impliedProb: 0.28 },
            { key: "away", impliedProb: 0.3 },
          ],
        },
      ],
    },
  } as unknown as MarketTick;
  const hz = {
    thesis: "goal_home",
    action: "goal_home",
    probabilities: { goal_home: 0.6, goal_away: 0.1, card: 0.1, quiet: 0.2 },
  } as HorizonPublication;
  const model = composeDeskModel({
    tick,
    horizon: hz,
    tempo: null,
    homeProbPrior: 0.4,
  });
  assert.ok(model.ready);
  assert.notEqual(model.fairHome, 0.6);
  assert.ok(Math.abs(model.fair1x2.home + model.fair1x2.draw + model.fair1x2.away - 1) < 1e-6);
});

test("applyTilt1x2 preserves normalization", () => {
  const base = { home: 0.4, draw: 0.3, away: 0.3 };
  const t = applyTilt1x2(base, 0.05);
  assert.ok(Math.abs(t.home + t.draw + t.away - 1) < 1e-9);
  assert.ok(t.home > base.home);
});
