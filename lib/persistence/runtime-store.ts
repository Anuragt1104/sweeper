import type { EventStore } from "@/lib/persistence/event-store";
import { MemoryEventStore } from "@/lib/persistence/memory-event-store";

const globalStore = globalThis as unknown as { __sweeperEventStore?: EventStore };

export function eventStore(): EventStore {
  if (!globalStore.__sweeperEventStore) {
    globalStore.__sweeperEventStore = process.env.DATABASE_URL
      ? loadPostgresStore()
      : new MemoryEventStore();
  }
  return globalStore.__sweeperEventStore;
}

function loadPostgresStore(): EventStore {
  // Opaque require so bundlers cannot statically pull `pg` into Edge/instrumentation graphs.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const nodeRequire = new Function("id", "return require(id)") as (
    id: string,
  ) => typeof import("./postgres-event-store");
  const { PostgresEventStore } = nodeRequire(`${__dirname}/postgres-event-store`);
  return new PostgresEventStore();
}
