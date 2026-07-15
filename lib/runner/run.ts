/**
 * Headless run helpers — used by the CLI (`npm run agent`) and the demo script.
 *
 * This is the clearest artifact of "autonomous operation": no browser, no input,
 * just an agent process that ingests the TxLINE-shaped feed, makes and books
 * decisions, and writes a tamper-evident audit log to disk.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fixtureById, getFixtures, featuredFixtureId } from "@/lib/data/worldcup";
import { resolveConfig, type DeepPartial, type EngineConfig } from "@/lib/engine/config";
import { SweeperEngine } from "@/lib/engine/engine";
import type { ScenarioEvent } from "@/lib/market/ticks";
import type { EngineState } from "@/lib/engine/state";

export interface HeadlessOptions {
  fixtureId?: string;
  seed?: number;
  config?: DeepPartial<EngineConfig>;
  scenario?: ScenarioEvent[];
  /** write runs/<sessionId>.{jsonl,summary.json} */
  write?: boolean;
  outDir?: string;
}

export interface HeadlessResult {
  engine: SweeperEngine;
  state: EngineState;
  files?: { ledger: string; summary: string };
}

export function resolveFixtureSync(fixtureId?: string) {
  if (fixtureId) {
    const f = fixtureById(fixtureId);
    if (f) return f;
  }
  return fixtureById(featuredFixtureId()) ?? getFixtures()[0];
}

export function runHeadless(opts: HeadlessOptions = {}): HeadlessResult {
  const fixture = resolveFixtureSync(opts.fixtureId);
  const config = resolveConfig({ ...opts.config, seed: opts.seed ?? opts.config?.seed });
  const engine = new SweeperEngine(fixture, config, "simulation", opts.scenario ?? []);
  const state = engine.runToCompletion();

  let files: HeadlessResult["files"];
  if (opts.write) {
    const dir = resolve(opts.outDir ?? "runs");
    mkdirSync(dir, { recursive: true });
    const ledgerPath = resolve(dir, `${engine.sessionId}.jsonl`);
    const summaryPath = resolve(dir, `${engine.sessionId}.summary.json`);
    writeFileSync(ledgerPath, engine.getLedger().all().map((r) => JSON.stringify(r)).join("\n"));
    writeFileSync(
      summaryPath,
      JSON.stringify(
        {
          sessionId: engine.sessionId,
          fixture: state.fixture,
          finalScore: state.settlement?.finalScore,
          ledgerRoot: state.ledger.root,
          ledgerSize: state.ledger.size,
          signalCounts: state.signalCounts,
          settlement: state.settlement,
          leaderboard: state.agents
            .map((a) => ({ id: a.id, name: a.name, equity: a.metrics.equity, pnl: a.metrics.pnl, roi: a.metrics.roi, trades: a.metrics.trades, hitRate: a.metrics.hitRate, maxDrawdown: a.metrics.maxDrawdown }))
            .sort((x, y) => y.equity - x.equity),
        },
        null,
        2,
      ),
    );
    files = { ledger: ledgerPath, summary: summaryPath };
  }

  return { engine, state, files };
}
