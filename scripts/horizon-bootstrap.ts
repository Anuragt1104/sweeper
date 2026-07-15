import { MatchSimulation } from "../lib/txline/simulation";
import { getFixtures } from "../lib/data/worldcup";
import { buildFrequencyArtifact, type HorizonSample } from "../lib/horizon/training";
import type { HorizonOutcome } from "../lib/horizon/probability";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const samples: HorizonSample[] = [];
const fixtures = getFixtures(new Date("2026-07-14T00:00:00.000Z"));
for (const fixture of fixtures) {
  const simulation = new MatchSimulation(fixture);
  for (let minute = 0; minute < 90; minute += 1) {
    const score = simulation.scoreSnapshot(minute, minute, new Date(0).toISOString());
    const event = simulation.eventsBetween(minute, minute + 10, new Date(0).toISOString())
      .filter((candidate) => candidate.kind === "goal" || candidate.kind === "yellow" || candidate.kind === "red")
      .sort((a, b) => a.minute - b.minute || a.seq - b.seq)[0];
    const outcome: HorizonOutcome = !event
      ? "quiet"
      : event.kind === "goal"
        ? event.side === "away" ? "goal_away" : "goal_home"
        : "card";
    samples.push({
      minute,
      scoreDiff: score.goals.home - score.goals.away,
      cardDiff: score.yellow.home + 2 * score.red.home - score.yellow.away - 2 * score.red.away,
      outcome,
    });
  }
}

const artifact = buildFrequencyArtifact(samples, {
  source: "simulation-bootstrap",
  label: "Deterministic Sweeper simulation bootstrap (not TxLINE history)",
  fixtureCount: fixtures.length,
  sampleCount: samples.length,
}, "2026-07-14T00:00:00.000Z");
const json = `${JSON.stringify(artifact, null, 2)}\n`;
async function main() {
  if (process.argv.includes("--write")) {
    const directory = path.join(process.cwd(), "data");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "horizon-bootstrap.json"), json, "utf8");
    console.log(`Wrote data/horizon-bootstrap.json (${samples.length} deterministic minute samples)`);
  } else {
    process.stdout.write(json);
  }
}

void main();
