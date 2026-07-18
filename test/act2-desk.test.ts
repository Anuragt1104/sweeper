/**
 * Act II desk — full-match stream seeds path features, then trades kickoff → FT.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixtureById } from "@/lib/data/worldcup";
import { resolveConfig } from "@/lib/engine/config";
import { SweeperEngine } from "@/lib/engine/engine";
import { loadAct2TempoArtifact, RecordedTempoProvider } from "@/lib/tempo/recorded";

test("Act II full match: warm, trade through goal, finish at FT", () => {
  const fixture = fixtureById("wc26-a-md2-arg-pol");
  assert.ok(fixture);
  const tempo = loadAct2TempoArtifact();
  const engine = new SweeperEngine(
    fixture!,
    resolveConfig({ seed: 7 }),
    "simulation",
    [],
    undefined,
    undefined,
    tempo ? new RecordedTempoProvider(tempo) : undefined,
  );

  engine.warmFeaturesUntil(0.5);
  assert.ok(engine.getState().deskPath);

  let sawCollapse = false;
  let sawFill = false;
  let sawGoalMinute = false;

  while (engine.step()) {
    const state = engine.getState();
    const minute = state.current?.minute ?? 0;
    if (minute >= 40 && minute <= 43) sawGoalMinute = true;
    if (state.ledger.recent.some((r) => r.kind === "horizon_collapse")) sawCollapse = true;
    if (state.ledger.recent.some((r) => r.kind === "fill")) sawFill = true;
  }

  const end = engine.getState();
  assert.equal(end.status, "finished");
  assert.ok(sawGoalMinute, "should pass the known goal window");
  assert.ok(sawCollapse, "Horizon should collapse on the Act II goal");
  assert.ok(sawFill, "agents should produce shadow fills across the match");
  assert.ok(end.agents.length >= 7, "seven-agent arena");
  assert.ok((end.current?.minute ?? 0) >= 90 || end.settlement, "reach FT / settlement");
});
