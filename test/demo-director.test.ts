import assert from "node:assert/strict";
import test from "node:test";
import { createAct2Scene, playAct2PreGoal } from "@/lib/demo/director";

test("every Demo Director scene has a deterministic state and truthful settlement label", () => {
  const expectations = {
    overview: { minute: 30.5, score: [0, 0], settlement: null },
    pre_goal: { minute: 39.5, score: [0, 0], settlement: null },
    post_goal: { minute: 42, score: [1, 0], settlement: null },
    full_time: { minute: 90, score: [1, 0], settlement: "simulation" },
  } as const;

  for (const [scene, expected] of Object.entries(expectations)) {
    const first = createAct2Scene(scene as keyof typeof expectations);
    const second = createAct2Scene(scene as keyof typeof expectations);
    const state = first.engine.getState();
    assert.ok((state.current?.minute ?? 0) >= expected.minute);
    assert.deepEqual([state.current?.homeGoals, state.current?.awayGoals], expected.score);
    assert.equal(state.ledger.root, second.engine.getState().ledger.root);
    assert.equal(state.settlement?.proof.source ?? null, expected.settlement);
  }
});

test("pre_goal plays through goal → Horizon collapse → stance/fill → PnL", () => {
  const { engine } = createAct2Scene("pre_goal");
  const frames = playAct2PreGoal(engine);
  const final = frames.at(-1)!;
  assert.ok(frames.some((state) => (state.current?.homeGoals ?? 0) === 1), "goal is observed");
  assert.ok(frames.some((state) => state.ledger.recent.some((record) => record.kind === "horizon_collapse")), "Horizon collapses");
  assert.ok(frames.some((state) => state.ledger.recent.some((record) => record.kind === "fill" && record.summary.startsWith("collapse_fade"))), "Collapse Fade fills");
  assert.ok((final.agents.find((agent) => agent.id === "collapse_fade")?.metrics.trades ?? 0) > 0, "Arena PnL path updates");
});
