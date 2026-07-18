/**
 * Regime gate + Hybrid Thesis path confirmation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { classifyRegime, regimeBlocksDirectional } from "@/lib/agents/regime";
import { resolveConfig } from "@/lib/engine/config";
import type { DeskPathFeatures } from "@/lib/agents/desk-features";

function path(vol: number): DeskPathFeatures {
  return {
    series: [],
    windowMinutes: 10,
    homeRet1: 0,
    homeRet5: 0,
    homeRet10: 0,
    hybridSlope5: 0,
    tempoAccel3: 0,
    pressureDelta5: 0,
    homePathVol: vol,
    minutesSinceCollapse: null,
    lastCollapseWinner: null,
    lastCollapseSurprise: false,
    tempoOddsDivergence: false,
  };
}

test("classifyRegime maps path vol to calm/normal/chaotic", () => {
  const cfg = resolveConfig();
  assert.equal(classifyRegime(path(0.005), cfg), "calm");
  assert.equal(classifyRegime(path(0.03), cfg), "normal");
  assert.equal(classifyRegime(path(0.08), cfg), "chaotic");
});

test("regimeBlocksDirectional only fires in chaotic", () => {
  const cfg = resolveConfig();
  assert.equal(regimeBlocksDirectional(path(0.03), cfg), null);
  assert.match(regimeBlocksDirectional(path(0.08), cfg) ?? "", /CHAOTIC/);
});
