import { MatchSimulation } from "@/lib/txline/simulation";
import type { Fixture } from "@/lib/txline/types";
import type { ReferencePricingInput, ReferencePricingModel, ReferencePricingState } from "@/lib/pricing/types";

export class SimulationReference implements ReferencePricingModel {
  private readonly simulation: MatchSimulation;
  private samples = 0;

  constructor(fixture: Fixture) {
    this.simulation = new MatchSimulation(fixture);
  }

  update(input: ReferencePricingInput): ReferencePricingState {
    this.samples += 1;
    return {
      snapshot: this.simulation.oddsSnapshot(
        input.score.minute,
        input.score,
        input.odds.seq,
        new Date(input.tsMs).toISOString(),
      ),
      provenance: {
        source: "simulation_model",
        sampleCount: this.samples,
        ready: true,
        standDownReason: null,
        updatedAtMs: input.tsMs,
      },
    };
  }
}
