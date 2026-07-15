/**
 * Data-source abstraction.
 *
 * Everything above the data layer is identical whether we run on simulated or
 * live TxLINE data. The only difference is which `TxLineSource` the factory
 * returns, chosen by the `TXLINE_MODE` env var.
 */
import type { Fixture } from "@/lib/txline/types";
import { getFixtures, fixtureById } from "@/lib/data/worldcup";
import { LiveSource } from "@/lib/txline/live";

export type SourceMode = "simulation" | "live";

export interface TxLineSource {
  readonly mode: SourceMode;
  /** Tournament schedule for the lobby. */
  listFixtures(): Promise<Fixture[]>;
  getFixture(id: string): Promise<Fixture | undefined>;
}

/** Deterministic, credential-free source. Default for the demo. */
class SimulationSource implements TxLineSource {
  readonly mode = "simulation" as const;
  async listFixtures(): Promise<Fixture[]> {
    return getFixtures();
  }
  async getFixture(id: string): Promise<Fixture | undefined> {
    return fixtureById(id);
  }
}

let cached: TxLineSource | null = null;

export function getSource(): TxLineSource {
  if (cached) return cached;
  const mode = (process.env.TXLINE_MODE ?? "simulation") as SourceMode;
  if (mode === "live") {
    cached = new LiveSource();
  } else {
    cached = new SimulationSource();
  }
  return cached;
}

export function sourceMode(): SourceMode {
  return (process.env.TXLINE_MODE ?? "simulation") as SourceMode;
}
