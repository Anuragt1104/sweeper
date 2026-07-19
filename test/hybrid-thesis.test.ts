/**
 * Hybrid Thesis agent tests — desk-model fair drives trades; Quiet / missing Horizon stand down.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { HybridThesisAgent } from "@/lib/agents/hybrid-thesis";
import { resolveConfig } from "@/lib/engine/config";
import type { AgentContext, DeskSignals, PortfolioView } from "@/lib/agents/types";
import type { DeskPathFeatures } from "@/lib/agents/desk-features";
import type { MarketTick } from "@/lib/market/ticks";
import type { HorizonPublication } from "@/lib/horizon/machine";
import type { SentinelAssessment } from "@/lib/sentinel/types";
import { runHeadless } from "@/lib/runner/run";
import { emptyDeskModel } from "@/lib/desk/empty";
import type { DeskModelView } from "@/lib/desk/compose";

const emptyBook: PortfolioView = {
  net: () => 0,
  avgPrice: () => 0,
  equity: () => 1000,
};

const emptyPath: DeskPathFeatures = {
  series: [],
  windowMinutes: 0,
  homeRet1: null,
  homeRet5: null,
  homeRet10: null,
  hybridSlope5: null,
  tempoAccel3: null,
  pressureDelta5: null,
  homePathVol: null,
  minutesSinceCollapse: null,
  lastCollapseWinner: null,
  lastCollapseSurprise: false,
  tempoOddsDivergence: false,
};

function modelFair(home: number, edgeHome = 0.08): DeskModelView {
  return emptyDeskModel({
    ready: true,
    fairHome: home,
    fair1x2: { home, draw: 0.28, away: 1 - home - 0.28 },
    scoreState1x2: { home: home - 0.02, draw: 0.28, away: 1 - home + 0.02 - 0.28 },
    horizonDrive: "goal_home",
    horizonHomeTilt: 0.03,
    edgeVsObs: { home: edgeHome, draw: 0, away: -edgeHome / 2 },
    hybrid: {
      homeTilt: 0.02,
      tempoIntensity: 0.4,
      tempoDifferential: 0.2,
      signedOddsVelocityHome: 0.01,
      pressure: 0.45,
    },
    detail: "test model",
  });
}

function withDesk(
  partial: Omit<DeskSignals, "path" | "model"> & {
    path?: DeskPathFeatures;
    model?: DeskModelView;
  },
): DeskSignals {
  return {
    ...partial,
    path: partial.path ?? emptyPath,
    model: partial.model ?? modelFair(0.48),
    hybridThesisProb: partial.hybridThesisProb ?? partial.model?.fairHome ?? 0.48,
    pressure: partial.pressure,
    tempoIntensity: partial.tempoIntensity,
  };
}

const emptyAssessment: SentinelAssessment = {
  seq: 0,
  tsMs: 0,
  quality: 80,
  signals: [],
  suspendedMarkets: [],
  staleSelections: [],
};

function baseTick(homeObs = 0.4): MarketTick {
  return {
    seq: 10,
    minute: 20,
    phase: 1 as MarketTick["phase"],
    tsMs: 1_000_000,
    fixtureId: "t",
    suspended: false,
    score: {
      goals: { home: 0, away: 0 },
      cards: { homeYellow: 0, awayYellow: 0, homeRed: 0, awayRed: 0 },
      corners: { home: 0, away: 0 },
    },
    events: [],
    odds: {
      markets: [
        {
          type: "match_result",
          label: "1X2",
          selections: [
            { key: "home", label: "Home", impliedProb: homeObs, price: homeObs, prevPrice: homeObs },
            { key: "draw", label: "Draw", impliedProb: 0.28, price: 0.28, prevPrice: 0.28 },
            { key: "away", label: "Away", impliedProb: 1 - homeObs - 0.28, price: 0.3, prevPrice: 0.3 },
          ],
        },
      ],
    },
    reference: {
      markets: [
        {
          type: "match_result",
          label: "1X2",
          selections: [
            { key: "home", label: "Home", impliedProb: homeObs, price: homeObs, prevPrice: homeObs },
            { key: "draw", label: "Draw", impliedProb: 0.28, price: 0.28, prevPrice: 0.28 },
            { key: "away", label: "Away", impliedProb: 1 - homeObs - 0.28, price: 0.3, prevPrice: 0.3 },
          ],
        },
      ],
      provenance: "simulation",
    },
    pricing: { mode: "simulation", detail: "test" },
  } as unknown as MarketTick;
}

function horizon(thesis: "goal_home" | "goal_away" | "quiet" | "card", p: number): HorizonPublication {
  const rest = (1 - p) / 3;
  return {
    id: "hz-1",
    fixtureId: "t",
    openedMinute: 15,
    closesMinute: 25,
    openedAtMs: 1,
    lastRefreshAtMs: 1,
    refreshNumber: 0,
    probabilities: {
      goal_home: thesis === "goal_home" ? p : rest,
      goal_away: thesis === "goal_away" ? p : rest,
      card: thesis === "card" ? p : rest,
      quiet: thesis === "quiet" ? p : rest,
    },
    thesis,
    action: thesis === "quiet" ? "goal_home" : thesis === "card" ? "card" : thesis,
    support: 40,
    bucket: "test",
    fallback: "exact",
    lowData: false,
    source: "simulation-bootstrap",
    provenance: "test",
  };
}

function ctx(desk: ReturnType<typeof withDesk> | undefined, tick = baseTick()): AgentContext {
  return {
    tick,
    assessment: emptyAssessment,
    features: new Map(),
    book: emptyBook,
    cfg: resolveConfig(),
    readiness: { ready: true, reasons: [], checkedAtMs: 0, scoreAgeMs: 0, oddsAgeMs: 0 },
    desk,
  };
}

test("Hybrid Thesis stands down without Horizon", () => {
  const agent = new HybridThesisAgent();
  const d = agent.onTick(
    ctx(
      withDesk({
        horizon: null,
        hybridThesisProb: 0.5,
        pressure: 0.4,
        tempoIntensity: 0.3,
        lastCollapse: null,
        model: { ...modelFair(0.5), horizonDrive: null },
      }),
    ),
  );
  assert.equal(d.stoodDown, true);
  assert.match(d.rationale, /no open Horizon/i);
});

test("Hybrid Thesis stands down on card thesis/action", () => {
  const agent = new HybridThesisAgent();
  const d = agent.onTick(
    ctx(
      withDesk({
        horizon: horizon("card", 0.4),
        hybridThesisProb: 0.4,
        pressure: 0.4,
        tempoIntensity: 0.3,
        lastCollapse: null,
        model: { ...modelFair(0.45), horizonDrive: null },
      }),
    ),
  );
  assert.equal(d.stoodDown, true);
  assert.match(d.rationale, /no directional/i);
});

test("Hybrid Thesis trades when desk fair edges the book on mapped drive", () => {
  const agent = new HybridThesisAgent();
  const fair = 0.5;
  const obs = 0.4;
  const d = agent.onTick(
    ctx(
      withDesk({
        horizon: horizon("goal_home", 0.48),
        hybridThesisProb: fair,
        pressure: 0.5,
        tempoIntensity: 0.4,
        lastCollapse: null,
        path: {
          ...emptyPath,
          hybridSlope5: 0.015,
          homeRet5: 0.01,
          homePathVol: 0.008,
        },
        model: {
          ...modelFair(fair, fair - obs),
          horizonDrive: "goal_home",
        },
      }),
      baseTick(obs),
    ),
  );
  assert.equal(d.stoodDown, undefined);
  assert.ok(d.orders.length >= 1, "should place at least one order");
  assert.equal(d.orders[0].selectionKey, "home");
  assert.equal(d.kind, "trade");
});

test("Hybrid Thesis does not trade on tempo alone (no horizon)", () => {
  const agent = new HybridThesisAgent();
  const d = agent.onTick(
    ctx(
      withDesk({
        horizon: null,
        hybridThesisProb: null,
        pressure: 0.9,
        tempoIntensity: 0.95,
        lastCollapse: null,
      }),
    ),
  );
  assert.equal(d.stoodDown, true);
  assert.equal(d.orders.length, 0);
});

test("full run includes Hybrid Thesis in the arena and scorecard", () => {
  const { state } = runHeadless({ seed: 7 });
  const hybrid = state.agents.find((a) => a.id === "hybrid_thesis");
  assert.ok(hybrid, "hybrid_thesis agent present");
  assert.ok(state.scorecard, "scorecard present");
  assert.equal(typeof state.scorecard.guardedEdge, "number");
  assert.ok(state.agents.every((a) => a.lastDecisionKind !== undefined));
});
