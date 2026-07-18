import { manager } from "@/lib/engine/manager";
import { getAct2State } from "@/lib/demo/act2-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public Horizon snapshot.
 * - `?demo=act2` → last Act II SSE snapshot (isolated demo engine)
 * - default → production manager session
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const demo = url.searchParams.get("demo") === "act2";

  if (demo) {
    const state = getAct2State();
    if (!state?.horizon?.ready) {
      return Response.json(
        {
          error: {
            code: "HORIZON_NOT_FOUND",
            message: "No Act II Horizon yet — open /?demo=act2 so the stream publishes a snapshot.",
          },
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      {
        fixture: state.fixture,
        mode: state.mode,
        feedHealth: state.feedHealth,
        horizon: state.horizon,
        source: "act2",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const state = manager().getState();
  if (!state || !state.horizon.ready) {
    return Response.json(
      { error: { code: "HORIZON_NOT_FOUND", message: "No active Horizon exists." } },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    {
      fixture: state.fixture,
      mode: state.mode,
      feedHealth: state.feedHealth,
      horizon: state.horizon,
      source: "live",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
