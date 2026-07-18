import type { Fixture, MatchEvent, OddsSnapshot, ScoreSnapshot } from "@/lib/txline/types";

export interface PricingProvenance {
  source: "simulation_model" | "txline_robust_reference";
  sampleCount: number;
  ready: boolean;
  standDownReason: string | null;
  updatedAtMs: number;
}

export interface ReferencePricingInput {
  fixture: Fixture;
  score: ScoreSnapshot;
  odds: OddsSnapshot;
  events: MatchEvent[];
  tsMs: number;
}

export interface ReferencePricingState {
  snapshot: OddsSnapshot;
  provenance: PricingProvenance;
}

export interface ReferencePricingModel {
  update(input: ReferencePricingInput): ReferencePricingState;
}
