import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { buildFrequencyArtifact, samplesFromHistorical, type HorizonSample } from "../lib/horizon/training";
import { LiveSource } from "../lib/txline/live";

loadEnvConfig(process.cwd());

async function main() {
  const source = new LiveSource();
  const now = Date.now();
  const from = now - 14 * 86_400_000;
  const to = now - 6 * 3_600_000;
  const fixtures = await source.listHistoricalFixtures(from, to);
  const samples: HorizonSample[] = [];
  let completed = 0;
  for (const fixture of fixtures) {
    try {
      const records = await source.getHistoricalScoreRecords(fixture);
      const matchSamples = samplesFromHistorical(fixture, records);
      if (matchSamples.length > 0) {
        samples.push(...matchSamples);
        completed += 1;
      }
      process.stdout.write(`\rTxLINE history ${completed}/${fixtures.length} fixtures · ${samples.length} samples`);
    } catch (error) {
      process.stderr.write(`\nSkipped ${fixture.id}: ${error instanceof Error ? error.message : "unknown error"}\n`);
    }
  }
  process.stdout.write("\n");
  if (completed === 0) throw new Error("No eligible TxLINE historical fixtures were available in the documented 6h–2week window");
  const artifact = buildFrequencyArtifact(samples, {
    source: "txline-historical",
    label: "TxLINE mainnet level-12 historical score sequences",
    fixtureCount: completed,
    sampleCount: samples.length,
    historicalWindow: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
  });
  const directory = path.join(process.cwd(), "data");
  const output = path.join(directory, "horizon-frequency.json");
  await mkdir(directory, { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`Wrote ${output} (${completed} fixtures, ${samples.length} minute samples)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
