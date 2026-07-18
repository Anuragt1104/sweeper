/**
 * Shock Strip — three named strategies: Tempo · Odds · Hybrid.
 * Enrichment never settles Horizon. Odds views are lenses inside Odds, not strategies.
 */

export type ShockTrack = "tempo" | "odds" | "hybrid";

export type OddsViewId = "next_score" | "ou_25" | "match_1x2" | "corners_ou" | "swing";

export type TempoMarkerKind =
  | "goal"
  | "yellow"
  | "red"
  | "corner"
  | "kickoff"
  | "half-time"
  | "full-time"
  | "shot"
  | "shot_on_target"
  | "foul"
  | "offside"
  | "attack"
  | "dangerous_attack"
  | "possession_shift";

export type OddsMarkerKind = "odds_swing";

export type HybridMarkerKind = "horizon_collapse";

/** @deprecated Use TempoMarkerKind — kept as alias for severity helpers during migration. */
export type MaterialKind = TempoMarkerKind | OddsMarkerKind | HybridMarkerKind;

export type TempoKind =
  | "shot"
  | "shot_on_target"
  | "foul"
  | "offside"
  | "attack"
  | "dangerous_attack"
  | "possession_shift";

export type TempoSource = "sim" | "api-football" | "none";

export interface SideCounts {
  home: number;
  away: number;
}

export interface TempoCounts {
  shots: SideCounts;
  sot: SideCounts;
  fouls: SideCounts;
  offsides: SideCounts;
  attacks: SideCounts;
  dangerousAttacks: SideCounts;
  possession: SideCounts;
}

/** Cumulative tempo snapshot at a match minute. */
export interface TempoSnapshot {
  fixtureId: string;
  minute: number;
  tsMs: number;
  counts: TempoCounts;
  source: Exclude<TempoSource, "none">;
}

export interface TempoEvent {
  fixtureId: string;
  minute: number;
  tsMs: number;
  kind: TempoKind;
  side: "home" | "away";
  label: string;
  source: Exclude<TempoSource, "none">;
}

export interface ShockSpike {
  id: string;
  minute: number;
  severity: number;
  track: ShockTrack;
  kind: string;
  label: string;
  side?: "home" | "away";
  source: "txline" | "sim" | "api-football" | "horizon";
}

export interface TempoSeriesPoint {
  minute: number;
  shotsHome: number;
  shotsAway: number;
  sotHome: number;
  sotAway: number;
  cornersHome: number;
  cornersAway: number;
  cardsHome: number;
  cardsAway: number;
  foulsHome: number;
  foulsAway: number;
  possessionHome: number;
  possessionAway: number;
}

export interface OddsSelectionPoint {
  key: string;
  label: string;
  prob: number;
}

export interface OddsViewPoint {
  minute: number;
  selections: OddsSelectionPoint[];
  /** Swing view: favorite implied prob and recent delta. */
  favorite?: "home" | "away" | "none" | null;
  favoriteProb?: number;
  delta?: number;
}

export interface OddsViewSeries {
  id: OddsViewId;
  label: string;
  available: boolean;
  points: OddsViewPoint[];
}

export interface HybridSeriesPoint {
  minute: number;
  thesisProb: number;
  tempoIntensity: number;
  oddsVelocity: number;
  pressure: number;
  thesis: string | null;
}

export interface ShockStripState {
  tempo: {
    series: TempoSeriesPoint[];
    markers: ShockSpike[];
    latest: TempoCounts | null;
    source: TempoSource;
    status: "ready" | "polling" | "unavailable" | "error";
    detail: string;
  };
  odds: {
    views: Record<OddsViewId, OddsViewSeries>;
    availableViews: OddsViewId[];
    defaultView: OddsViewId;
  };
  hybrid: {
    series: HybridSeriesPoint[];
    markers: ShockSpike[];
  };
}

export const ODDS_VIEW_ORDER: OddsViewId[] = [
  "next_score",
  "ou_25",
  "match_1x2",
  "corners_ou",
  "swing",
];

export const ODDS_VIEW_LABELS: Record<OddsViewId, string> = {
  next_score: "Next score",
  ou_25: "O/U 2.5",
  match_1x2: "Match 1X2",
  corners_ou: "Corners O/U",
  swing: "Swing",
};

export function emptyOddsViews(): Record<OddsViewId, OddsViewSeries> {
  const views = {} as Record<OddsViewId, OddsViewSeries>;
  for (const id of ODDS_VIEW_ORDER) {
    views[id] = { id, label: ODDS_VIEW_LABELS[id], available: false, points: [] };
  }
  return views;
}

export const EMPTY_SHOCK_STRIP: ShockStripState = {
  tempo: {
    series: [],
    markers: [],
    latest: null,
    source: "none",
    status: "unavailable",
    detail: "Tempo enrichment idle",
  },
  odds: {
    views: emptyOddsViews(),
    availableViews: [],
    defaultView: "next_score",
  },
  hybrid: {
    series: [],
    markers: [],
  },
};
