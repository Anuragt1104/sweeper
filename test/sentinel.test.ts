import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, resolveConfig } from "@/lib/engine/config";
import { MarketTickGenerator } from "@/lib/market/ticks";
import { Sentinel } from "@/lib/sentinel/sentinel";
import { MarketMakerAgent } from "@/lib/agents/maker";
import { Portfolio } from "@/lib/execution/portfolio";
import { getFixtures } from "@/lib/data/worldcup";

const fixture = getFixtures()[0];

test("sentinel detects injected stale, outlier, and suspension anomalies", () => {
  const cfg = resolveConfig({ seed: 3 });
  const gen = new MarketTickGenerator(fixture, cfg, [
    { kind: "stale", atMinute: 30, durationMinutes: 5 },
    { kind: "outlier", atMinute: 55, marketType: "match_result" },
    { kind: "suspend", atMinute: 70, durationMinutes: 3 },
  ]);
  const sentinel = new Sentinel(fixture.id, cfg);
  const counts: Record<string, number> = {};
  for (const tick of gen.stream()) {
    const { assessment } = sentinel.process(tick);
    for (const s of assessment.signals) counts[s.kind] = (counts[s.kind] ?? 0) + 1;
  }
  assert.ok((counts.stale_line ?? 0) >= 1, "should flag the stale line");
  assert.ok((counts.suspended ?? 0) >= 1, "should flag the suspension");
  assert.ok((counts.reopened ?? 0) >= 1, "should flag the reopen");
  // a goal-driven repricing always produces at least one sharp move over a match
  assert.ok((counts.sharp_move ?? 0) >= 1, "should flag sharp moves");
});

test("market quality drops while suspended and recovers after", () => {
  const cfg = resolveConfig({ seed: 5 });
  const gen = new MarketTickGenerator(fixture, cfg, [{ kind: "suspend", atMinute: 40, durationMinutes: 4 }]);
  const sentinel = new Sentinel(fixture.id, cfg);
  let qDuring = 100;
  let qAfter = 0;
  for (const tick of gen.stream()) {
    const { assessment } = sentinel.process(tick);
    if (tick.suspended) qDuring = Math.min(qDuring, assessment.quality);
    if (tick.minute > 80) qAfter = assessment.quality;
  }
  assert.ok(qDuring < 80, `quality should drop while suspended (got ${qDuring})`);
  assert.ok(qAfter > qDuring, "quality should recover after the book reopens");
});

test("market maker pulls all quotes while the book is suspended", () => {
  const cfg = DEFAULT_CONFIG;
  const gen = new MarketTickGenerator(fixture, cfg, [{ kind: "suspend", atMinute: 50, durationMinutes: 4 }]);
  const sentinel = new Sentinel(fixture.id, cfg);
  const maker = new MarketMakerAgent();
  const book = new Portfolio("maker", cfg.execution.bankroll);
  let sawSuspendedTick = false;
  for (const tick of gen.stream()) {
    const { assessment, features } = sentinel.process(tick);
    const decision = maker.onTick({ tick, assessment, features, book, cfg });
    if (tick.suspended) {
      sawSuspendedTick = true;
      assert.equal(decision.quotes.length, 0, "no quotes while suspended");
    }
  }
  assert.ok(sawSuspendedTick, "scenario should contain a suspended tick");
});
