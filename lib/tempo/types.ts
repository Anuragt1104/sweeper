/**
 * Dual-track Shock Strip types.
 *
 * Material track = TxLINE-verifiable shocks (goals/cards/corners/odds/horizon).
 * Tempo track = enrichment only (shots / shots on target). Never collapses Horizon.
 */

export type ShockTrack = "material" | "tempo";

export type MaterialKind =
  | "goal"
  | "yellow"
  | "red"
  | "corner"
  | "odds_swing"
  | "horizon_collapse"
  | "kickoff"
  | "half-time"
  | "full-time";

export type TempoKind = "shot" | "shot_on_target";

export type TempoSource = "sim" | "api-football" | "none";

export interface TempoCounts {
  shots: { home: number; away: number };
  sot: { home: number; away: number };
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
  kind: MaterialKind | TempoKind | string;
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
}

export interface ShockStripState {
  material: ShockSpike[];
  tempo: {
    series: TempoSeriesPoint[];
    markers: ShockSpike[];
    latest: TempoCounts | null;
    source: TempoSource;
    status: "ready" | "polling" | "unavailable" | "error";
    detail: string;
  };
}

export const EMPTY_SHOCK_STRIP: ShockStripState = {
  material: [],
  tempo: {
    series: [],
    markers: [],
    latest: null,
    source: "none",
    status: "unavailable",
    detail: "Tempo enrichment idle",
  },
};
