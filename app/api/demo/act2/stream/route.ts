import { fixtureById } from "@/lib/data/worldcup";
import { resolveConfig } from "@/lib/engine/config";
import { SweeperEngine } from "@/lib/engine/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Immutable, isolated public simulation. It cannot mutate the production session. */
export async function GET() {
  const fixture = fixtureById("wc26-a-md2-arg-pol");
  if (!fixture) return Response.json({ error: "Act II fixture unavailable" }, { status: 500 });
  const engine = new SweeperEngine(fixture, resolveConfig({ seed: 7, tickIntervalMs: 900 }), "simulation");
  while ((engine.getState().current?.minute ?? 0) < 39.5 && engine.step()) {
    // deterministic fast-forward before the public stream begins
  }

  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          while (!cancelled) {
            const state = engine.getState();
            controller.enqueue(encoder.encode(
              `id: act2:${state.progress.tick}\ndata: ${JSON.stringify(state)}\n\n`,
            ));
            if ((state.current?.minute ?? 0) >= 46 || !engine.step()) break;
            await wait(500);
          }
          if (!cancelled) controller.close();
        } catch (error) {
          if (!cancelled) controller.error(error);
        }
      })();
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, { headers: sseHeaders() });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
}
