import { eventStore } from "@/lib/persistence/runtime-store";
import { supervisor } from "@/lib/supervisor/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const databaseReady = await eventStore().isReady();
  const status = supervisor().getStatus();
  const supervisorEnabled = process.env.SWEEPER_AUTO_START_LIVE === "true";
  const supervisorReady = !supervisorEnabled || !["booting", "failed"].includes(status.state);
  const ready = databaseReady && supervisorReady;
  return Response.json(
    { ready, databaseReady, supervisorReady, supervisor: status },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
