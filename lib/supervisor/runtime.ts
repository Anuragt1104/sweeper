import { FixtureSupervisor } from "@/lib/supervisor/fixture-supervisor";

const globalRuntime = globalThis as unknown as {
  __sweeperSupervisor?: FixtureSupervisor;
  __sweeperSupervisorStarting?: Promise<void>;
};

export function supervisor(): FixtureSupervisor {
  if (!globalRuntime.__sweeperSupervisor) {
    globalRuntime.__sweeperSupervisor = new FixtureSupervisor();
  }
  return globalRuntime.__sweeperSupervisor;
}

export function startSupervisorOnce(): Promise<void> {
  if (!globalRuntime.__sweeperSupervisorStarting) {
    globalRuntime.__sweeperSupervisorStarting = supervisor().start();
  }
  return globalRuntime.__sweeperSupervisorStarting;
}
