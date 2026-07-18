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
  // continuous agents trade; Horizon-opportunistic agents may sit out
  for (const a of state.agents) {
    if (a.id === "hybrid_thesis" || a.id === "collapse_fade") continue;
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

test("sentinel adds value: guarded momentum beats naive across seeds", () => {
  let guarded = 0;
  let naive = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const { state } = runHeadless({ seed });
    guarded += state.agents.find((a) => a.id === "momentum_guarded")!.metrics.pnl;
    naive += state.agents.find((a) => a.id === "momentum_naive")!.metrics.pnl;
  }
  // The guarded agent ignores outlier prints the naive one chases, so over a
  // basket of seeds it should not be worse, and in practice is better.
  assert.ok(guarded >= naive, `guarded (${guarded.toFixed(1)}) >= naive (${naive.toFixed(1)})`);
});
