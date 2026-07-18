/**
 * Project outcome cards for the selected contract.
 *
 * Contracts (bets) are decision targets. This deck shows outs for one contract —
 * not always Horizon's next-material-event classes.
 */
import type { EngineState } from "@/lib/engine/state";
import type { OddsViewId } from "@/lib/tempo/types";
import { ODDS_VIEW_LABELS } from "@/lib/tempo/types";
import type { DeskModelView } from "@/lib/desk/compose";

export type ContractOutTone = "home" | "away" | "draw" | "over" | "under" | "card" | "quiet" | "neutral";

export interface ContractOut {
  key: string;
  label: string;
  /** Book / observed implied probability when available. */
  bookProb: number | null;
  /** Desk or lens model probability when available. */
  modelProb: number | null;
  /** Primary display probability (model preferred, else book). */
  displayProb: number;
  tone: ContractOutTone;
  thesis?: boolean;
  action?: boolean;
}

export type ContractDeckSource =
  | "horizon"
  | "desk_1x2"
  | "book_lens"
  | "unavailable";

export interface ContractDeck {
  viewId: OddsViewId;
  title: string;
  subtitle: string;
  source: ContractDeckSource;
  /** Agents place fills on this contract family today. */
  traded: boolean;
  outs: ContractOut[];
  detail: string;
  remainingMinutes: number | null;
  closesMinute: number | null;
}

const TRADED: Record<OddsViewId, boolean> = {
  next_score: false,
  match_1x2: true,
  ou_25: true, // Momentum / Reversion can touch total_goals
  corners_ou: false,
  swing: false,
};

export function projectContractDeck(
  state: EngineState | null,
  viewId: OddsViewId,
): ContractDeck {
  const base = {
    viewId,
    title: ODDS_VIEW_LABELS[viewId],
    traded: TRADED[viewId],
  };

  if (!state) {
    return {
      ...base,
      subtitle: "Awaiting session",
      source: "unavailable",
      outs: [],
      detail: "No engine state yet",
      remainingMinutes: null,
      closesMinute: null,
    };
  }

  if (viewId === "next_score") return projectHorizon(state, base);
  if (viewId === "match_1x2") return projectMatch1x2(state, base);
  return projectBookLens(state, viewId, base);
}

function projectHorizon(
  state: EngineState,
  base: { viewId: OddsViewId; title: string; traded: boolean },
): ContractDeck {
  const current = state.horizon.current;
  const remaining =
    current && state.current ? Math.max(0, current.closesMinute - state.current.minute) : null;

  if (!current) {
    return {
      ...base,
      subtitle: "Next material event · 10′ window",
      source: "horizon",
      outs: [
        out("goal_home", `Goal · ${state.fixture.homeCode}`, null, null, "home"),
        out("goal_away", `Goal · ${state.fixture.awayCode}`, null, null, "away"),
        out("card", "Card", null, null, "card"),
        out("quiet", "Quiet", null, null, "quiet"),
      ],
      detail: "Awaiting first Horizon publication",
      remainingMinutes: null,
      closesMinute: null,
    };
  }

  const p = current.probabilities;
  return {
    ...base,
    subtitle: "Next material event · 10′ window",
    source: "horizon",
    outs: [
      {
        ...out("goal_home", `Goal · ${state.fixture.homeCode}`, p.goal_home, p.goal_home, "home"),
        thesis: current.thesis === "goal_home",
        action: current.action === "goal_home",
      },
      {
        ...out("goal_away", `Goal · ${state.fixture.awayCode}`, p.goal_away, p.goal_away, "away"),
        thesis: current.thesis === "goal_away",
        action: current.action === "goal_away",
      },
      {
        ...out("card", "Card", p.card, p.card, "card"),
        thesis: current.thesis === "card",
        action: current.action === "card",
      },
      {
        ...out("quiet", "Quiet", p.quiet, p.quiet, "quiet"),
        thesis: current.thesis === "quiet",
        action: false,
      },
    ],
    detail: current.lowData
      ? `LOW DATA · ${current.bucket}`
      : `N=${current.support} · ${current.bucket}`,
    remainingMinutes: remaining,
    closesMinute: current.closesMinute,
  };
}

function projectMatch1x2(
  state: EngineState,
  base: { viewId: OddsViewId; title: string; traded: boolean },
): ContractDeck {
  const model = state.deskModel;
  const homeCode = state.fixture.homeCode;
  const awayCode = state.fixture.awayCode;
  const book = book1x2(state);
  const fair = model?.fair1x2;

  const drive = model?.horizonDrive;
  const outs: ContractOut[] = [
    {
      ...out("home", homeCode, book.home, fair?.home ?? null, "home"),
      thesis: drive === "goal_home",
      action: false,
    },
    out("draw", "Draw", book.draw, fair?.draw ?? null, "draw"),
    {
      ...out("away", awayCode, book.away, fair?.away ?? null, "away"),
      thesis: drive === "goal_away",
      action: false,
    },
  ];

  return {
    ...base,
    subtitle: "Match result · desk fair vs book",
    source: model?.ready ? "desk_1x2" : "book_lens",
    outs,
    detail: model?.ready
      ? `desk-v1 · ${model.detail}`
      : "Desk model warming — showing book when present",
    remainingMinutes: null,
    closesMinute: null,
  };
}

function projectBookLens(
  state: EngineState,
  viewId: OddsViewId,
  base: { viewId: OddsViewId; title: string; traded: boolean },
): ContractDeck {
  const view = state.shockStrip.odds.views[viewId];
  const point = view?.points.at(-1);
  const lens = state.shockStrip.strategies[viewId];
  const last = lens?.series.at(-1);
  const hybrid = last?.hybridProb ?? null;

  const selections = point?.selections ?? [];
  if (viewId === "swing") {
    const fav = point?.favorite;
    const favLabel =
      fav === "home"
        ? state.fixture.homeCode
        : fav === "away"
          ? state.fixture.awayCode
          : "Favorite";
    return {
      ...base,
      subtitle: "Short-term favorite swing",
      source: point ? "book_lens" : "unavailable",
      outs: [
        out(
          "favorite",
          favLabel,
          point?.favoriteProb ?? null,
          hybrid,
          fav === "home" ? "home" : fav === "away" ? "away" : "neutral",
        ),
        out(
          "delta",
          "Δ 180s",
          point?.delta != null ? Math.abs(point.delta) : null,
          null,
          "neutral",
        ),
      ],
      detail: lens?.blurb || "Swing lens",
      remainingMinutes: null,
      closesMinute: null,
    };
  }

  const outs: ContractOut[] = selections.map((s, i) => {
    const isPrimary = last?.label === s.key || (i === 0 && !last?.label);
    return out(
      s.key,
      s.label,
      s.prob,
      isPrimary ? hybrid : null,
      toneForKey(s.key),
    );
  });

  if (outs.length === 0) {
    outs.push(
      out("a", "—", null, null, "neutral"),
      out("b", "—", null, null, "neutral"),
    );
  }

  return {
    ...base,
    subtitle: `${base.title} · book + contract lens`,
    source: selections.length ? "book_lens" : "unavailable",
    outs,
    detail: lens?.blurb || (view?.available ? "Lens ready" : "Market not in feed"),
    remainingMinutes: null,
    closesMinute: null,
  };
}

function book1x2(state: EngineState): { home: number | null; draw: number | null; away: number | null } {
  const m = state.current?.markets.find((x) => x.type === "match_result");
  const pick = (key: string) => m?.selections.find((s) => s.key === key)?.prob ?? null;
  return { home: pick("home"), draw: pick("draw"), away: pick("away") };
}

function out(
  key: string,
  label: string,
  bookProb: number | null,
  modelProb: number | null,
  tone: ContractOutTone,
): ContractOut {
  const displayProb = modelProb ?? bookProb ?? 0;
  return { key, label, bookProb, modelProb, displayProb, tone };
}

function toneForKey(key: string): ContractOutTone {
  const k = key.toLowerCase();
  if (k.includes("home") || k === "1") return "home";
  if (k.includes("away") || k === "2") return "away";
  if (k.includes("draw") || k === "x") return "draw";
  if (k.includes("over")) return "over";
  if (k.includes("under")) return "under";
  return "neutral";
}

/** Compact serializable desk model for the SSE snapshot. */
export type DeskModelSnapshot = Pick<
  DeskModelView,
  | "fair1x2"
  | "scoreState1x2"
  | "fairHome"
  | "edgeVsObs"
  | "horizonDrive"
  | "horizonHomeTilt"
  | "ready"
  | "detail"
  | "weightsVersion"
> & {
  hybrid: Pick<
    DeskModelView["hybrid"],
    "homeTilt" | "tempoIntensity" | "signedOddsVelocityHome" | "pressure" | "tempoDifferential"
  >;
};

export function snapshotDeskModel(model: DeskModelView): DeskModelSnapshot {
  return {
    fair1x2: model.fair1x2,
    scoreState1x2: model.scoreState1x2,
    fairHome: model.fairHome,
    edgeVsObs: model.edgeVsObs,
    horizonDrive: model.horizonDrive,
    horizonHomeTilt: model.horizonHomeTilt,
    ready: model.ready,
    detail: model.detail,
    weightsVersion: model.weightsVersion,
    hybrid: {
      homeTilt: model.hybrid.homeTilt,
      tempoIntensity: model.hybrid.tempoIntensity,
      signedOddsVelocityHome: model.hybrid.signedOddsVelocityHome,
      pressure: model.hybrid.pressure,
      tempoDifferential: model.hybrid.tempoDifferential,
    },
  };
}
