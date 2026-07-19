import type { EventStore } from "@/lib/persistence/event-store";
import { MemoryEventStore } from "@/lib/persistence/memory-event-store";
import { PostgresEventStore } from "@/lib/persistence/postgres-event-store";

const globalStore = globalThis as unknown as { __sweeperEventStore?: EventStore };

export function eventStore(): EventStore {
  if (!globalStore.__sweeperEventStore) {
    globalStore.__sweeperEventStore = process.env.DATABASE_URL
      ? new PostgresEventStore()
      : new MemoryEventStore();
  }
  return globalStore.__sweeperEventStore;
}
