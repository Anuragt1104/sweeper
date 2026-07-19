import { manager } from "@/lib/engine/manager";
import { controlConfigured } from "@/lib/server/control";
import { eventStore } from "@/lib/persistence/runtime-store";
import { supervisor } from "@/lib/supervisor/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = manager().getState();
  const liveState = state?.provenance === "simulation" ? null : state;
  const databaseReady = await eventStore().isReady();
  const supervisorStatus = supervisor().getStatus();
  const now = Date.now();
  const credentialsConfigured = Boolean(process.env.TXLINE_API_TOKEN?.trim() || (
    process.env.TXLINE_HOST_SECRET_KEY?.trim() && process.env.TXLINE_TX_SIG?.trim()
  ));
  return Response.json(
    {
      process: {
        ok: true,
        uptimeSeconds: Math.round(process.uptime()),
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      schemaVersion: 2,
      version: {
        commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
        node: process.version,
      },
      database: { ready: databaseReady },
      supervisor: { ...supervisorStatus, enabled: process.env.SWEEPER_AUTO_START_LIVE === "true" },
      credentials: { txlineConfigured: credentialsConfigured, controlKeyConfigured: controlConfigured() },
      activeFixtureId: liveState?.fixture.id ?? null,
      upstream: liveState ? {
        ...liveState.feedHealth,
        scoreAgeMs: liveState.feedHealth.lastScoreAtMs === null ? null : Math.max(0, now - liveState.feedHealth.lastScoreAtMs),
        oddsAgeMs: liveState.feedHealth.lastOddsAtMs === null ? null : Math.max(0, now - liveState.feedHealth.lastOddsAtMs),
      } : null,
      tradeReadiness: liveState?.tradeReadiness ?? null,
      horizon: {
        ready: liveState?.horizon.ready ?? false,
        missingRequiredMarket: liveState?.horizon.missingRequiredMarket ?? true,
        source: liveState?.horizon.current?.source ?? null,
      },
      proof: {
        settlementStatus: liveState?.settlement?.status ?? null,
        txlineVerified: Boolean(liveState?.settlement?.txlineSettlementProof),
        ledgerAnchored: Boolean(liveState?.ledger.anchor),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
