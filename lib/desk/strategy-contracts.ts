/**
 * Which strategies trade which contracts, and which shared signals they read.
 * Honest map for UI — agents do not invent fills on unused contracts.
 */
import type { OddsViewId } from "@/lib/tempo/types";

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

export const STRATEGY_CONTRACT_BINDINGS: StrategyContractBinding[] = [
  {
    agentId: "value",
    name: "Value",
    trades: ["match_1x2"],
    signalUses: [],
    signals: ["desk fair 1X2", "obs book", "path", "regime"],
    blurb: "Buys 1X2 when desk fair beats the book.",
  },
  {
    agentId: "momentum_naive",
    name: "Naive Momentum",
    trades: ["match_1x2", "ou_25"],
    signalUses: [],
    signals: ["odds path z/ret", "Sentinel sharp_move"],
    blurb: "Follows short-horizon odds momentum on 1X2 and O/U.",
  },
  {
    agentId: "momentum_guarded",
    name: "Guarded Momentum",
    trades: ["match_1x2", "ou_25"],
    signalUses: [],
    signals: ["odds path z/ret", "Sentinel quality", "regime"],
    blurb: "Momentum with market-quality stand-down.",
  },
  {
    agentId: "reversion",
    name: "Mean Reversion",
    trades: ["match_1x2", "ou_25"],
    signalUses: [],
    signals: ["odds path z/ret", "Sentinel"],
    blurb: "Fades stretched odds moves on 1X2 and O/U.",
  },
  {
    agentId: "maker",
    name: "Market Maker",
    trades: ["match_1x2"],
    signalUses: [],
    signals: ["desk fair 1X2", "path vol"],
    blurb: "Quotes 1X2 around desk fair.",
  },
  {
    agentId: "hybrid_thesis",
    name: "Hybrid Thesis",
    trades: ["match_1x2"],
    signalUses: ["next_score"],
    signals: ["desk fair 1X2", "Horizon hazard", "tempo", "odds velocity", "pressure", "regime"],
    blurb: "Trades 1X2 vs desk-v1; Horizon is a mapped signal, not the fill market.",
  },
  {
    agentId: "collapse_fade",
    name: "Collapse Fade",
    trades: ["match_1x2"],
    signalUses: ["next_score"],
    signals: ["Horizon collapse", "obs book"],
    blurb: "Fades Horizon collapses into 1X2.",
  },
];

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
