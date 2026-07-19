import type { Decision } from "@/lib/agents/types";
import type { AgentView, TradeReadiness } from "@/lib/engine/state";
import type { DeskModelSnapshot } from "@/lib/desk/contract-deck";
import type { OddsViewId } from "@/lib/tempo/types";
import {
  STRATEGY_DESIGNS,
  type StrategyDesign,
  type StrategyStance,
} from "@/lib/strategy-lab/designs";

export interface StrategyStanceView extends StrategyStance {
  agentId: string;
}

const ALL_CONTRACTS: OddsViewId[] = ["match_1x2", "ou_25", "next_score", "corners_ou", "swing"];

export function projectStrategyStances(
  agents: AgentView[],
  decisions: ReadonlyMap<string, Decision>,
  readiness: TradeReadiness,
  deskModel: DeskModelSnapshot | null,
): StrategyStanceView[] {
  return STRATEGY_DESIGNS.flatMap((design) => {
    const agent = agents.find((candidate) => candidate.id === design.id);
    const decision = decisions.get(design.id);
    return ALL_CONTRACTS.map((contract) => ({
      agentId: design.id,
      ...stanceFor(design, contract, agent, decision, readiness, deskModel),
    }));
  });
}

function stanceFor(
  design: StrategyDesign,
  contract: OddsViewId,
  agent: AgentView | undefined,
  decision: Decision | undefined,
  readiness: TradeReadiness,
  deskModel: DeskModelSnapshot | null,
): StrategyStance {
  if (!design.eligibleContracts.includes(contract)) {
    return {
      contract,
      kind: "ineligible",
      rationale: "This contract is outside the strategy design.",
    };
  }

  if (!design.fillableNow.includes(contract)) {
    return {
      contract,
      kind: "no_model",
      edgeVsBook: null,
      rationale: "Designed as an analysis input; no defensible pricing and fill path exists yet.",
    };
  }

  if (!readiness.ready || agent?.stoodDown || decision?.stoodDown) {
    return {
      contract,
      kind: "stand_down",
      edgeVsBook: edgeFor(design.id, contract, decision, deskModel),
      rationale: agent?.lastRationale || readiness.reasons.join("; ") || "Risk gate is active.",
    };
  }

  const orders = decision?.orders.filter((order) => contractForMarket(order.marketType) === contract) ?? [];
  const quotes = decision?.quotes.filter((quote) => contractForMarket(quote.marketType) === contract) ?? [];
  const firstOrder = orders[0];

  if (orders.length > 0 && firstOrder) {
    return {
      contract,
      kind: "trade",
      side: firstOrder.side,
      size: orders.reduce((sum, order) => sum + order.size, 0),
      edgeVsBook: edgeFor(design.id, contract, decision, deskModel),
      rationale: firstOrder.rationale || decision?.rationale || "Executable order emitted.",
    };
  }

  if (quotes.length > 0) {
    return {
      contract,
      kind: "quote",
      size: quotes.reduce((sum, quote) => sum + quote.size, 0),
      edgeVsBook: edgeFor(design.id, contract, decision, deskModel),
      rationale: decision?.rationale || `Quoting ${quotes.length} selections around desk fair.`,
    };
  }

  return {
    contract,
    kind: "flat",
    edgeVsBook: edgeFor(design.id, contract, decision, deskModel),
    rationale: agent?.lastRationale || "No current trigger; exposure remains flat.",
  };
}

function contractForMarket(marketType: string): OddsViewId | null {
  if (marketType === "match_result") return "match_1x2";
  if (marketType === "total_goals") return "ou_25";
  return null;
}

function edgeFor(
  strategyId: string,
  contract: OddsViewId,
  decision: Decision | undefined,
  deskModel: DeskModelSnapshot | null,
): number | null {
  const deskPriced = strategyId === "value" || strategyId === "maker" || strategyId === "hybrid_thesis";
  if (!deskPriced || contract !== "match_1x2" || !deskModel?.ready) return null;
  const selection = decision?.orders.find((order) => order.marketType === "match_result")?.selectionKey;
  if (selection === "home" || selection === "draw" || selection === "away") {
    return deskModel.edgeVsObs[selection];
  }
  const edges = Object.values(deskModel.edgeVsObs);
  return edges.reduce((best, edge) => (Math.abs(edge) > Math.abs(best) ? edge : best), 0);
}
