/** The arena roster. Order here is the display order in the leaderboard. */
import type { Agent } from "@/lib/agents/types";
import { ValueAgent } from "@/lib/agents/value";
import { MomentumAgent } from "@/lib/agents/momentum";
import { MeanReversionAgent } from "@/lib/agents/reversion";
import { IntensityBurstAgent } from "@/lib/agents/intensity-burst";
import { HybridThesisAgent } from "@/lib/agents/hybrid-thesis";
import { CollapseFadeAgent } from "@/lib/agents/collapse-fade";
import { GoalOverreactionAgent } from "@/lib/agents/goal-overreaction";
import { ShockFadeAgent } from "@/lib/agents/shock-fade";
import { StaleReopenAgent } from "@/lib/agents/stale-reopen";
import { RegimeSwitcherAgent } from "@/lib/agents/regime-switcher";
import { KellyValueAgent } from "@/lib/agents/kelly-value";

export function buildAgents(): Agent[] {
  return [
    new ValueAgent(),
    new MomentumAgent(true),
    new MeanReversionAgent(),
    new IntensityBurstAgent(),
    new HybridThesisAgent(),
    new CollapseFadeAgent(),
    new GoalOverreactionAgent(),
    new ShockFadeAgent(),
    new StaleReopenAgent(),
    new RegimeSwitcherAgent(),
    new KellyValueAgent(),
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
