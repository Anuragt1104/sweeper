import type { AgentView, EngineState, SelectionView } from "@/lib/engine/state";
import { projectContractDeck, type ContractDeck } from "@/lib/desk/contract-deck";
import type { StrategyStanceView } from "@/lib/strategy-lab/stances";
import { STRATEGY_DESIGNS, type StrategyDesign } from "@/lib/strategy-lab/designs";
import {
  buildAnalysisChart,
  type AnalysisChart,
} from "@/lib/strategy-lab/analysis-chart";
import {
  ODDS_VIEW_LABELS,
  type OddsViewId,
  type SideCounts,
} from "@/lib/tempo/types";

export type ContractCoverage = "model" | "book_only" | "no_market" | "signal_only";

export interface ContractNavItem {
  id: OddsViewId;
  label: string;
  coverage: ContractCoverage;
  summary: string;
  fillable: boolean;
}

export interface ObservationBookLine {
  key: string;
  label: string;
  probability: number;
  decimal: number;
  movement: SelectionView["movement"];
  stale: boolean;
}

export interface ObservationEvent {
  id: string;
  minute: number;
  label: string;
  kind: string;
  source: "txline" | "enrichment";
}

export interface TempoStatView {
  key: string;
  label: string;
  home: number;
  away: number;
  homeDelta: number;
  awayDelta: number;
  suffix?: string;
}

export interface StrategyLabView {
  selectedContract: OddsViewId;
  contracts: ContractNavItem[];
  observation: {
    book: ObservationBookLine[];
    bookAvailable: boolean;
    bookMessage: string;
    tempo: TempoStatView[];
    events: ObservationEvent[];
    scoreAgeMs: number | null;
    oddsAgeMs: number | null;
    sourceLabel: string;
  };
  analysis: {
    deck: ContractDeck;
    pricingBoundary: string | null;
    regime: string;
    intensity: string;
    quality: number;
    readiness: boolean;
    referenceStatus: string;
    /** @deprecated Prefer chart.series — kept for residual/tests during transition. */
    timeline: Array<{
      minute: number;
      bookProbability: number | null;
      deskProbability: number | null;
      label: string | null;
    }>;
    eventMarkers: Array<{
      minute: number;
      kind: string;
      label: string;
    }>;
    referenceKind: "desk_fair" | "path_lens" | null;
    referenceLabel: string | null;
    referenceDrivesTrades: boolean;
    /** Contract-specific buckets / lines / markers for agents. */
    chart: AnalysisChart;
  };
  strategy: {
    rows: Array<{
      design: StrategyDesign;
      stance: StrategyStanceView;
      agent: EngineState["agents"][number] | null;
    }>;
    leader: string | null;
    /** Compact A/B lifts for the arena head. */
    lifts: Array<{ id: string; label: string; value: number | null }>;
  };
  /**
   * Coherent research surface: the same desk inputs agents read, plus
   * decision→fill→contract-PnL attribution for the selected contract.
   */
  research: {
    chain: string;
    deskInputs: {
      fairHome: number | null;
      fairAway: number | null;
      edgeHome: number | null;
      regime: string;
      intensity: string;
      quality: number;
      pressure: number | null;
      readiness: boolean;
      horizonThesis: string | null;
    };
    marketType: string | null;
    rows: Array<{
      design: StrategyDesign;
      stance: StrategyStanceView;
      agent: EngineState["agents"][number] | null;
      /** Whole-book PnL. */
      totalPnl: number;
      /** PnL attributed to the selected contract's market (0 if no fills there). */
      contractPnl: number;
      contractTrades: number;
      contractExposure: number;
      /** Fill markers on this contract only (indices into equity curve). */
      contractMarkers: EngineState["agents"][number]["fillMarkers"];
      lastDriver: string | null;
    }>;
  };
}

const CONTRACTS: OddsViewId[] = ["match_1x2", "ou_25", "next_score", "corners_ou", "swing"];

export const StrategyLabProjection = {
  project(state: EngineState, selectedContract: OddsViewId): StrategyLabView {
    const deck = projectContractDeck(state, selectedContract);
    const book = selectedBook(state, selectedContract);
    const latestTempo = state.shockStrip.tempo.series.at(-1);
    const priorTempo = state.shockStrip.tempo.series.at(-2);
    const latestCounts = state.shockStrip.tempo.latest;
    const stances = state.strategyStances ?? [];
    const agents = state.agents.map(normalizeAgentView);

    const strategyRows = STRATEGY_DESIGNS.map((design) => ({
      design,
      stance: stances.find((stance) => stance.agentId === design.id && stance.contract === selectedContract)
        ?? missingStance(design, selectedContract),
      agent: agents.find((agent) => agent.id === design.id) ?? null,
    }));
    const marketType = contractMarketType(selectedContract);
    const chart = buildAnalysisChart(state, selectedContract, deck);
    const timelineFromChart = chart.series[0]
      ? chart.series[0].points.slice(-48).map((point) => {
          const model = chart.series.find((s) => s.role === "model");
          const modelPt = model?.points.find((p) => Math.abs(p.minute - point.minute) < 0.6);
          return {
            minute: point.minute,
            bookProbability: chart.series[0].role === "book" ? point.value : null,
            deskProbability: modelPt?.value ?? null,
            label: chart.series[0].label,
          };
        })
      : [];

    return {
      selectedContract,
      contracts: CONTRACTS.map((id) => contractNav(state, id, stances)),
      observation: {
        book,
        bookAvailable: book.length > 0,
        bookMessage: book.length > 0 ? "Observed TxLINE book" : "Not returned by TxLINE",
        tempo: tempoStats(latestCounts, latestTempo, priorTempo),
        events: recentEvents(state),
        scoreAgeMs: state.feedHealth.lastScoreAtMs == null
          ? null
          : Math.max(0, state.updatedAtMs - state.feedHealth.lastScoreAtMs),
        oddsAgeMs: state.feedHealth.lastOddsAtMs == null
          ? null
          : Math.max(0, state.updatedAtMs - state.feedHealth.lastOddsAtMs),
        sourceLabel: provenanceLabel(state.provenance),
      },
      analysis: {
        deck,
        pricingBoundary: pricingBoundary(deck, selectedContract),
        regime: state.deskPath?.regime ?? "warming",
        intensity: intensityLabel(state),
        quality: state.quality,
        readiness: state.tradeReadiness.ready,
        referenceStatus: state.deskModel?.ready ? state.deskModel.weightsVersion : "No robust reference",
        timeline: timelineFromChart,
        eventMarkers: chart.markers
          .filter((marker) => marker.tone === "event")
          .map((marker) => ({ minute: marker.minute, kind: marker.kind, label: marker.label })),
        referenceKind: chart.series.some((s) => s.role === "model")
          ? selectedContract === "match_1x2"
            ? "desk_fair"
            : "path_lens"
          : null,
        referenceLabel:
          selectedContract === "match_1x2"
            ? "Desk fair (traded)"
            : chart.series.some((s) => s.role === "model")
              ? "Model / thesis series"
              : null,
        referenceDrivesTrades: selectedContract === "match_1x2" && Boolean(state.deskModel?.ready),
        chart,
      },
      strategy: {
        rows: strategyRows,
        leader: state.leader,
        lifts: [
          { id: "intensity", label: "Intensity lift", value: state.scorecard.intensityEdge },
          { id: "kelly", label: "Kelly lift", value: state.scorecard.kellyEdge },
          { id: "regime", label: "Regime lift", value: state.scorecard.regimeLift },
        ],
      },
      research: {
        chain: "Observation tick → desk model / intensity / Horizon / Sentinel → stance → fill → contract PnL",
        deskInputs: {
          fairHome: state.deskModel?.ready ? state.deskModel.fair1x2.home : null,
          fairAway: state.deskModel?.ready ? state.deskModel.fair1x2.away : null,
          edgeHome: state.deskModel?.ready ? state.deskModel.edgeVsObs.home : null,
          regime: state.deskPath?.regime ?? state.scorecard.regime,
          intensity: intensityLabel(state),
          quality: state.quality,
          pressure: state.deskModel?.hybrid.pressure ?? null,
          readiness: state.tradeReadiness.ready,
          horizonThesis: state.horizon.current?.thesis ?? null,
        },
        marketType,
        rows: strategyRows.map((row) => {
          const slice = marketType
            ? row.agent?.contractPnl.find((entry) => entry.marketType === marketType)
            : undefined;
          const contractMarkers = (row.agent?.fillMarkers ?? []).filter((marker) =>
            marketType ? marker.marketType === marketType : false,
          );
          return {
            ...row,
            totalPnl: row.agent?.metrics.pnl ?? 0,
            contractPnl: slice?.pnl ?? 0,
            contractTrades: slice?.trades ?? 0,
            contractExposure: slice?.exposure ?? 0,
            contractMarkers,
            lastDriver: driverLabel(row.agent?.drivingInputs ?? null, row.agent?.lastDecisionKind ?? null),
          };
        }),
      },
    };
  },
};

function normalizeAgentView(agent: AgentView): AgentView {
  return {
    ...agent,
    curveMinutes: agent.curveMinutes ?? [],
    fillMarkers: agent.fillMarkers ?? [],
    contractPnl: agent.contractPnl ?? [],
  };
}

function contractNav(
  state: EngineState,
  id: OddsViewId,
  stances: StrategyStanceView[],
): ContractNavItem {
  const deck = projectContractDeck(state, id);
  const anyFillable = stances.some(
    (stance) => stance.contract === id && ["trade", "quote", "flat", "stand_down"].includes(stance.kind),
  );
  let coverage: ContractCoverage;
  if (deck.source === "unavailable") coverage = "no_market";
  else if (deck.source === "desk_1x2" || deck.source === "horizon") coverage = "model";
  else if (!anyFillable) coverage = "signal_only";
  else coverage = "book_only";

  const best = deck.outs
    .filter((out) => out.bookProb != null || out.modelProb != null)
    .reduce<(typeof deck.outs)[number] | null>(
      (current, out) => (!current || out.displayProb > current.displayProb ? out : current),
      null,
    );
  return {
    id,
    label: ODDS_VIEW_LABELS[id],
    coverage,
    summary: best ? `${best.label} ${Math.round(best.displayProb * 100)}%` : "Awaiting line",
    fillable: anyFillable,
  };
}

function selectedBook(state: EngineState, contract: OddsViewId): ObservationBookLine[] {
  const marketType = contract === "match_1x2"
    ? "match_result"
    : contract === "ou_25"
      ? "total_goals"
      : contract === "corners_ou"
        ? "corners"
        : null;
  if (marketType) {
    const market = state.current?.markets.find((candidate) => candidate.type === marketType);
    return (market?.selections ?? []).map((selection) => ({
      key: selection.key,
      label: selection.label,
      probability: selection.prob,
      decimal: selection.decimal,
      movement: selection.movement,
      stale: selection.stale,
    }));
  }
  if (contract === "swing") {
    const point = state.shockStrip.odds.views.swing.points.at(-1);
    return (point?.selections ?? []).map((selection) => ({
      key: selection.key,
      label: selection.label,
      probability: selection.prob,
      decimal: 1 / Math.max(0.001, selection.prob),
      movement: "flat",
      stale: false,
    }));
  }
  return [];
}

function tempoStats(
  counts: EngineState["shockStrip"]["tempo"]["latest"],
  latest: EngineState["shockStrip"]["tempo"]["series"][number] | undefined,
  prior: EngineState["shockStrip"]["tempo"]["series"][number] | undefined,
): TempoStatView[] {
  const pair = (key: keyof NonNullable<typeof counts>, label: string, suffix?: string): TempoStatView => {
    const value = counts?.[key] as SideCounts | undefined;
    return {
      key,
      label,
      home: value?.home ?? 0,
      away: value?.away ?? 0,
      homeDelta: 0,
      awayDelta: 0,
      suffix,
    };
  };
  const stats = [
    pair("shots", "Shots"),
    pair("sot", "On target"),
    pair("attacks", "Attacks"),
    pair("fouls", "Fouls"),
    pair("possession", "Possession", "%"),
  ];
  if (latest) {
    stats.splice(3, 0, {
      key: "corners",
      label: "Corners",
      home: latest.cornersHome,
      away: latest.cornersAway,
      homeDelta: latest.cornersHome - (prior?.cornersHome ?? latest.cornersHome),
      awayDelta: latest.cornersAway - (prior?.cornersAway ?? latest.cornersAway),
    });
  }
  return stats.map((stat) => {
    if (!latest || !prior || stat.key === "corners") return stat;
    const map: Record<string, [keyof typeof latest, keyof typeof latest]> = {
      shots: ["shotsHome", "shotsAway"],
      sot: ["sotHome", "sotAway"],
      fouls: ["foulsHome", "foulsAway"],
      possession: ["possessionHome", "possessionAway"],
    };
    const keys = map[stat.key];
    if (!keys) return stat;
    return {
      ...stat,
      homeDelta: Number(latest[keys[0]]) - Number(prior[keys[0]]),
      awayDelta: Number(latest[keys[1]]) - Number(prior[keys[1]]),
    };
  });
}

function recentEvents(state: EngineState): ObservationEvent[] {
  const txline = (state.current?.events ?? []).map((event, index) => ({
    id: `tick-${state.current?.seq ?? 0}-${index}`,
    minute: event.minute,
    label: event.label,
    kind: event.kind,
    source: "txline" as const,
  }));
  const enrichment = state.shockStrip.tempo.markers.map((marker) => ({
    id: marker.id,
    minute: marker.minute,
    label: marker.label,
    kind: marker.kind,
    source: marker.source === "txline" ? "txline" as const : "enrichment" as const,
  }));
  return [...txline, ...enrichment]
    .sort((a, b) => b.minute - a.minute)
    .filter((event, index, all) => all.findIndex((candidate) => candidate.minute === event.minute && candidate.label === event.label) === index);
}

function pricingBoundary(deck: ContractDeck, contract: OddsViewId): string | null {
  if (deck.source === "unavailable") return "NO MARKET · TxLINE has not returned this contract.";
  if (contract === "corners_ou" || contract === "swing" || deck.source === "book_lens") {
    return "NO PRICING MODEL · Observed book/path only; agents do not trade this contract.";
  }
  return null;
}

function contractMarketType(contract: OddsViewId): string | null {
  if (contract === "match_1x2") return "match_result";
  if (contract === "ou_25") return "total_goals";
  if (contract === "corners_ou") return "corners";
  return null;
}

function driverLabel(
  inputs: EngineState["agents"][number]["drivingInputs"],
  kind: EngineState["agents"][number]["lastDecisionKind"],
): string | null {
  if (!inputs && !kind) return null;
  const parts: string[] = [];
  if (kind) parts.push(kind);
  if (inputs?.sentinelKind) parts.push(String(inputs.sentinelKind));
  if (inputs?.horizonThesis) parts.push(`thesis ${inputs.horizonThesis}`);
  if (inputs?.hybridProb != null) parts.push(`fair ${(inputs.hybridProb * 100).toFixed(0)}%`);
  if (inputs?.tempoIntensity != null) parts.push(`tempo ${(inputs.tempoIntensity * 100).toFixed(0)}`);
  return parts.join(" · ") || null;
}

function provenanceLabel(provenance: EngineState["provenance"]): string {
  if (provenance === "live") return "TxLINE mainnet · live";
  if (provenance === "recorded_live") return "Recorded TxLINE session";
  return "Deterministic simulation";
}

function intensityLabel(state: EngineState): string {
  const intensity = state.matchIntensity;
  if (!intensity) return "warming";
  if (intensity.flurrySummary) return intensity.flurrySummary;
  if (intensity.redCardActive) return "red-card state";
  if (intensity.isComeback) return "comeback";
  if (intensity.cardsLast5Min > 0) return `${intensity.cardsLast5Min} card${intensity.cardsLast5Min === 1 ? "" : "s"} in 5′`;
  if (intensity.goalsLast10Min > 0) return `${intensity.goalsLast10Min} goal in 10′`;
  return "normal";
}

function missingStance(design: StrategyDesign, contract: OddsViewId): StrategyStanceView {
  const eligible = design.eligibleContracts.includes(contract);
  return {
    agentId: design.id,
    contract,
    kind: eligible ? "no_model" : "ineligible",
    rationale: eligible ? "Awaiting engine stance projection." : "This contract is outside the strategy design.",
  };
}
