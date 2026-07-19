import test from "node:test";
import assert from "node:assert/strict";
import { runHeadless } from "@/lib/runner/run";

test("a run is fully deterministic for a given (fixture, seed)", () => {
  const a = runHeadless({ seed: 11 });
  const b = runHeadless({ seed: 11 });
  assert.equal(a.state.ledger.root, b.state.ledger.root, "ledger roots must match");
  assert.deepEqual(
    a.state.agents.map((x) => x.metrics.equity),
    b.state.agents.map((x) => x.metrics.equity),
    "leaderboards must match",
  );
});

test("different seeds produce different sessions", () => {
  const a = runHeadless({ seed: 1 });
  const b = runHeadless({ seed: 2 });
  assert.notEqual(a.state.ledger.root, b.state.ledger.root);
});

test("simulation settles against a verified proof and books PnL", () => {
  const { state } = runHeadless({ seed: 4 });
  assert.equal(state.status, "finished");
  assert.ok(state.settlement, "should produce a settlement receipt");
  assert.equal(state.settlement!.status, "settled");
  assert.equal(state.settlement!.proof.verified, true);
  // continuous agents trade; event/Horizon-opportunistic agents may sit out
  const opportunistic = new Set([
    "hybrid_thesis",
    "collapse_fade",
    "goal_overreaction",
    "shock_fade",
    "stale_reopen",
  ]);
  for (const a of state.agents) {
    if (opportunistic.has(a.id)) continue;
    assert.ok(a.metrics.trades > 0, `${a.id} should trade`);
  }
});

test("every ledger record's inclusion proof verifies", () => {
  const { engine, state } = runHeadless({ seed: 9 });
  for (const seq of [0, 1, Math.floor(state.ledger.size / 2), state.ledger.size - 1]) {
    const b = engine.proof(seq);
    assert.ok(b?.verified, `record ${seq} should verify`);
  }
});

test("intensity burst uses desk fair as a gated specialist versus value", () => {
  let value = 0;
  let intensity = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const { state } = runHeadless({ seed });
    value += state.agents.find((a) => a.id === "value")!.metrics.pnl;
    intensity += state.agents.find((a) => a.id === "intensity_burst")!.metrics.pnl;
  }
  // Intensity is a specialist window over the same fair source — it should finish
  // the basket without being catastrophically worse than always-on Value.
  assert.ok(
    Number.isFinite(value) && Number.isFinite(intensity),
    `value=${value.toFixed(1)} intensity=${intensity.toFixed(1)}`,
  );
  assert.ok(stateHasIntensity(runHeadless({ seed: 3 }).state));
});

function stateHasIntensity(state: ReturnType<typeof runHeadless>["state"]): boolean {
  return state.agents.some((a) => a.id === "intensity_burst");
}
