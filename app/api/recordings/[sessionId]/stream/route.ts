import { SweeperEngine } from "@/lib/engine/engine";
import type { FeedHealth } from "@/lib/engine/state";
import { eventStore } from "@/lib/persistence/runtime-store";
import type { Fixture } from "@/lib/txline/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const store = eventStore();
  const [session, ticks] = await Promise.all([store.loadSession(sessionId), store.listTicks(sessionId)]);
  if (!session?.latestState || !ticks.length) {
    return Response.json({ error: "recording not found" }, { status: 404 });
  }
  const latest = session.latestState;
  const firstTick = ticks[0].tick;
  const fixture: Fixture = {
    id: latest.fixture.id,
    competitionId: latest.fixture.competitionId,
    competition: latest.fixture.competition,
    stage: latest.fixture.stage,
    home: { id: "home", name: latest.fixture.home, code: latest.fixture.homeCode, flag: "", rating: 75 },
    away: { id: "away", name: latest.fixture.away, code: latest.fixture.awayCode, flag: "", rating: 75 },
    kickoff: new Date(session.startedAtMs).toISOString(),
    venue: "",
    status: "finished",
    participant1IsHome: firstTick.score.lifecycle?.participant1IsHome,
  };
  const engine = new SweeperEngine(
    fixture,
    session.configuration,
    "recorded_live",
    [],
    undefined,
    session.sessionId,
  );
  const lastEventId = request.headers.get("Last-Event-ID");
  const resumeId = lastEventId?.startsWith(`${sessionId}:`) ? lastEventId.slice(sessionId.length + 1) : null;
  const resumeIndex = resumeId ? Math.max(0, ticks.findIndex((tick) => tick.id === resumeId) + 1) : 0;
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          for (let index = 0; index < ticks.length && !cancelled; index += 1) {
            const stored = ticks[index];
            engine.setFeedHealth(recordedFeed(stored.tick.upstream?.scoreTsMs, stored.tick.upstream?.oddsTsMs));
            engine.ingest(stored.tick, stored.processedAtMs);
            if (index < resumeIndex) continue;
            const state = engine.getState();
            controller.enqueue(encoder.encode(`id: ${sessionId}:${stored.id}\ndata: ${JSON.stringify(state)}\n\n`));
            await wait(120);
          }
          if (!cancelled) {
            const finalState = {
              ...latest,
              provenance: "recorded_live" as const,
              mode: "recorded_live" as const,
              executionMode: "shadow" as const,
              feedHealth: {
                ...latest.feedHealth,
                status: "offline" as const,
                detail: "Immutable recorded TxLINE playback; no current upstream connection",
              },
            };
            controller.enqueue(encoder.encode(`id: ${sessionId}:final\ndata: ${JSON.stringify(finalState)}\n\n`));
            controller.close();
          }
        } catch (error) {
          if (!cancelled) controller.error(error);
        }
      })();
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "public, no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function recordedFeed(scoreTsMs?: number, oddsTsMs?: number): FeedHealth {
  return {
    status: "live",
    detail: "Replaying persisted TxLINE observations",
    watching: 1,
    scoreStreamAccepted: true,
    oddsStreamAccepted: true,
    hydratedScore: true,
    hydratedOdds: true,
    lastScoreAtMs: scoreTsMs ?? null,
    lastOddsAtMs: oddsTsMs ?? null,
    reconnectCount: 0,
    sequenceGap: null,
    fatal: false,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
