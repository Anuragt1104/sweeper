import { getSource } from "@/lib/txline/source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const src = getSource();
    const fixtures = await src.listFixtures();
    return Response.json(
      fixtures.map((f) => ({
        id: f.id,
        home: f.home.name,
        away: f.away.name,
        homeCode: f.home.code,
        awayCode: f.away.code,
        stage: f.stage,
        kickoff: f.kickoff,
        status: f.status,
      })),
    );
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed to load fixtures" }, { status: 500 });
  }
}
