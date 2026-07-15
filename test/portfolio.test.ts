import test from "node:test";
import assert from "node:assert/strict";
import { Portfolio } from "@/lib/execution/portfolio";
import { computeOutcomes } from "@/lib/proof/settlement";
import type { Fill } from "@/lib/agents/types";

function fill(side: "buy" | "sell", price: number, size: number, selId = "match_result:home"): Fill {
  return {
    agentId: "t",
    fixtureId: "f",
    marketType: "match_result",
    selectionKey: "home",
    selId,
    side,
    price,
    size,
    seq: 0,
    tsMs: 0,
    rationale: "",
  };
}

test("long settled to a win pays (1 - entry) * size", () => {
  const p = new Portfolio("t", 1000);
  p.applyFill(fill("buy", 0.4, 100));
  p.settle(new Map([["match_result:home", 1]]));
  assert.equal(round(p.equity()), 1060); // 100 * (1 - 0.4)
});

test("short settled to a loss pays (entry - 0) * size", () => {
  const p = new Portfolio("t", 1000);
  p.applyFill(fill("sell", 0.6, 100));
  p.settle(new Map([["match_result:home", 0]]));
  assert.equal(round(p.equity()), 1060); // -100 * (0 - 0.6)
});

test("closing a position realizes PnL against VWAP", () => {
  const p = new Portfolio("t", 1000);
  p.applyFill(fill("buy", 0.4, 100));
  p.applyFill(fill("sell", 0.5, 100)); // close 100 at 0.5 → +10
  const m = p.metrics();
  assert.equal(m.realized, 10);
  assert.equal(p.net("match_result:home"), 0);
  assert.equal(m.hitRate, 1);
});

test("VWAP averages multiple entries", () => {
  const p = new Portfolio("t", 1000);
  p.applyFill(fill("buy", 0.4, 100));
  p.applyFill(fill("buy", 0.6, 100));
  assert.equal(round(p.avgPrice("match_result:home")), 0.5);
  assert.equal(p.net("match_result:home"), 200);
});

test("computeOutcomes resolves 1X2 and totals correctly", () => {
  const o = computeOutcomes({ home: 3, away: 1 });
  assert.equal(o["match_result:home"], 1);
  assert.equal(o["match_result:draw"], 0);
  assert.equal(o["match_result:away"], 0);
  assert.equal(o["total_goals:over"], 1); // 4 > 2.5
  assert.equal(o["total_goals:under"], 0);

  const d = computeOutcomes({ home: 1, away: 1 });
  assert.equal(d["match_result:draw"], 1);
  assert.equal(d["total_goals:under"], 1); // 2 < 2.5
});

function round(x: number): number {
  return Math.round(x * 100) / 100;
}
