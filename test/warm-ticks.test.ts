/**
 * Historical score → warm-tick builder.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ticksFromHistoricalScores } from "@/lib/market/warm-ticks";
import type { Fixture, OddsSnapshot } from "@/lib/txline/types";
import { GamePhase } from "@/lib/txline/types";
import type { NormalizedScoreRecord } from "@/lib/txline/normalize";

const fixture = {
  id: "t",
  competition: "test",
  kickoff: new Date().toISOString(),
  home: { id: "h", name: "H" },
  away: { id: "a", name: "A" },
} as Fixture;

const emptyOdds = {
  markets: [
    {
      type: "match_result",
      label: "1X2",
      selections: [
        { key: "home", label: "Home", impliedProb: 0.4, price: 0.4 },
        { key: "draw", label: "Draw", impliedProb: 0.3, price: 0.3 },
        { key: "away", label: "Away", impliedProb: 0.3, price: 0.3 },
      ],
    },
  ],
} as OddsSnapshot;

function score(seq: number, minute: number): NormalizedScoreRecord {
  return {
    action: "update",
    finalised: false,
    explicitEvent: null,
    snapshot: {
      fixtureId: "t",
      seq,
      ts: new Date(1_000_000 + seq * 1000).toISOString(),
      phase: GamePhase.FirstHalf,
      minute,
      goals: { home: 0, away: 0 },
      yellow: { home: 0, away: 0 },
      red: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      periods: {
        firstHalf: {
          goals: { home: 0, away: 0 },
          yellow: { home: 0, away: 0 },
          red: { home: 0, away: 0 },
          corners: { home: 0, away: 0 },
        },
        secondHalf: {
          goals: { home: 0, away: 0 },
          yellow: { home: 0, away: 0 },
          red: { home: 0, away: 0 },
          corners: { home: 0, away: 0 },
        },
      },
    },
  };
}

test("ticksFromHistoricalScores samples score history into warm ticks", () => {
  const scores = Array.from({ length: 40 }, (_, i) => score(i + 1, i * 0.5));
  const ticks = ticksFromHistoricalScores(fixture, scores, emptyOdds, { maxTicks: 20 });
  assert.ok(ticks.length <= 20);
  assert.ok(ticks.length >= 2);
  assert.equal(ticks[0]!.fixtureId, "t");
  assert.equal(ticks[0]!.odds, emptyOdds);
  assert.ok(ticks.at(-1)!.minute > ticks[0]!.minute);
});
