/**
 * Desk feature store — rolling paths and multi-horizon returns.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DeskFeatureStore } from "@/lib/agents/desk-features";
import { EMPTY_SHOCK_STRIP } from "@/lib/tempo/types";
import type { MarketTick } from "@/lib/market/ticks";
import { GamePhase } from "@/lib/txline/types";

function tickAt(minute: number, homeProb: number, seq: number): MarketTick {
  return {
    fixtureId: "t",
    seq,
    tsMs: seq * 30_000,
    minute,
    phase: GamePhase.FirstHalf,
    suspended: false,
    score: {
      goals: { home: 0, away: 0 },
      yellow: { home: 0, away: 0 },
      red: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
    },
    events: [],
    odds: {
      tsMs: seq * 30_000,
      markets: [
        {
          type: "match_result",
          label: "1X2",
          selections: [
            { key: "home", label: "H", impliedProb: homeProb, price: homeProb, prevPrice: homeProb },
            { key: "draw", label: "D", impliedProb: 0.28, price: 0.28, prevPrice: 0.28 },
            { key: "away", label: "A", impliedProb: 1 - homeProb - 0.28, price: 1 - homeProb - 0.28, prevPrice: 0.3 },
          ],
        },
      ],
    },
    reference: {
      tsMs: seq * 30_000,
      markets: [
        {
          type: "match_result",
          label: "1X2",
          selections: [
            { key: "home", label: "H", impliedProb: homeProb, price: homeProb, prevPrice: homeProb },
            { key: "draw", label: "D", impliedProb: 0.28, price: 0.28, prevPrice: 0.28 },
            { key: "away", label: "A", impliedProb: 1 - homeProb - 0.28, price: 1 - homeProb - 0.28, prevPrice: 0.3 },
          ],
        },
      ],
    },
    pricing: { mode: "simulation", detail: "test" },
  } as unknown as MarketTick;
}

test("DeskFeatureStore accumulates series and computes multi-horizon returns", () => {
  const store = new DeskFeatureStore();
  const strip = structuredClone(EMPTY_SHOCK_STRIP);
  strip.hybrid.series = [];

  for (let i = 0; i <= 20; i++) {
    const minute = i * 0.5;
    const home = 0.4 + i * 0.005;
    strip.hybrid.series.push({
      minute,
      thesisProb: 0.3 + i * 0.01,
      tempoIntensity: 0.2 + (i % 5) * 0.05,
      oddsVelocity: 0.1,
      pressure: 0.25,
      thesis: "quiet",
    });
    const feat = store.update(tickAt(minute, home, i), strip, null, null);
    if (i === 20) {
      assert.ok(feat.series.length >= 10);
      assert.ok(feat.homeRet5 != null && feat.homeRet5 > 0);
      assert.ok(feat.hybridSlope5 != null && feat.hybridSlope5 > 0);
      assert.ok(feat.windowMinutes >= 8);
    }
  }
});
