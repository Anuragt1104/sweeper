import { manager, type StartOptions } from "@/lib/engine/manager";
import { authorizeControl, controlError } from "@/lib/server/control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(manager().getState() ?? { status: "idle" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const auth = authorizeControl(req);
  if (!auth.ok) return controlError(auth);
  const body = (await req.json().catch(() => ({}))) as { action?: string; options?: StartOptions };
  const m = manager();
  try {
    switch (body.action) {
      case "start":
        return Response.json(await m.start(body.options ?? {}));
      case "stop":
        m.stop();
        return Response.json(m.getState() ?? { status: "idle" });
      case "anchor": {
        const state = await m.anchor();
        return Response.json(state ?? { error: "no session or anchoring not configured" });
      }
      default:
        return Response.json({ error: { code: "UNKNOWN_ACTION", message: "Unknown session action" } }, { status: 400 });
    }
  } catch (e) {
    // live-mode misconfig, anchoring failure, etc. — surface, don't crash the route.
    return Response.json({ error: { code: "SESSION_ACTION_FAILED", message: e instanceof Error ? e.message : "session action failed" } }, { status: 500 });
  }
}
