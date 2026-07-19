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
  families: Array<"core" | "event" | "meta">;
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
    families: ["core", "meta"],
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
    id: "momentum_guarded",
    name: "Guarded Momentum",
    color: "#b9f542",
    displayOrder: 1,
    families: ["core"],
    reads: {
      observations: ["txline.book", "txline.events"],
      analysis: ["odds.path", "sentinel.quality", "sentinel.sharp_move", "desk.regime"],
    },
    eligibleContracts: ["match_1x2", "ou_25", "swing"],
    fillableNow: ["match_1x2", "ou_25"],
    stanceRule: "Follow only Sentinel-confirmed sharp moves; flatten when quality or regime gates fail.",
    standDownWhen: ["Trade readiness fails", "Sentinel quality is poor", "Regime is chaotic"],
  },
  {
    id: "reversion",
    name: "Mean Reversion",
    color: "#9ca9ff",
    displayOrder: 2,
    families: ["core"],
    reads: {
      observations: ["txline.book"],
      analysis: ["odds.path.z", "odds.path.return", "sentinel.assessment"],
    },
    eligibleContracts: ["match_1x2", "ou_25"],
    fillableNow: ["match_1x2", "ou_25"],
    stanceRule: "Fade Sentinel outlier_print snaps and reduce exposure as the move normalizes.",
    standDownWhen: ["Trade readiness fails", "Book is suspended", "Selection is stale"],
  },
  {
    id: "intensity_burst",
    name: "Intensity Burst",
    color: "#ff8f6b",
    displayOrder: 3,
    families: ["core", "event"],
    reads: {
      observations: ["txline.events", "tempo.enrichment"],
      analysis: ["match.intensity", "desk.fair1x2", "desk.path.tempoAccel", "desk.regime"],
    },
    eligibleContracts: ["match_1x2"],
    fillableNow: ["match_1x2"],
    stanceRule:
      "During flurry / card / tempo-accel windows, trade desk fair vs book. Intensity is a gate only — never a price.",
    standDownWhen: ["Desk fair is unavailable", "No intensity window", "Trade readiness fails", "Regime blocks"],
  },
  {
    id: "hybrid_thesis",
    name: "Hybrid Thesis",
    color: "#ead06f",
    displayOrder: 4,
    families: ["core"],
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
    displayOrder: 5,
    families: ["core", "event"],
    reads: {
      observations: ["txline.book", "txline.events"],
      analysis: ["horizon.collapse", "desk.path"],
    },
    eligibleContracts: ["match_1x2", "next_score"],
    fillableNow: ["match_1x2"],
    stanceRule: "After a Horizon collapse, fade the priced winner through the corresponding 1X2 selection.",
    standDownWhen: ["No fresh collapse", "Trade readiness fails", "1X2 market is absent"],
  },
  {
    id: "goal_overreaction",
    name: "Goal Overreaction",
    color: "#ff5c8a",
    displayOrder: 6,
    families: ["event"],
    reads: {
      observations: ["txline.events", "txline.score"],
      analysis: ["match.intensity.scoreJustChanged", "desk.fair1x2", "desk.regime"],
    },
    eligibleContracts: ["match_1x2"],
    fillableNow: ["match_1x2"],
    stanceRule:
      "After a goal, cool off briefly then fade book overshoot toward desk fair inside a short window.",
    standDownWhen: ["No post-goal window", "Still chaotic after cool-off", "Desk fair unavailable", "Readiness fails"],
  },
  {
    id: "shock_fade",
    name: "Shock Fade",
    color: "#c77dff",
    displayOrder: 7,
    families: ["event"],
    reads: {
      observations: ["txline.events"],
      analysis: ["match.intensity.redCard", "match.intensity.comeback", "desk.fair1x2"],
    },
    eligibleContracts: ["match_1x2"],
    fillableNow: ["match_1x2"],
    stanceRule: "Fade red-card panic and comeback emotion toward desk fair while the shock gate is open.",
    standDownWhen: ["No red-card or comeback shock", "Desk fair unavailable", "Regime blocks", "Readiness fails"],
  },
  {
    id: "stale_reopen",
    name: "Stale Reopen",
    color: "#5ce1e6",
    displayOrder: 8,
    families: ["event"],
    reads: {
      observations: ["txline.book"],
      analysis: ["sentinel.reopened", "sentinel.outlier_print", "desk.fair1x2", "odds.reference"],
    },
    eligibleContracts: ["match_1x2", "ou_25"],
    fillableNow: ["match_1x2", "ou_25"],
    stanceRule: "On suspend→reopen (or stale-clear outlier), fade misprints toward consensus / desk fair.",
    standDownWhen: ["No reopen window", "Book still suspended", "Readiness fails"],
  },
  {
    id: "regime_switcher",
    name: "Regime Switcher",
    color: "#f0c14a",
    displayOrder: 9,
    families: ["meta"],
    reads: {
      observations: ["txline.book"],
      analysis: ["desk.regime", "desk.fair1x2", "sentinel.sharp_move", "sentinel.quality"],
    },
    eligibleContracts: ["match_1x2"],
    fillableNow: ["match_1x2"],
    stanceRule: "Calm → Value overweight; normal → Guarded Momentum; chaotic → flatten.",
    standDownWhen: ["Chaotic regime", "Quality gate in normal mode", "Desk fair unavailable", "Readiness fails"],
  },
  {
    id: "kelly_value",
    name: "Kelly Value",
    color: "#7dffa3",
    displayOrder: 10,
    families: ["meta"],
    reads: {
      observations: ["txline.book", "txline.score"],
      analysis: ["desk.fair1x2", "desk.regime", "portfolio.drawdown"],
    },
    eligibleContracts: ["match_1x2"],
    fillableNow: ["match_1x2"],
    stanceRule: "Same desk-fair edge as Value, sized with fractional Kelly and soft drawdown throttle.",
    standDownWhen: ["Desk fair unavailable", "Regime blocks", "Readiness fails"],
  },
] as const satisfies readonly StrategyDesign[];

export type StrategyId = (typeof STRATEGY_DESIGNS)[number]["id"];

export const STRATEGY_COLORS: Record<string, string> = Object.fromEntries(
  STRATEGY_DESIGNS.map((strategy) => [strategy.id, strategy.color]),
);

export function strategyDesign(id: string): StrategyDesign | undefined {
  return STRATEGY_DESIGNS.find((strategy) => strategy.id === id);
}
