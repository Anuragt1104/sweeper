import { fixtureById } from "@/lib/data/worldcup";
import { resolveConfig } from "@/lib/engine/config";
import { SweeperEngine } from "@/lib/engine/engine";
import { publishAct2Engine, publishAct2State } from "@/lib/demo/act2-runtime";
import { createAct2Scene, type Act2Scene } from "@/lib/demo/director";
import { loadAct2TempoArtifact, RecordedTempoProvider } from "@/lib/tempo/recorded";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Isolated public Act II simulation — full match (kickoff → FT).
 * Adaptive pacing: brisk until the known goal window, slower around ~41′,
 * then steady through the rest so the arena stays watchable (~40–50s wall).
 */
const DIRECTED_SCENES = new Set<Act2Scene>(["overview", "pre_goal", "post_goal", "full_time"]);

export async function GET(req: Request) {
  const requestedScene = new URL(req.url).searchParams.get("scene") as Act2Scene | null;
  if (requestedScene && DIRECTED_SCENES.has(requestedScene)) {
    return directedSceneResponse(requestedScene);
  }
  const fixture = fixtureById("wc26-a-md2-arg-pol");
  if (!fixture) return Response.json({ error: "Act II fixture unavailable" }, { status: 500 });

  const tempoArtifact = loadAct2TempoArtifact();
  const tempoProvider = tempoArtifact ? new RecordedTempoProvider(tempoArtifact) : undefined;
  const engine = new SweeperEngine(
    fixture,
    resolveConfig({ seed: 7, tickIntervalMs: 200 }),
    "simulation",
    [],
    undefined,
    undefined,
    tempoProvider,
  );
  publishAct2Engine(engine);

  // Tiny silent warm so path features exist on the first published frame.
  engine.warmFeaturesUntil(0.5);
  engine.step();

  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          while (!cancelled) {
            const state = engine.getState();
            if (tempoProvider && state.shockStrip) {
              state.shockStrip.tempo.detail = tempoArtifact!.provenance.match;
              state.shockStrip.tempo.source = "recorded";
              state.shockStrip.tempo.status = "ready";
            }
            publishAct2State(state);
            controller.enqueue(
              encoder.encode(`id: act2:${state.progress.tick}\ndata: ${JSON.stringify(state)}\n\n`),
            );
            if (!engine.step()) break;
            await wait(paceMs(state.current?.minute ?? 0));
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

function directedSceneResponse(scene: Act2Scene): Response {
  const { engine } = createAct2Scene(scene);
  publishAct2Engine(engine);
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          emitState(controller, encoder, engine.getState(), scene);
          if (scene === "pre_goal") {
            while (!cancelled && (engine.getState().current?.minute ?? 0) < 42) {
              await wait(380);
              if (cancelled) break;
              engine.step();
              emitState(controller, encoder, engine.getState(), scene);
            }
          }
          // Directed scenes freeze instead of closing so EventSource does not
          // auto-restart the money shot. Comments keep the viewer stream open.
          while (!cancelled) {
            await wait(15_000);
            if (!cancelled) controller.enqueue(encoder.encode(`: ${scene} frozen\n\n`));
          }
        } catch (error) {
          if (!cancelled) controller.error(error);
        }
      })();
    },
    cancel() { cancelled = true; },
  });
  return new Response(stream, { headers: sseHeaders() });
}

function emitState(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  state: ReturnType<SweeperEngine["getState"]>,
  scene: Act2Scene,
): void {
  publishAct2State(state);
  controller.enqueue(
    encoder.encode(`id: act2:${scene}:${state.progress.tick}\ndata: ${JSON.stringify(state)}\n\n`),
  );
}

/** Wall delay per tick — keep the 41′ money shot on-screen, finish the full 90′. */
function paceMs(minute: number): number {
  if (minute >= 38 && minute < 46) return 380; // Argentina goal window
  if (minute < 38) return 95; // brisk first half → goal
  if (minute < 70) return 160;
  return 120; // push through late game → FT
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
