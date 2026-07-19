import { fixtureById } from "@/lib/data/worldcup";
import { resolveConfig } from "@/lib/engine/config";
import { SweeperEngine } from "@/lib/engine/engine";
import type { EngineState } from "@/lib/engine/state";
import { loadAct2TempoArtifact, RecordedTempoProvider } from "@/lib/tempo/recorded";

export type Act2Scene = "overview" | "pre_goal" | "post_goal" | "full_time";

export interface Act2SceneRuntime {
  scene: Act2Scene;
  engine: SweeperEngine;
  frozen: boolean;
}

const SCENE_MINUTE: Record<Exclude<Act2Scene, "full_time">, number> = {
  overview: 30.5,
  pre_goal: 39.5,
  post_goal: 42,
};

/** Build every scene through the normal deterministic ingest seam from kickoff. */
export function createAct2Scene(scene: Act2Scene): Act2SceneRuntime {
  const fixture = fixtureById("wc26-a-md2-arg-pol");
  if (!fixture) throw new Error("Act II fixture unavailable");
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
  if (scene === "full_time") {
    while (engine.step()) {
      // The normal ingest path owns every decision, fill, and proof record.
    }
  } else {
    advanceToMinute(engine, SCENE_MINUTE[scene]);
  }
  return { scene, engine, frozen: scene !== "pre_goal" };
}

/** Recording-safe money shot: publish each normal tick from 39.5′ through 42′. */
export function playAct2PreGoal(engine: SweeperEngine): EngineState[] {
  const frames: EngineState[] = [engine.getState()];
  while (!engine.isFinished && (engine.getState().current?.minute ?? 0) < 42) {
    engine.step();
    frames.push(engine.getState());
  }
  return frames;
}

function advanceToMinute(engine: SweeperEngine, minute: number): void {
  while (!engine.isFinished && (engine.getState().current?.minute ?? -1) < minute) {
    engine.step();
  }
}
