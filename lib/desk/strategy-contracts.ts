/**
 * Which strategies trade which contracts, and which shared signals they read.
 * Honest map for UI — agents do not invent fills on unused contracts.
 */
import type { OddsViewId } from "@/lib/tempo/types";
import { STRATEGY_DESIGNS } from "@/lib/strategy-lab/designs";

export type StrategyContractRole = "trades" | "signal_only" | "unused";

export interface StrategyContractBinding {
  agentId: string;
  name: string;
  /** Contracts this agent places fills on. */
  trades: OddsViewId[];
  /** Contracts used only as signal inputs (e.g. Horizon next_score → 1X2). */
  signalUses: OddsViewId[];
  /** Named shared desk signals this strategy reads. */
  signals: string[];
  blurb: string;
}

export const STRATEGY_CONTRACT_BINDINGS: StrategyContractBinding[] = STRATEGY_DESIGNS.map((design) => ({
  agentId: design.id,
  name: design.name,
  trades: [...design.fillableNow],
  signalUses: design.eligibleContracts.filter(
    (contract) => !(design.fillableNow as readonly OddsViewId[]).includes(contract),
  ),
  signals: [...design.reads.analysis, ...design.reads.observations],
  blurb: design.stanceRule,
}));

export function roleForContract(
  binding: StrategyContractBinding,
  viewId: OddsViewId,
): StrategyContractRole {
  if (binding.trades.includes(viewId)) return "trades";
  if (binding.signalUses.includes(viewId)) return "signal_only";
  return "unused";
}

export function bindingsForContract(viewId: OddsViewId): Array<StrategyContractBinding & { role: StrategyContractRole }> {
  return STRATEGY_CONTRACT_BINDINGS.map((b) => ({
    ...b,
    role: roleForContract(b, viewId),
  })).filter((b) => b.role !== "unused");
}
