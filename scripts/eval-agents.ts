/**
 * Walk-forward eval across seeds — prints agent PnL table + Sentinel edge.
 * Run: npx tsx scripts/eval-agents.ts
 */
import { runHeadless } from "@/lib/runner/run";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function main() {
  const totals = new Map<string, { pnl: number; trades: number; name: string }>();
  let guardedEdgeSum = 0;

  for (const seed of SEEDS) {
    const { state } = runHeadless({ seed });
    for (const a of state.agents) {
      const cur = totals.get(a.id) ?? { pnl: 0, trades: 0, name: a.name };
      cur.pnl += a.metrics.pnl;
      cur.trades += a.metrics.trades;
      totals.set(a.id, cur);
    }
    if (state.scorecard.guardedEdge != null) guardedEdgeSum += state.scorecard.guardedEdge;
  }

  const ranked = [...totals.entries()].sort((a, b) => b[1].pnl - a[1].pnl);
  console.log(`\nSweeper agent eval · ${SEEDS.length} seeds\n`);
  console.log("  rank  agent                 meanPnL   meanTrades");
  ranked.forEach(([, v], i) => {
    const meanPnl = v.pnl / SEEDS.length;
    const meanTrades = v.trades / SEEDS.length;
    console.log(
      `  ${String(i + 1).padEnd(4)}  ${v.name.padEnd(20)} ${meanPnl.toFixed(2).padStart(8)}  ${meanTrades.toFixed(1).padStart(10)}`,
    );
  });
  console.log(`\n  mean Sentinel edge (guarded − naive): ${(guardedEdgeSum / SEEDS.length).toFixed(2)}`);
  console.log(`  regimes sampled via last state of each seed\n`);
}

main();
