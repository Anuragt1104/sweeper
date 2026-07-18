/**
 * Unit tests for contract deck projection, strategy bindings, and match intensity.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { projectContractDeck, snapshotDeskModel } from "@/lib/desk/contract-deck";
import {
  bindingsForContract,
  roleForContract,
  STRATEGY_CONTRACT_BINDINGS,
} from "@/lib/desk/strategy-contracts";
import { computeMatchIntensity } from "@/lib/desk/match-intensity";
import { EMPTY_SHOCK_STRIP } from "@/lib/tempo/types";
import { GamePhase } from "@/lib/txline/types";
import type { EngineState } from "@/lib/engine/state";
import { emptyDeskModel } from "@/lib/desk/empty";

function stubState(): EngineState {
  const model = snapshotDeskModel(
    emptyDeskModel({
      ready: true,
      fair1x2: { home: 0.45, draw: 0.28, away: 0.27 },
      fairHome: 0.45,
      detail: "test",
      horizonDrive: "goal_home",
    }),
  );
  return {
    fixture: {
      id: "f1",
      home: "Home",
      away: "Away",
      homeCode: "HOM",
      awayCode: "AWY",
      stage: "Group",
      competition: "WC",
    },
    current: {
      minute: 40,
      markets: [
        {
          type: "match_result",
          selections: [
            { key: "home", prob: 0.5 },
            { key: "draw", prob: 0.25 },
            { key: "away", prob: 0.25 },
          ],
        },
      ],
    },
    deskModel: model,
    horizon: {
      current: {
        refreshNumber: 1,
        openedMinute: 30,
        closesMinute: 40,
        thesis: "goal_home",
        action: "goal_home",
        probabilities: { goal_home: 0.4, goal_away: 0.2, card: 0.15, quiet: 0.25 },
        lowData: false,
        support: 12,
        bucket: "mid",
        fallback: "none",
      },
    },
    shockStrip: structuredClone(EMPTY_SHOCK_STRIP),
  } as unknown as EngineState;
}

test("projectContractDeck match_1x2 uses desk fair vs book", () => {
  const deck = projectContractDeck(stubState(), "match_1x2");
  assert.equal(deck.source, "desk_1x2");
  assert.equal(deck.traded, true);
  assert.equal(deck.outs.length, 3);
  assert.equal(deck.outs[0]!.key, "home");
  assert.equal(deck.outs[0]!.modelProb, 0.45);
  assert.equal(deck.outs[0]!.bookProb, 0.5);
  assert.equal(deck.outs[0]!.thesis, true);
});

test("projectContractDeck next_score uses Horizon outs", () => {
  const deck = projectContractDeck(stubState(), "next_score");
  assert.equal(deck.source, "horizon");
  assert.equal(deck.traded, false);
  assert.equal(deck.outs.length, 4);
  assert.equal(deck.outs[0]!.displayProb, 0.4);
  assert.equal(deck.outs[0]!.thesis, true);
});

test("projectContractDeck ou_25 is book_lens when empty", () => {
  const deck = projectContractDeck(stubState(), "ou_25");
  assert.ok(deck.source === "book_lens" || deck.source === "unavailable");
  assert.equal(deck.traded, true);
});

test("hybrid_thesis trades match_1x2 and signal-uses next_score", () => {
  const hybrid = STRATEGY_CONTRACT_BINDINGS.find((b) => b.agentId === "hybrid_thesis")!;
  assert.equal(roleForContract(hybrid, "match_1x2"), "trades");
  assert.equal(roleForContract(hybrid, "next_score"), "signal_only");
  assert.equal(roleForContract(hybrid, "corners_ou"), "unused");
  const for1x2 = bindingsForContract("match_1x2");
  assert.ok(for1x2.some((b) => b.agentId === "hybrid_thesis" && b.role === "trades"));
});

test("computeMatchIntensity counts flurry and cards", () => {
  const score = {
    fixtureId: "f",
    seq: 1,
    ts: "",
    phase: GamePhase.SecondHalf,
    minute: 70,
    goals: { home: 2, away: 1 },
    yellow: { home: 1, away: 1 },
    red: { home: 0, away: 0 },
    corners: { home: 3, away: 2 },
    periods: {
      firstHalf: {
        goals: { home: 0, away: 0 },
        yellow: { home: 0, away: 0 },
        red: { home: 0, away: 0 },
        corners: { home: 0, away: 0 },
      },
      secondHalf: {
        goals: { home: 2, away: 1 },
        yellow: { home: 1, away: 1 },
        red: { home: 0, away: 0 },
        corners: { home: 3, away: 2 },
      },
    },
  };
  const events = [
    {
      fixtureId: "f",
      seq: 1,
      ts: "",
      minute: 62,
      phase: GamePhase.SecondHalf,
      kind: "goal" as const,
      side: "home" as const,
      label: "Goal — HOM",
    },
    {
      fixtureId: "f",
      seq: 2,
      ts: "",
      minute: 65,
      phase: GamePhase.SecondHalf,
      kind: "goal" as const,
      side: "away" as const,
      label: "Goal — AWY",
    },
    {
      fixtureId: "f",
      seq: 3,
      ts: "",
      minute: 68,
      phase: GamePhase.SecondHalf,
      kind: "goal" as const,
      side: "home" as const,
      label: "Goal — HOM",
    },
    {
      fixtureId: "f",
      seq: 4,
      ts: "",
      minute: 69,
      phase: GamePhase.SecondHalf,
      kind: "yellow" as const,
      side: "away" as const,
      label: "Yellow",
    },
    {
      fixtureId: "f",
      seq: 5,
      ts: "",
      minute: 70,
      phase: GamePhase.SecondHalf,
      kind: "yellow" as const,
      side: "home" as const,
      label: "Yellow",
    },
  ];
  const i = computeMatchIntensity(score, events);
  assert.equal(i.goalsLast10Min, 3);
  assert.equal(i.cardsLast5Min, 2);
  assert.ok(i.flurrySummary?.includes("3"));
  assert.equal(i.majorEvent, true);
  assert.equal(i.lastGoalMinute, 68);
});
