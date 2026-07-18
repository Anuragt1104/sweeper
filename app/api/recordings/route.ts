import { eventStore } from "@/lib/persistence/runtime-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const recordings = await eventStore().listRecordings();
  return Response.json({ schemaVersion: 2, recordings }, {
    headers: { "Cache-Control": "public, max-age=30" },
  });
}
