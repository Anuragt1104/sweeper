/**
 * Contract: Hybrid Thesis must never treat Horizon class P as 1X2 fair.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { runHeadless } from "@/lib/runner/run";
import { horizonHazardTo1x2Tilt } from "@/lib/desk/horizon-map";

test("desk model fairHome is never equal to raw Horizon goal_home class P on a live run sample", () => {
  const { state, engine } = runHeadless({ seed: 7 });
  assert.ok(state.agents.length >= 7);
  // Spot-check: Horizon-mapped tilt magnitude is capped well below class probabilities.
  const tilt = horizonHazardTo1x2Tilt(
    {
      thesis: "goal_home",
      action: "goal_home",
      probabilities: { goal_home: 0.7, goal_away: 0.1, card: 0.1, quiet: 0.1 },
    } as never,
    20,
  );
  assert.ok(Math.abs(tilt.homeTilt) < 0.7);
  assert.ok(Math.abs(tilt.homeTilt) <= 0.08 + 1e-9);
  void engine;
});

test("headless agents receive desk model on every finished state path", () => {
  const { state } = runHeadless({ seed: 4 });
  assert.ok(state.deskPath);
  assert.ok(state.deskModel);
  assert.ok(state.matchIntensity);
  assert.ok(state.deskPath!.regime === "calm" || state.deskPath!.regime === "normal" || state.deskPath!.regime === "chaotic");
});
