/**
 * Contract-specific Analysis chart: buckets, multi-series lines, and markers
 * that help agents — not a reused 1X2 path for every bet.
 */
import type { EngineState } from "@/lib/engine/state";
import type { OddsViewId } from "@/lib/tempo/types";
import { ODDS_VIEW_LABELS } from "@/lib/tempo/types";
import type { ContractDeck } from "@/lib/desk/contract-deck";

export type AnalysisSeriesRole = "book" | "model" | "signal" | "aux";

export interface AnalysisSeries {
  id: string;
  label: string;
  role: AnalysisSeriesRole;
  points: Array<{ minute: number; value: number }>;
}

export type AnalysisBand = "cheap" | "fair" | "rich" | "unknown";

export interface AnalysisBucket {
  key: string;
  label: string;
  book: number | null;
  model: number | null;
  edge: number | null;
  /** Relative to desk/model: book cheap ⇒ agents may buy. */
  band: AnalysisBand;
}

export interface AnalysisMarker {
  minute: number;
  kind: string;
  label: string;
  tone: "event" | "signal" | "fill" | "horizon";
}

export interface AnalysisChart {
  mode: "match_1x2" | "ou_25" | "next_score" | "corners_ou" | "swing" | "empty";
  title: string;
  subtitle: string;
  yLabel: string;
  yMin: number;
  yMax: number;
  series: AnalysisSeries[];
  buckets: AnalysisBucket[];
  markers: AnalysisMarker[];
  residual: Array<{ minute: number; value: number }> | null;
  agentHint: string;
  traded: boolean;
}

const EDGE_FAIR = 0.015;

export function buildAnalysisChart(
  state: EngineState,
  contract: OddsViewId,
  deck: ContractDeck,
): AnalysisChart {
  if (contract === "match_1x2") return chart1x2(state, deck);
  if (contract === "ou_25") return chartOu(state, deck);
  if (contract === "next_score") return chartHorizon(state, deck);
  if (contract === "corners_ou") return chartCorners(state, deck);
  if (contract === "swing") return chartSwing(state, deck);
  return emptyChart(contract);
}

function chart1x2(state: EngineState, deck: ContractDeck): AnalysisChart {
  const points = state.shockStrip.odds.views.match_1x2?.points ?? [];
  const hybrid = state.shockStrip.hybrid.series;
  const homeBook = seriesFromBook(points, "home", "Book home", "book");
  const awayBook = seriesFromBook(points, "away", "Book away", "book");
  const fairHome: AnalysisSeries = {
    id: "fair_home",
    label: "Desk fair home",
    role: "model",
    points: hybrid
      .filter((p): p is typeof p & { thesisProb: number } => p.thesisProb != null)
      .map((p) => ({ minute: p.minute, value: p.thesisProb })),
  };
  const residual = alignResidual(homeBook.points, fairHome.points);
  return {
    mode: "match_1x2",
    title: "1X2 path",
    subtitle: "Book vs desk fair · agents trade residual edge",
    yLabel: "Probability",
    yMin: 0,
    yMax: 1,
    series: [homeBook, fairHome, awayBook].filter((s) => s.points.length > 0),
    buckets: bucketsFromDeck(deck),
    markers: [
      ...eventMarkers(state, ["goal", "red"]),
      ...signalMarkers(state, "match_result"),
      ...fillMarkers(state, "match_result"),
    ],
    residual,
    agentHint: "Value / Intensity / Hybrid / Goal Overreaction / Shock / Kelly / Regime trade when |fair − book| clears edge.",
    traded: true,
  };
}

function chartOu(state: EngineState, deck: ContractDeck): AnalysisChart {
  const points = state.shockStrip.odds.views.ou_25?.points ?? [];
  const over = seriesFromBook(points, "over", "Book over 2.5", "book");
  const under = seriesFromBook(points, "under", "Book under 2.5", "book");
  const tempo = state.shockStrip.tempo.series;
  const shotPressure: AnalysisSeries = {
    id: "shot_pressure",
    label: "Shot pressure (aux)",
    role: "aux",
    points: tempo.map((p) => ({
      minute: p.minute,
      value: clamp01(((p.sotHome + p.sotAway) / 12) * 0.55 + ((p.shotsHome + p.shotsAway) / 24) * 0.45),
    })),
  };
  return {
    mode: "ou_25",
    title: "O/U 2.5 path",
    subtitle: "Over / under book · goals push the line · no desk fair yet",
    yLabel: "Probability",
    yMin: 0,
    yMax: 1,
    series: [over, under, shotPressure].filter((s) => s.points.length > 0),
    buckets: bucketsFromDeck(deck),
    markers: [
      ...eventMarkers(state, ["goal"]),
      ...signalMarkers(state, "total_goals"),
      ...fillMarkers(state, "total_goals"),
      ...intensityMarkers(state),
    ],
    residual: null,
    agentHint: "Guarded Momentum / Mean Reversion / Stale Reopen can fill O/U. Intensity bursts often precede overs.",
    traded: true,
  };
}

function chartHorizon(state: EngineState, deck: ContractDeck): AnalysisChart {
  const hybrid = state.shockStrip.hybrid.series;
  const thesisSeries: AnalysisSeries = {
    id: "thesis_mass",
    label: "Thesis mass (desk)",
    role: "model",
    points: hybrid
      .filter((p): p is typeof p & { thesisProb: number } => p.thesisProb != null)
      .map((p) => ({ minute: p.minute, value: p.thesisProb })),
  };
  const pressure: AnalysisSeries = {
    id: "pressure",
    label: "Pressure",
    role: "signal",
    points: hybrid.map((p) => ({ minute: p.minute, value: clamp01(p.pressure) })),
  };
  const current = state.horizon.current;
  const classSeries: AnalysisSeries[] = current
    ? [
        {
          id: "p_goal_home",
          label: `P goal ${state.fixture.homeCode}`,
          role: "model",
          points: [{ minute: state.current?.minute ?? current.closesMinute, value: current.probabilities.goal_home }],
        },
      ]
    : [];
  return {
    mode: "next_score",
    title: "Horizon window",
    subtitle: "Next material event · thesis / pressure · collapses settle the window",
    yLabel: "Probability",
    yMin: 0,
    yMax: 1,
    series: [thesisSeries, pressure, ...classSeries].filter((s) => s.points.length > 0),
    buckets: bucketsFromDeck(deck),
    markers: [
      ...eventMarkers(state, ["goal", "red", "yellow"]),
      ...collapseMarkers(state),
      ...intensityMarkers(state),
    ],
    residual: null,
    agentHint: "Horizon is Analysis input for Hybrid Thesis / Collapse Fade — not a fillable Contract yet.",
    traded: false,
  };
}

function chartCorners(state: EngineState, deck: ContractDeck): AnalysisChart {
  const points = state.shockStrip.odds.views.corners_ou?.points ?? [];
  const over = seriesFromBook(points, "over", "Corners over", "book");
  const under = seriesFromBook(points, "under", "Corners under", "book");
  const tempo = state.shockStrip.tempo.series;
  const cornerRate: AnalysisSeries = {
    id: "corner_rate",
    label: "Corner count (norm)",
    role: "aux",
    points: tempo.map((p) => ({
      minute: p.minute,
      value: clamp01((p.cornersHome + p.cornersAway) / 14),
    })),
  };
  return {
    mode: "corners_ou",
    title: "Corners O/U",
    subtitle: "Book + tempo corner rate · no pricing model · no fills",
    yLabel: "Probability / rate",
    yMin: 0,
    yMax: 1,
    series: [over, under, cornerRate].filter((s) => s.points.length > 0),
    buckets: bucketsFromDeck(deck),
    markers: [
      ...tempoMarkers(state, "corner"),
      ...eventMarkers(state, ["goal"]),
    ],
    residual: null,
    agentHint: "Phase B candidate. Agents stand down — enrichment is Observation only.",
    traded: false,
  };
}

function chartSwing(state: EngineState, deck: ContractDeck): AnalysisChart {
  const points = state.shockStrip.odds.views.swing?.points ?? [];
  const fav: AnalysisSeries = {
    id: "favorite",
    label: "Favorite prob",
    role: "book",
    points: points
      .filter((p) => p.favoriteProb != null)
      .map((p) => ({ minute: p.minute, value: p.favoriteProb as number })),
  };
  const delta: AnalysisSeries = {
    id: "delta",
    label: "|Δ| 180s",
    role: "signal",
    points: points
      .filter((p) => p.delta != null)
      .map((p) => ({ minute: p.minute, value: Math.min(1, Math.abs(p.delta as number) * 4) })),
  };
  return {
    mode: "swing",
    title: "Favorite swing",
    subtitle: "Short-term favorite move · Sentinel sharp moves · not a fill market",
    yLabel: "Probability / scaled Δ",
    yMin: 0,
    yMax: 1,
    series: [fav, delta].filter((s) => s.points.length > 0),
    buckets: bucketsFromDeck(deck),
    markers: [
      ...signalMarkers(state, null),
      ...eventMarkers(state, ["goal"]),
    ],
    residual: null,
    agentHint: "Swing is Analysis for Guarded Momentum quality — not executable.",
    traded: false,
  };
}

function emptyChart(contract: OddsViewId): AnalysisChart {
  return {
    mode: "empty",
    title: ODDS_VIEW_LABELS[contract] ?? contract,
    subtitle: "No analysis series for this contract",
    yLabel: "Value",
    yMin: 0,
    yMax: 1,
    series: [],
    buckets: [],
    markers: [],
    residual: null,
    agentHint: "Awaiting feed.",
    traded: false,
  };
}

function bucketsFromDeck(deck: ContractDeck): AnalysisBucket[] {
  return deck.outs.map((out) => {
    const edge =
      out.bookProb != null && out.modelProb != null ? out.modelProb - out.bookProb : null;
    return {
      key: out.key,
      label: out.label,
      book: out.bookProb,
      model: out.modelProb,
      edge,
      band: bandForEdge(edge),
    };
  });
}

function bandForEdge(edge: number | null): AnalysisBand {
  if (edge == null) return "unknown";
  if (edge > EDGE_FAIR) return "cheap"; // model > book ⇒ book underprices ⇒ buy
  if (edge < -EDGE_FAIR) return "rich";
  return "fair";
}

function seriesFromBook(
  points: Array<{ minute: number; selections: Array<{ key: string; prob: number }> }>,
  key: string,
  label: string,
  role: AnalysisSeriesRole,
): AnalysisSeries {
  return {
    id: `book_${key}`,
    label,
    role,
    points: points
      .map((point) => {
        const sel = point.selections.find((s) => s.key === key);
        return sel ? { minute: point.minute, value: sel.prob } : null;
      })
      .filter((p): p is { minute: number; value: number } => p != null),
  };
}

function alignResidual(
  book: Array<{ minute: number; value: number }>,
  model: Array<{ minute: number; value: number }>,
): Array<{ minute: number; value: number }> {
  const out: Array<{ minute: number; value: number }> = [];
  for (const b of book.slice(-48)) {
    const m = nearest(model, b.minute);
    if (m) out.push({ minute: b.minute, value: m.value - b.value });
  }
  return out;
}

function nearest(
  series: Array<{ minute: number; value: number }>,
  minute: number,
  tolerance = 0.6,
): { minute: number; value: number } | null {
  let best: { minute: number; value: number } | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const sample of series) {
    const delta = Math.abs(sample.minute - minute);
    if (delta < bestDelta) {
      best = sample;
      bestDelta = delta;
    }
  }
  return bestDelta <= tolerance ? best : null;
}

function eventMarkers(state: EngineState, kinds: string[]): AnalysisMarker[] {
  return (state.current?.events ?? [])
    .filter((event) => kinds.includes(event.kind))
    .map((event) => ({
      minute: event.minute,
      kind: event.kind,
      label: event.label,
      tone: "event" as const,
    }));
}

function tempoMarkers(state: EngineState, kind: string): AnalysisMarker[] {
  return state.shockStrip.tempo.markers
    .filter((marker) => marker.kind === kind || marker.label.toLowerCase().includes(kind))
    .map((marker) => ({
      minute: marker.minute,
      kind: marker.kind,
      label: marker.label,
      tone: "event" as const,
    }));
}

function signalMarkers(state: EngineState, marketType: string | null): AnalysisMarker[] {
  const currentSeq = state.current?.seq ?? 0;
  const minute = state.current?.minute ?? state.progress.minute;
  // Signals lack an embedded minute — only annotate the live edge (recent seq).
  return state.signals
    .filter((signal) => {
      if (signal.kind !== "sharp_move" && signal.kind !== "outlier_print" && signal.kind !== "reopened") {
        return false;
      }
      if (signal.seq < currentSeq - 2) return false;
      if (!marketType) return true;
      return signal.marketType === marketType;
    })
    .slice(-8)
    .map((signal) => ({
      minute,
      kind: signal.kind,
      label: `${signal.kind}${signal.selectionKey ? ` · ${signal.selectionKey}` : ""}`,
      tone: "signal" as const,
    }));
}

function fillMarkers(state: EngineState, marketType: string): AnalysisMarker[] {
  const out: AnalysisMarker[] = [];
  for (const agent of state.agents) {
    for (const marker of agent.fillMarkers) {
      if (marker.marketType !== marketType) continue;
      out.push({
        minute: marker.minute,
        kind: "fill",
        label: `${agent.name} ${marker.side} ${marker.size} ${marker.selectionKey}`,
        tone: "fill",
      });
    }
  }
  return out.slice(-40);
}

function intensityMarkers(state: EngineState): AnalysisMarker[] {
  const intensity = state.matchIntensity;
  if (!intensity?.flurrySummary || state.current == null) return [];
  return [
    {
      minute: state.current.minute,
      kind: "intensity",
      label: intensity.flurrySummary,
      tone: "signal",
    },
  ];
}

function collapseMarkers(state: EngineState): AnalysisMarker[] {
  const collapse = state.horizon.lastCollapse;
  if (!collapse) return [];
  return [
    {
      minute: collapse.minute,
      kind: collapse.surprise ? "surprise" : collapse.thesisDead ? "thesis_dead" : "collapse",
      label: `Horizon ${collapse.winner}${collapse.surprise ? " SURPRISE" : ""}`,
      tone: "horizon",
    },
  ];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
