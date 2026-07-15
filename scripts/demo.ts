/**
 * Scripted demo — `npm run demo`.
 *
 * Runs a curated fixture and a forced scenario (a stale window and an outlier
 * print at known minutes) so the narrative is identical every time: the sentinel
 * catches the injected anomalies, the guarded agent avoids the toxic chase, the
 * market maker pulls quotes, and settlement resolves against a proof. Ideal as
 * the spine of the demo video voiceover.
 */
import { runHeadless } from "@/lib/runner/run";
import type { ScenarioEvent } from "@/lib/market/ticks";

const scenario: ScenarioEvent[] = [
  { kind: "stale", atMinute: 33, durationMinutes: 4 },
  { kind: "outlier", atMinute: 58, marketType: "match_result" },
  { kind: "suspend", atMinute: 71, durationMinutes: 3 },
];

function main() {
  console.log("⚽  Sweeper demo — deterministic scenario run\n");
  const { engine, state } = runHeadless({ seed: 7, scenario, write: true });

  console.log(`Fixture   ${state.fixture.home} v ${state.fixture.away}`);
  console.log(`Final     ${state.settlement?.finalScore.home}-${state.settlement?.finalScore.away}`);
  console.log(`Root      ${state.ledger.root}\n`);

  console.log("Scenario injected:");
  console.log("  33' stale line (4m) · 58' outlier print · 71' suspension (3m)\n");

  console.log("Detected by the sentinel:");
  const c = state.signalCounts;
  console.log(`  ${c.sharp_move} sharp · ${c.stale_line} stale · ${c.outlier_print} outlier · ${c.suspended} suspend / ${c.reopened} reopen\n`);

  const board = [...state.agents].sort((a, b) => b.metrics.equity - a.metrics.equity);
  console.log("Final standings:");
  board.forEach((a, i) => console.log(`  ${i + 1}. ${a.name.padEnd(18)} pnl ${a.metrics.pnl.toFixed(2)} (roi ${(a.metrics.roi * 100).toFixed(1)}%)`));

  // Prove a single decision is anchored in the ledger root
  const ledger = engine.getLedger();
  const firstDecision = ledger.all().find((r) => r.kind === "decision");
  if (firstDecision) {
    const bundle = engine.proof(firstDecision.seq);
    console.log(`\nProof check — ledger record #${firstDecision.seq} (${firstDecision.summary.slice(0, 48)}…)`);
    console.log(`  inclusion proof verifies against root: ${bundle?.verified}`);
  }
}

main();
