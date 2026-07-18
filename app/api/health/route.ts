import { manager } from "@/lib/engine/manager";
import { controlConfigured } from "@/lib/server/control";
import { eventStore } from "@/lib/persistence/runtime-store";
import { supervisor } from "@/lib/supervisor/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = manager().getState();
  const databaseReady = await eventStore().isReady();
  const supervisorStatus = supervisor().getStatus();
  const now = Date.now();
  const credentialsConfigured = Boolean(process.env.TXLINE_API_TOKEN?.trim() || (
    process.env.TXLINE_HOST_SECRET_KEY?.trim() && process.env.TXLINE_TX_SIG?.trim()
  ));
  return Response.json(
    {
      process: { ok: true, uptimeSeconds: Math.round(process.uptime()) },
      schemaVersion: 2,
      version: {
        commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
        node: process.version,
      },
      database: { ready: databaseReady },
      supervisor: supervisorStatus,
      credentials: { txlineConfigured: credentialsConfigured, controlKeyConfigured: controlConfigured() },
      activeFixtureId: state?.fixture.id ?? null,
      upstream: state ? {
        ...state.feedHealth,
        scoreAgeMs: state.feedHealth.lastScoreAtMs === null ? null : Math.max(0, now - state.feedHealth.lastScoreAtMs),
        oddsAgeMs: state.feedHealth.lastOddsAtMs === null ? null : Math.max(0, now - state.feedHealth.lastOddsAtMs),
      } : null,
      tradeReadiness: state?.tradeReadiness ?? null,
      horizon: {
        ready: state?.horizon.ready ?? false,
        missingRequiredMarket: state?.horizon.missingRequiredMarket ?? true,
        source: state?.horizon.current?.source ?? null,
      },
      proof: {
        settlementStatus: state?.settlement?.status ?? null,
        txlineVerified: Boolean(state?.settlement?.txlineSettlementProof),
        ledgerAnchored: Boolean(state?.ledger.anchor),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
