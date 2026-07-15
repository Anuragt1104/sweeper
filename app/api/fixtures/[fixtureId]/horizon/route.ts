import { manager } from "@/lib/engine/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await context.params;
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
    { fixture: state.fixture, mode: state.mode, feedHealth: state.feedHealth, horizon: state.horizon },
    { headers: { "Cache-Control": "no-store" } },
  );
}
