/** The arena roster. Order here is the display order in the leaderboard. */
import type { Agent } from "@/lib/agents/types";
import { ValueAgent } from "@/lib/agents/value";
import { MomentumAgent } from "@/lib/agents/momentum";
import { MeanReversionAgent } from "@/lib/agents/reversion";
import { MarketMakerAgent } from "@/lib/agents/maker";

export function buildAgents(): Agent[] {
  return [
    new ValueAgent(),
    new MomentumAgent(false), // naive
    new MomentumAgent(true), // guarded
    new MeanReversionAgent(),
    new MarketMakerAgent(),
  ];
}

export interface AgentMeta {
  id: string;
  name: string;
  kind: string;
  blurb: string;
  mode: "taker" | "maker";
}

export function agentMeta(): AgentMeta[] {
  return buildAgents().map((a) => ({ id: a.id, name: a.name, kind: a.kind, blurb: a.blurb, mode: a.mode }));
}
