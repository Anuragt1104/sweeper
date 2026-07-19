/**
 * Last Act II SSE snapshot — so public Horizon HTTP can mirror the demo stream.
 */
import type { EngineState } from "@/lib/engine/state";
import type { SweeperEngine } from "@/lib/engine/engine";

const globalAct2 = globalThis as unknown as {
  __sweeperAct2State?: EngineState | null;
  __sweeperAct2UpdatedAtMs?: number;
  __sweeperAct2Engine?: SweeperEngine | null;
};

export function publishAct2Engine(engine: SweeperEngine): void {
  globalAct2.__sweeperAct2Engine = engine;
  publishAct2State(engine.getState());
}

export function getAct2Engine(sessionId?: string): SweeperEngine | null {
  const engine = globalAct2.__sweeperAct2Engine ?? null;
  if (sessionId && engine?.sessionId !== sessionId) return null;
  return engine;
}

export function publishAct2State(state: EngineState): void {
  globalAct2.__sweeperAct2State = state;
  globalAct2.__sweeperAct2UpdatedAtMs = Date.now();
}

export function getAct2State(): EngineState | null {
  return globalAct2.__sweeperAct2State ?? null;
}

export function clearAct2State(): void {
  globalAct2.__sweeperAct2State = null;
  globalAct2.__sweeperAct2UpdatedAtMs = undefined;
  globalAct2.__sweeperAct2Engine = null;
}
