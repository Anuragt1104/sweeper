import test from "node:test";
import assert from "node:assert/strict";
import type { Decision } from "@/lib/agents/types";
import type { AgentView, TradeReadiness } from "@/lib/engine/state";
import { emptyDeskModel } from "@/lib/desk/empty";
import { snapshotDeskModel } from "@/lib/desk/contract-deck";
import { runHeadless } from "@/lib/runner/run";
import { STRATEGY_DESIGNS } from "@/lib/strategy-lab/designs";
import { projectStrategyStances } from "@/lib/strategy-lab/stances";
import { StrategyLabProjection } from "@/lib/strategy-lab/projection";

const readiness: TradeReadiness = {
  ready: true,
  reasons: [],
  checkedAtMs: 1,
  scoreAgeMs: 0,
  oddsAgeMs: 0,
};

function agent(id: string, stoodDown = false): AgentView {
  const design = STRATEGY_DESIGNS.find((candidate) => candidate.id === id)!;
  return {
    id,
    name: design.name,
    kind: id,
    blurb: design.stanceRule,
    mode: "taker",
    metrics: { agentId: id, equity: 1000, pnl: 0, roi: 0, realized: 0, unrealized: 0, trades: 0, turnover: 0, hitRate: 0, maxDrawdown: 0, exposure: 0 },
    positions: [],
    lastRationale: stoodDown ? "Quality gate active" : "No trigger",
    stoodDown,
    curve: [],
    curveMinutes: [],
    fillMarkers: [],
    contractPnl: [],
    lastDecisionKind: stoodDown ? "stand_down" : "hold",
    lastSignalIds: [],
    drivingInputs: null,
  };
}

const deskModel = snapshotDeskModel(emptyDeskModel({
  ready: true,
  fair1x2: { home: 0.5, draw: 0.27, away: 0.23 },
  edgeVsObs: { home: 0.04, draw: -0.01, away: -0.03 },
  detail: "test",
}));

test("the canonical roster contains eleven ordered, uniquely identified strategy designs", () => {
  assert.equal(STRATEGY_DESIGNS.length, 11);
  assert.deepEqual(
    STRATEGY_DESIGNS.map((design) => design.displayOrder),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.equal(new Set(STRATEGY_DESIGNS.map((design) => design.id)).size, 11);
  assert.ok(STRATEGY_DESIGNS.every((design) => design.color && design.stanceRule && design.standDownWhen.length));
  assert.ok(STRATEGY_DESIGNS.some((design) => design.id === "goal_overreaction"));
  assert.ok(STRATEGY_DESIGNS.some((design) => design.id === "regime_switcher"));
  assert.ok(STRATEGY_DESIGNS.some((design) => design.id === "kelly_value"));
  assert.deepEqual(
    STRATEGY_DESIGNS.map((design) => design.id),
    [
      "value",
      "momentum_guarded",
      "reversion",
      "intensity_burst",
      "hybrid_thesis",
      "collapse_fade",
      "goal_overreaction",
      "shock_fade",
      "stale_reopen",
      "regime_switcher",
      "kelly_value",
    ],
  );
});

test("stance projection covers every state without granting fills outside fillableNow", () => {
  const agents = STRATEGY_DESIGNS.map((design) => agent(design.id, design.id === "momentum_guarded"));
  const decisions = new Map<string, Decision>([
    ["value", {
      agentId: "value", seq: 1, tsMs: 1, quotes: [], rationale: "buy home",
      orders: [{ agentId: "value", fixtureId: "f", marketType: "match_result", selectionKey: "home", selId: "match_result:home", side: "buy", price: 0.46, size: 12, seq: 1, tsMs: 1, rationale: "buy home on 4pp edge" }],
    }],
    ["intensity_burst", {
      agentId: "intensity_burst", seq: 1, tsMs: 1, quotes: [], rationale: "intensity window",
      orders: [{ agentId: "intensity_burst", fixtureId: "f", marketType: "match_result", selectionKey: "home", selId: "match_result:home", side: "buy", price: 0.46, size: 10, seq: 1, tsMs: 1, rationale: "intensity flurry · desk edge" }],
    }],
  ]);
  const stances = projectStrategyStances(agents, decisions, readiness, deskModel);
  assert.equal(stances.length, 55);
  assert.equal(stances.find((stance) => stance.agentId === "value" && stance.contract === "match_1x2")?.kind, "trade");
  assert.equal(stances.find((stance) => stance.agentId === "intensity_burst" && stance.contract === "match_1x2")?.kind, "trade");
  assert.equal(stances.find((stance) => stance.agentId === "momentum_guarded" && stance.contract === "match_1x2")?.kind, "stand_down");
  assert.equal(stances.find((stance) => stance.agentId === "reversion" && stance.contract === "ou_25")?.kind, "flat");
  assert.equal(stances.find((stance) => stance.agentId === "reversion" && stance.contract === "match_1x2")?.edgeVsBook, null);
  assert.equal(stances.find((stance) => stance.agentId === "value" && stance.contract === "match_1x2")?.edgeVsBook, 0.04);
  assert.equal(stances.find((stance) => stance.agentId === "hybrid_thesis" && stance.contract === "next_score")?.kind, "no_model");
  assert.equal(stances.find((stance) => stance.agentId === "value" && stance.contract === "corners_ou")?.kind, "ineligible");
  assert.equal(stances.find((stance) => stance.agentId === "goal_overreaction" && stance.contract === "match_1x2")?.kind, "flat");
  assert.equal(stances.find((stance) => stance.agentId === "stale_reopen" && stance.contract === "ou_25")?.kind, "flat");

  for (const stance of stances.filter((candidate) => candidate.kind === "trade" || candidate.kind === "quote")) {
    const design = STRATEGY_DESIGNS.find((candidate) => candidate.id === stance.agentId)!;
    assert.ok(design.fillableNow.includes(stance.contract as never));
  }
});

test("StrategyLabProjection atomically maps one contract into Observation, Analysis, and eleven stances", () => {
  const { state } = runHeadless({ seed: 7 });
  const match = StrategyLabProjection.project(state, "match_1x2");
  assert.deepEqual(match.contracts.map((contract) => contract.id), ["match_1x2", "ou_25", "next_score", "corners_ou", "swing"]);
  assert.equal(match.analysis.deck.viewId, "match_1x2");
  assert.equal(match.analysis.deck.source, "desk_1x2");
  assert.ok(match.observation.book.length === 3);
  assert.equal(match.strategy.rows.length, 11);
  assert.equal(match.strategy.lifts.length, 3);
  assert.equal(match.analysis.referenceKind, "desk_fair");
  assert.ok(match.analysis.timeline.some((point) => point.deskProbability != null));
  assert.ok(Array.isArray(match.analysis.eventMarkers));
  assert.equal(match.analysis.referenceDrivesTrades, true);
  assert.equal(match.analysis.chart.mode, "match_1x2");
  assert.ok(match.analysis.chart.series.some((series) => series.role === "book"));
  assert.ok(match.analysis.chart.series.some((series) => series.role === "model"));
  assert.ok(match.analysis.chart.buckets.length >= 2);
  assert.ok(match.analysis.chart.residual == null || match.analysis.chart.residual.length >= 0);
  assert.equal(match.analysis.chart.traded, true);
  assert.ok(match.research.chain.includes("desk model"));
  assert.equal(match.research.marketType, "match_result");
  assert.equal(match.research.rows.length, 11);
  assert.ok(match.research.rows.every((row) => typeof row.contractPnl === "number"));
  assert.ok("fairHome" in match.research.deskInputs);

  const ou = StrategyLabProjection.project(state, "ou_25");
  assert.equal(ou.analysis.chart.mode, "ou_25");
  assert.ok(ou.analysis.chart.series.some((series) => series.id.includes("over") || series.label.toLowerCase().includes("over")));
  assert.ok(ou.analysis.chart.series.some((series) => series.role === "aux"), "O/U should include shot-pressure aux series");
  assert.equal(ou.analysis.chart.traded, true);
  assert.notEqual(ou.analysis.chart.mode, match.analysis.chart.mode);

  const horizon = StrategyLabProjection.project(state, "next_score");
  assert.equal(horizon.analysis.deck.source, "horizon");
  assert.equal(horizon.analysis.chart.mode, "next_score");
  assert.equal(horizon.analysis.chart.traded, false);
  assert.equal(horizon.observation.bookAvailable, false);
  assert.ok(horizon.strategy.rows.some((row) => row.stance.kind === "no_model"));

  const corners = StrategyLabProjection.project(state, "corners_ou");
  assert.match(corners.analysis.pricingBoundary ?? "", /NO PRICING MODEL|NO MARKET/);
  assert.equal(corners.analysis.chart.mode, "corners_ou");
  assert.equal(corners.analysis.chart.traded, false);

  const swing = StrategyLabProjection.project(state, "swing");
  assert.equal(swing.analysis.chart.mode, "swing");
  assert.ok(swing.analysis.chart.agentHint.length > 0);
});
