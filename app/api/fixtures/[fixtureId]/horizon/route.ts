import { manager } from "@/lib/engine/manager";
import { getAct2State } from "@/lib/demo/act2-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await context.params;

  if (fixtureId === "wc26-a-md2-arg-pol") {
    const act2 = getAct2State();
    if (act2?.horizon?.ready && act2.fixture.id === fixtureId) {
      return Response.json(
        {
          fixture: act2.fixture,
          mode: act2.mode,
          feedHealth: act2.feedHealth,
          horizon: act2.horizon,
          source: "act2",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  const state = manager().getState();
  if (!state || !state.horizon.ready) {
    return Response.json(
      { error: { code: "HORIZON_NOT_FOUND", message: "No active Horizon exists." } },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (state.fixture.id !== fixtureId) {
    return Response.json(
      {
        error: {
          code: "FIXTURE_NOT_ACTIVE",
          message: `Fixture ${fixtureId} is not the active watched fixture.`,
          activeFixtureId: state.fixture.id,
        },
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
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
