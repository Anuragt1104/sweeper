import { manager } from "@/lib/engine/manager";
import { controlConfigured } from "@/lib/server/control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = manager().getState();
  const credentialsConfigured = Boolean(process.env.TXLINE_API_TOKEN?.trim() || (
    process.env.TXLINE_HOST_SECRET_KEY?.trim() && process.env.TXLINE_TX_SIG?.trim()
  ));
  return Response.json(
    {
      process: { ok: true, uptimeSeconds: Math.round(process.uptime()) },
      credentials: { txlineConfigured: credentialsConfigured, controlKeyConfigured: controlConfigured() },
      activeFixtureId: state?.fixture.id ?? null,
      upstream: state?.feedHealth ?? null,
      horizon: {
        ready: state?.horizon.ready ?? false,
        missingRequiredMarket: state?.horizon.missingRequiredMarket ?? true,
        source: state?.horizon.current?.source ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
