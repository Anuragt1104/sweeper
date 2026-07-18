import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fixtureById, getFixtures } from "../lib/data/worldcup";
import { resolveConfig } from "../lib/engine/config";
import type { FeedHealth, TradeReadiness } from "../lib/engine/state";
import { LiveShadowExchange } from "../lib/execution/live-shadow";
import { MarketTickGenerator, type MarketTick } from "../lib/market/ticks";
import { TxlineConsensusReference } from "../lib/pricing/txline-consensus-reference";
import { evaluateTradeReadiness } from "../lib/readiness/trade-readiness";

const fixture = fixtureById("wc26-a-md2-arg-pol") ?? getFixtures()[0];
const config = resolveConfig({ seed: 7 });

test("robust TxLINE reference ignores duplicates, warms after five changes, and normalizes 1X2", () => {
  const model = new TxlineConsensusReference();
  const generator = new MarketTickGenerator(fixture, config);
  const base = generator.at(10);
  let state = model.update({ fixture, score: base.score, odds: base.odds, events: [], tsMs: base.tsMs });
  state = model.update({ fixture, score: base.score, odds: base.odds, events: [], tsMs: base.tsMs + 1_000 });
  assert.equal(state.provenance.sampleCount, 1, "duplicate vectors do not advance warm-up");
  assert.equal(state.provenance.ready, false);

  for (let index = 1; index <= 4; index += 1) {
    const odds = structuredClone(base.odds);
    const market = odds.markets.find((candidate) => candidate.type === "match_result")!;
    market.selections[0].impliedProb += index * 0.002;
    market.selections[1].impliedProb -= index * 0.001;
    market.selections[2].impliedProb -= index * 0.001;
    state = model.update({ fixture, score: base.score, odds, events: [], tsMs: base.tsMs + index * 10_000 });
  }
  assert.equal(state.provenance.sampleCount, 5);
  assert.equal(state.provenance.ready, true);
  const total = state.snapshot.markets
    .find((market) => market.type === "match_result")!
    .selections.reduce((sum, selection) => sum + selection.impliedProb, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test("trade readiness requires live accepted fresh in-running 1X2 and warm reference", () => {
  const now = Date.now();
  const tick = liveTick(now);
  const health: FeedHealth = {
    status: "live",
    detail: "ok",
    watching: 1,
    scoreStreamAccepted: true,
    oddsStreamAccepted: true,
    hydratedScore: true,
    hydratedOdds: true,
    lastScoreAtMs: now,
    lastOddsAtMs: now,
    reconnectCount: 0,
    sequenceGap: null,
    fatal: false,
  };
  assert.equal(evaluateTradeReadiness(tick, health, "live", now).ready, true);
  tick.odds.lifecycle!.gameState = "HT";
  const blocked = evaluateTradeReadiness(tick, health, "live", now);
  assert.equal(blocked.ready, false);
  assert.match(blocked.reasons.join(" "), /lifecycle/);
});

test("live shadow takers use observed consensus and makers fill only on later crossings", () => {
  const exchange = new LiveShadowExchange(config);
  const readiness = ready();
  const first = liveTick(Date.now(), 0.4, "odds-1", 10);
  const quote = {
    agentId: "maker",
    marketType: "match_result" as const,
    selectionKey: "home",
    selId: "match_result:home",
    bid: 0.35,
    ask: 0.45,
    size: 5,
  };
  assert.deepEqual(exchange.matchQuotes([quote], first, readiness), []);

  const heartbeat = liveTick(first.tsMs + 1_000, 0.48, "odds-2", 11);
  heartbeat.upstream!.heartbeat = true;
  assert.deepEqual(exchange.matchQuotes([quote], heartbeat, readiness), []);

  const crossed = liveTick(first.tsMs + 2_000, 0.48, "odds-2", 12);
  const fills = exchange.matchQuotes([quote], crossed, readiness);
  assert.equal(fills.length, 1);
  assert.equal(fills[0].side, "sell");
  assert.equal(fills[0].price, 0.45);

  const result = exchange.executeOrder({
    agentId: "value",
    fixtureId: fixture.id,
    marketType: "match_result",
    selectionKey: "home",
    selId: "match_result:home",
    side: "buy",
    price: 0.1,
    size: 2,
    seq: crossed.seq,
    tsMs: crossed.tsMs,
    rationale: "test",
  }, crossed, readiness);
  assert.equal(result.ok, true);
  if (result.ok) assert.ok(result.fill.price > 0.48, "fill is based on observed consensus plus slippage");
});

test("live modules have no dependency on simulation modules", async () => {
  const files = ["lib/txline/live.ts", "lib/execution/live-shadow.ts"];
  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*simulation/);
  }
});

function liveTick(now: number, homeProbability = 0.4, messageId = "odds-1", seq = 10): MarketTick {
  const tick = new MarketTickGenerator(fixture, config).at(10);
  tick.seq = seq;
  tick.tsMs = now;
  tick.pricing = {
    source: "txline_robust_reference",
    sampleCount: 5,
    ready: true,
    standDownReason: null,
    updatedAtMs: now,
  };
  tick.odds.lifecycle = { inRunning: true, gameState: "H1", suspended: false };
  tick.upstream = {
    scoreSeq: seq,
    scoreTsMs: now,
    oddsTsMs: now,
    oddsMessageId: messageId,
  };
  const market = tick.odds.markets.find((candidate) => candidate.type === "match_result")!;
  const home = market.selections.find((selection) => selection.key === "home")!;
  const remainder = 1 - homeProbability;
  const others = market.selections.filter((selection) => selection.key !== "home");
  home.impliedProb = homeProbability;
  others.forEach((selection) => { selection.impliedProb = remainder / others.length; });
  return tick;
}

function ready(): TradeReadiness {
  return { ready: true, reasons: [], checkedAtMs: Date.now(), scoreAgeMs: 0, oddsAgeMs: 0 };
}
