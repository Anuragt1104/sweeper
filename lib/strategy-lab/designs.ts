import type { OddsViewId } from "@/lib/tempo/types";

export type StrategyStanceKind =
  | "trade"
  | "quote"
  | "stand_down"
  | "flat"
  | "ineligible"
  | "no_model";

export interface StrategyStance {
  contract: OddsViewId;
  kind: StrategyStanceKind;
  side?: "buy" | "sell";
  edgeVsBook?: number | null;
  size?: number;
  rationale: string;
}

export interface StrategyDesign {
  id: string;
  name: string;
  color: string;
  displayOrder: number;
  reads: {
    observations: string[];
    analysis: string[];
  };
  eligibleContracts: OddsViewId[];
  fillableNow: OddsViewId[];
  stanceRule: string;
  standDownWhen: string[];
}

/**
 * The sole Strategy Lab roster. UI order, colours, strategy count, eligibility,
 * and design copy all come from this registry.
 */
export const STRATEGY_DESIGNS = [
  {
    id: "value",
    name: "Value",
    color: "#48d7ee",
    displayOrder: 0,
    reads: {
      observations: ["txline.book", "txline.score"],
      analysis: ["desk.fair1x2", "desk.path", "desk.regime"],
    },
    eligibleContracts: ["match_1x2"],
    fillableNow: ["match_1x2"],
    stanceRule: "Trade 1X2 when desk fair clears the configured edge; flatten when it disappears.",
    standDownWhen: ["Desk fair is unavailable", "Trade readiness fails", "Directional regime gate blocks"],
  },
  {
    id: "momentum_naive",
    name: "Naive Momentum",
    color: "#ff667f",
    displayOrder: 1,
    reads: {
      observations: ["txline.book"],
      analysis: ["odds.path.z", "odds.path.return"],
    },
    eligibleContracts: ["match_1x2", "ou_25", "swing"],
    fillableNow: ["match_1x2", "ou_25"],
    stanceRule: "Follow large short-horizon moves; the naive control intentionally ignores quality filtering.",
    standDownWhen: ["Trade readiness fails", "Selected market is absent"],
  },
  {
    id: "momentum_guarded",
    name: "Guarded Momentum",
    color: "#b9f542",
    displayOrder: 2,
    reads: {
      observations: ["txline.book", "txline.events"],
      analysis: ["odds.path", "sentinel.quality", "sentinel.sharp_move", "desk.regime"],
    },
    eligibleContracts: ["match_1x2", "ou_25", "swing"],
    fillableNow: ["match_1x2", "ou_25"],
    stanceRule: "Follow only corroborated momentum and flatten when quality or regime gates fail.",
    standDownWhen: ["Trade readiness fails", "Sentinel quality is poor", "Regime is chaotic"],
  },
  {
    id: "reversion",
    name: "Mean Reversion",
    color: "#9ca9ff",
    displayOrder: 3,
    reads: {
      observations: ["txline.book"],
      analysis: ["odds.path.z", "odds.path.return", "sentinel.assessment"],
    },
    eligibleContracts: ["match_1x2", "ou_25"],
    fillableNow: ["match_1x2", "ou_25"],
    stanceRule: "Fade statistically stretched book moves and reduce exposure as the move normalizes.",
    standDownWhen: ["Trade readiness fails", "Book is suspended", "Selection is stale"],
  },
  {
    id: "maker",
    name: "Market Maker",
    color: "#ffbc5e",
    displayOrder: 4,
    reads: {
      observations: ["txline.book"],
      analysis: ["desk.fair1x2", "desk.path.volatility", "sentinel.quality", "desk.regime"],
    },
    eligibleContracts: ["match_1x2"],
    fillableNow: ["match_1x2"],
    stanceRule: "Quote both sides of 1X2 around desk fair with inventory and quality-aware spread control.",
    standDownWhen: ["Desk fair is unavailable", "Book is suspended", "Quality is below quote threshold"],
  },
  {
    id: "hybrid_thesis",
    name: "Hybrid Thesis",
    color: "#ead06f",
    displayOrder: 5,
    reads: {
      observations: ["txline.book", "tempo.enrichment"],
      analysis: ["desk.fair1x2", "horizon", "desk.pressure", "desk.regime"],
    },
    eligibleContracts: ["match_1x2", "next_score", "ou_25"],
    fillableNow: ["match_1x2"],
    stanceRule: "Map Horizon and pressure into desk fair, then trade only the executable 1X2 contract.",
    standDownWhen: ["Desk fair is unavailable", "Horizon is unavailable", "Trade readiness fails", "Regime blocks"],
  },
  {
    id: "collapse_fade",
    name: "Collapse Fade",
    color: "#fb9b6f",
    displayOrder: 6,
    reads: {
      observations: ["txline.book", "txline.events"],
      analysis: ["horizon.collapse", "desk.path"],
    },
    eligibleContracts: ["match_1x2", "next_score"],
    fillableNow: ["match_1x2"],
    stanceRule: "After a Horizon collapse, fade the priced winner through the corresponding 1X2 selection.",
    standDownWhen: ["No fresh collapse", "Trade readiness fails", "1X2 market is absent"],
  },
] as const satisfies readonly StrategyDesign[];

export type StrategyId = (typeof STRATEGY_DESIGNS)[number]["id"];

export const STRATEGY_COLORS: Record<string, string> = Object.fromEntries(
  STRATEGY_DESIGNS.map((strategy) => [strategy.id, strategy.color]),
);

export function strategyDesign(id: string): StrategyDesign | undefined {
  return STRATEGY_DESIGNS.find((strategy) => strategy.id === id);
}

