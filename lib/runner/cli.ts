/**
 * Sweeper headless agent — `npm run agent -- [--fixture <id>] [--seed <n>]`.
 *
 * Runs one fixture end-to-end with no human input, streams the notable signals
 * and decisions to stdout, then writes the full audit ledger + a summary to
 * ./runs. This is the autonomous artifact judges can run in a terminal with zero
 * setup (no browser, no wallet, no credentials).
 */
import { runHeadless } from "@/lib/runner/run";
import { getFixtures } from "@/lib/data/worldcup";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
  if (process.argv.includes("--list")) {
    console.log("Available fixtures:");
    for (const f of getFixtures().slice(0, 24)) {
      console.log(`  ${f.id.padEnd(36)} ${f.home.name} v ${f.away.name}  (${f.stage})`);
    }
    return;
  }

  const fixtureId = arg("--fixture");
  const seed = arg("--seed") ? Number(arg("--seed")) : undefined;

  console.log("⚽  Sweeper — autonomous market-quality sentinel & agent arena\n");
  const { engine, state, files } = runHeadless({ fixtureId, seed, write: true });

  console.log(`Session    ${engine.sessionId}`);
  console.log(`Fixture    ${state.fixture.home} v ${state.fixture.away}  (${state.fixture.stage})`);
  console.log(`Final      ${state.settlement?.finalScore.home}-${state.settlement?.finalScore.away}  (${state.settlement?.status})`);
  console.log(`Ticks      ${state.progress.total}    Ledger records ${state.ledger.size}`);
  console.log(`Ledger root ${state.ledger.root}\n`);

  const c = state.signalCounts;
  console.log("Sentinel signals:");
  console.log(`  sharp moves   ${c.sharp_move}`);
  console.log(`  stale lines   ${c.stale_line}`);
  console.log(`  outlier prints${String(c.outlier_print).padStart(6)}`);
  console.log(`  suspensions   ${c.suspended}  (reopened ${c.reopened})`);
  console.log(`  settlement holds ${c.settlement_hold}\n`);

  const board = [...state.agents].sort((a, b) => b.metrics.equity - a.metrics.equity);
  console.log("Arena leaderboard (start bankroll 1000):");
  console.log("  rank  agent              equity     pnl      roi     trades  hit%   maxDD");
  board.forEach((a, i) => {
    const m = a.metrics;
    console.log(
      `  ${String(i + 1).padEnd(4)}  ${a.name.padEnd(18)} ${fmt(m.equity, 8)} ${fmt(m.pnl, 8)} ${fmt(m.roi * 100, 6)}%  ${String(m.trades).padStart(5)}  ${(m.hitRate * 100).toFixed(0).padStart(4)}  ${fmt(m.maxDrawdown, 6)}`,
    );
  });

  const naive = state.agents.find((a) => a.id === "momentum_naive");
  const guarded = state.agents.find((a) => a.id === "momentum_guarded");
  if (naive && guarded) {
    const diff = guarded.metrics.pnl - naive.metrics.pnl;
    console.log(
      `\nSentinel value: Guarded Momentum beat Naive Momentum by ${diff.toFixed(2)} units` +
        ` (${guarded.metrics.pnl.toFixed(2)} vs ${naive.metrics.pnl.toFixed(2)}).`,
    );
  }

  if (files) {
    console.log(`\nWrote ${files.ledger}`);
    console.log(`Wrote ${files.summary}`);
  }
}

function fmt(x: number, w: number): string {
  return x.toFixed(2).padStart(w);
}

main();
