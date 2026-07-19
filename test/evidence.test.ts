import assert from "node:assert/strict";
import test from "node:test";
import { fixtureById } from "@/lib/data/worldcup";
import { resolveConfig } from "@/lib/engine/config";
import { SweeperEngine } from "@/lib/engine/engine";
import { DecisionEvidence } from "@/lib/evidence/decision-evidence";
import { publishAct2Engine } from "@/lib/demo/act2-runtime";
import { GET as evidenceGET } from "@/app/api/evidence/decision/route";
import { GET as proofGET } from "@/app/api/proof/[seq]/route";

function act2AtPostGoal() {
  const fixture = fixtureById("wc26-a-md2-arg-pol");
  assert.ok(fixture);
  const engine = new SweeperEngine(fixture, resolveConfig({ seed: 7 }), "simulation");
  while ((engine.getState().current?.minute ?? 0) < 43) engine.step();
  return engine;
}

test("Decision Receipt links exact tick → decision → fill and verifies its session proof", async () => {
  const engine = act2AtPostGoal();
  const receipt = await DecisionEvidence.build(engine, {
    sessionId: engine.sessionId,
    strategyId: "collapse_fade",
    contract: "match_1x2",
    selector: "latest_fill",
  });

  assert.equal(receipt.strategy.design.id, "collapse_fade");
  assert.equal(receipt.observation.tickHash, receipt.strategy.decision.reactedToHash);
  assert.equal(receipt.strategy.decision.hash, receipt.execution?.fill.reactedToHash);
  assert.equal(receipt.decisionProof.label, "SWEEPER DECISION PROOF");
  assert.equal(receipt.decisionProof.verified, true);
  assert.equal(receipt.settlementGuard.label, "TXLINE SETTLEMENT GUARD");
  assert.equal(receipt.settlementGuard.state, "not_final");
  assert.equal(receipt.provenance.executionMode, "simulated");
});

test("Decision Receipt rejects cross-session evidence", async () => {
  const engine = act2AtPostGoal();
  await assert.rejects(
    DecisionEvidence.build(engine, {
      sessionId: "another-session",
      strategyId: "collapse_fade",
      contract: "match_1x2",
      selector: "latest_fill",
    }),
    /does not match active evidence source/,
  );
});

test("public demo evidence and proof APIs preserve source identity", async () => {
  const engine = act2AtPostGoal();
  publishAct2Engine(engine);
  const query = new URLSearchParams({
    source: "demo",
    sessionId: engine.sessionId,
    strategy: "collapse_fade",
    contract: "match_1x2",
    selector: "latest_fill",
  });
  const response = await evidenceGET(new Request(`http://localhost/api/evidence/decision?${query}`));
  assert.equal(response.status, 200);
  const receipt = await response.json();
  assert.equal(receipt.provenance.source, "demo");

  const proof = await proofGET(
    new Request(`http://localhost/api/proof/${receipt.strategy.decision.seq}?source=demo&sessionId=${engine.sessionId}`),
    { params: Promise.resolve({ seq: String(receipt.strategy.decision.seq) }) },
  );
  assert.equal(proof.status, 200);
  assert.equal((await proof.json()).verified, true);

  const confused = await evidenceGET(new Request(`http://localhost/api/evidence/decision?${query.toString().replace("source=demo", "source=live")}`));
  assert.notEqual(confused.status, 200);
});
