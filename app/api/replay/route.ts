import { manager, type StartOptions } from "@/lib/engine/manager";
import { authorizeControl, controlError } from "@/lib/server/control";
import { mutationRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Run a throwaway session to completion for the replay lab. */
export async function POST(req: Request) {
  const limited = mutationRateLimit(req);
  if (limited) return limited;
  const auth = authorizeControl(req);
  if (!auth.ok) return controlError(auth);
  const body = (await req.json().catch(() => ({}))) as StartOptions;
  try {
    const result = await manager().runReplay(body);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: { code: "REPLAY_FAILED", message: e instanceof Error ? e.message : "replay failed" } }, { status: 500 });
  }
}
