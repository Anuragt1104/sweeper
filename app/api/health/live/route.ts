export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    uptimeSeconds: Math.round(process.uptime()),
    timestampMs: Date.now(),
  }, { headers: { "Cache-Control": "no-store" } });
}
