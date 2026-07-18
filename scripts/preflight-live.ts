import { loadEnvConfig } from "@next/env";
import { LiveSource, openLiveMatchFeed } from "../lib/txline/live";
import { DEFAULT_WATCH_IDS, selectFixture } from "../lib/supervisor/fixture-supervisor";

loadEnvConfig(process.cwd());

const fixtureArg = process.argv.find((arg) => arg.startsWith("--fixture="))?.slice("--fixture=".length)
  ?? (process.argv.includes("--fixture") ? process.argv[process.argv.indexOf("--fixture") + 1] : undefined)
  ?? "auto";

async function main() {
  if (!process.env.TXLINE_API_TOKEN?.trim() && !(process.env.TXLINE_HOST_SECRET_KEY && process.env.TXLINE_TX_SIG)) {
    throw new Error("TxLINE credentials are missing. Put the rotated token in .env.local as TXLINE_API_TOKEN.");
  }
  if (!process.env.SWEEPER_CONTROL_KEY?.trim()) throw new Error("SWEEPER_CONTROL_KEY is missing; public live mode would be spectator-only.");

  const source = new LiveSource();
  const fixtures = await source.listFixtures();
  const watchIds = (process.env.TXLINE_WATCH_FIXTURE_IDS?.split(",") ?? DEFAULT_WATCH_IDS)
    .map((id) => id.trim()).filter(Boolean);
  const stale = watchIds.filter((id) => !fixtures.some((fixture) => fixture.id === id));
  if (fixtureArg === "auto" && stale.length) {
    throw new Error(`Configured watched fixture IDs are absent/stale: ${stale.join(", ")}`);
  }
  const fixture = fixtureArg === "auto"
    ? selectFixture(fixtures, { nowMs: Date.now(), watchIds, competitionId: process.env.TXLINE_COMPETITION_ID ?? null }).fixture
    : fixtures.find((candidate) => candidate.id === fixtureArg);
  if (!fixture) throw new Error(`Fixture ${fixtureArg} is not present or no eligible World Cup fixture was selected.`);
  console.log(`✓ fixture ${fixture.id}: ${fixture.home.name} vs ${fixture.away.name} · ${fixture.kickoff}`);
  console.log(`✓ competition ${fixture.competition} · id ${fixture.competitionId ?? "not supplied"}`);

  const [scores, odds] = await Promise.all([source.getScoreRecords(fixture), source.getOddsSnapshot(fixture)]);
  if (scores.length === 0) throw new Error("Score hydration returned no records.");
  console.log(`✓ hydrated ${scores.length} score record(s) and ${odds.markets.length} odds market(s)`);
  const oneXTwo = odds.markets.find((market) => market.type === "match_result" && ["home", "draw", "away"].every((key) => market.selections.some((selection) => selection.key === key && selection.impliedProb > 0)));
  console.log(oneXTwo ? "✓ usable full-match 1X2 line" : "! no usable full-match 1X2; trading agents will stand down");

  const feed = await openLiveMatchFeed(fixture, { onScore: () => undefined, onOdds: () => undefined });
  try {
    await Promise.race([
      feed.accepted,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for both SSE requests to be accepted")), 15_000)),
    ]);
    console.log("✓ score and odds SSE requests accepted");
  } finally {
    feed.close();
  }

  const historical = await source.listHistoricalFixtures();
  console.log(historical.length > 0
    ? `✓ ${historical.length} fixture(s) eligible for the 6h–2week historical training window`
    : "! no fixtures currently eligible for historical training; simulation bootstrap remains labelled LOW DATA");
  console.log("Live preflight passed. No credential values were printed.");
}

main().catch((error) => {
  console.error(`Live preflight failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
