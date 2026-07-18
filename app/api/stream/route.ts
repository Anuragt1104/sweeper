import { manager } from "@/lib/engine/manager";
import type { EngineState } from "@/lib/engine/state";
import { eventStore } from "@/lib/persistence/runtime-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-Sent Events stream of the live engine state. */
export async function GET(request: Request) {
  const m = manager();
  const requestedLastId = request.headers.get("Last-Event-ID");
  const encoder = new TextEncoder();
  let unsub: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (s: EngineState) => {
        try {
          const id = stateEventId(s);
          controller.enqueue(encoder.encode(`id: ${id}\ndata: ${JSON.stringify(s)}\n\n`));
        } catch {
          /* controller closed */
        }
      };
      const current = m.getState();
      if (current) send(current);
      else {
        void eventStore().loadUnfinishedSession().then((session) => {
          if (session?.latestState) send(session.latestState);
          else if (requestedLastId) {
            controller.enqueue(encoder.encode(`: resume ${requestedLastId}\n\n`));
          }
        }).catch(() => undefined);
      }
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

function stateEventId(state: EngineState): string {
  return `${state.sessionId}:${state.ledger.size}:${state.updatedAtMs}`;
}
