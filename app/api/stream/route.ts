import { manager } from "@/lib/engine/manager";
import type { EngineState } from "@/lib/engine/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-Sent Events stream of the live engine state. */
export async function GET() {
  const m = manager();
  const encoder = new TextEncoder();
  let unsub: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (s: EngineState) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(s)}\n\n`));
        } catch {
          /* controller closed */
        }
      };
      const current = m.getState();
      if (current) send(current);
      unsub = m.subscribe(send);
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          /* closed */
        }
      }, 15000);
    },
    cancel() {
      unsub?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
