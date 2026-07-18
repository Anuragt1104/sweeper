/**
 * Last Act II SSE snapshot — so public Horizon HTTP can mirror the demo stream.
 */
import type { EngineState } from "@/lib/engine/state";

const globalAct2 = globalThis as unknown as {
  __sweeperAct2State?: EngineState | null;
  __sweeperAct2UpdatedAtMs?: number;
};

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
}
