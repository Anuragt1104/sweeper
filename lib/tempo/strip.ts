/**
 * Assembles Tempo · Odds · Hybrid Shock Strip state.
 * Horizon never reads this — UI / operator context only.
 */
import type { MatchEvent } from "@/lib/txline/types";
import type { MarketTick } from "@/lib/market/ticks";
import type { HorizonCollapse, HorizonPublication, OddsSwing } from "@/lib/horizon/machine";
import {
  hybridCollapseSeverity,
  materialSeverity,
  oddsSwingSeverity,
  tempoSeverity,
} from "@/lib/tempo/severity";
import { diffTempo } from "@/lib/tempo/diff";
import {
  blendPressure,
  HYBRID_BLEND,
  oddsVelocityFromDelta,
  tempoIntensityFromSeverities,
} from "@/lib/tempo/hybrid";
import {
  extractOddsViews,
  mergeViewPoint,
  shortTermFavorite,
  type ShortTermFavorite,
} from "@/lib/tempo/odds-views";
import type {
  OddsViewId,
  ShockSpike,
  ShockStripState,
  TempoCounts,
  TempoMarkerKind,
  TempoSnapshot,
  TempoSource,
} from "@/lib/tempo/types";
import { EMPTY_SHOCK_STRIP, emptyOddsViews, ODDS_VIEW_ORDER } from "@/lib/tempo/types";

const TEMPO_TXLINE_KINDS = new Set<string>([
  "goal",
  "yellow",
  "red",
  "corner",
  "kickoff",
  "half-time",
  "full-time",
]);

export interface ShockStripIngestOpts {
  oddsSwing?: OddsSwing;
  lastCollapse?: HorizonCollapse | null;
  horizon?: HorizonPublication | null;
}

export class ShockStripAssembler {
  private tempoMarkers: ShockSpike[] = [];
  private series: ShockStripState["tempo"]["series"] = [];
  private lastTempoCounts: TempoCounts | null = null;
  private oddsViews = emptyOddsViews();
  private availableViews: OddsViewId[] = [];
  private hybridSeries: ShockStripState["hybrid"]["series"] = [];
  private hybridMarkers: ShockSpike[] = [];
  private lastOddsSwingActive = false;
  private lastCollapseId: string | null = null;
  private favoriteHistory: { minute: number; prob: number }[] = [];
  private lastFavorite: ShortTermFavorite | null = null;
  private source: TempoSource = "none";
  private status: ShockStripState["tempo"]["status"] = "unavailable";
  private detail = "Tempo enrichment idle";
  private spikeSeq = 0;

  ingestTick(tick: MarketTick, opts?: ShockStripIngestOpts): void {
    for (const event of tick.events) {
      this.pushTempoFromEvent(event);
    }

    this.recordOddsViews(tick);

    if (opts?.oddsSwing?.active && !this.lastOddsSwingActive) {
      const swing = this.oddsViews.swing;
      const point = swing.points[swing.points.length - 1];
      if (point) {
        point.delta = opts.oddsSwing.delta;
        point.favorite = opts.oddsSwing.favorite;
        point.favoriteProb = opts.oddsSwing.toProbability;
      }
      // Annotate severity for UI heat via swing view metadata (no fourth track).
      void oddsSwingSeverity(tick.minute, opts.oddsSwing.delta);
    }
    this.lastOddsSwingActive = Boolean(opts?.oddsSwing?.active);

    const collapse = opts?.lastCollapse;
    if (collapse && collapse.id !== this.lastCollapseId) {
      this.lastCollapseId = collapse.id;
      this.hybridMarkers.push({
        id: `hz-${collapse.id}`,
        minute: collapse.minute,
        severity: hybridCollapseSeverity(collapse.minute, {
          surprise: collapse.surprise,
          thesisDead: collapse.thesisDead,
        }),
        track: "hybrid",
        kind: "horizon_collapse",
        label: collapse.surprise
          ? `Horizon SURPRISE → ${collapse.winner}`
          : `Horizon collapse → ${collapse.winner}`,
        source: "horizon",
      });
    }

    this.recordHybrid(tick.minute, opts?.horizon ?? null);

    this.pushScoreSeries(tick);

    if (tick.tempo) this.applyTempo(tick.tempo);

    this.boundHistory();
  }

  applyTempo(snapshot: TempoSnapshot): void {
    this.source = snapshot.source;
    this.status = "ready";
    this.detail =
      snapshot.source === "sim"
        ? "Simulated tempo enrichment (shots, fouls, attacks…)"
        : "API-Football tempo enrichment (non-settlement)";

    const events = diffTempo(this.lastTempoCounts, snapshot);
    this.lastTempoCounts = snapshot.counts;

    this.upsertSeriesPoint(snapshot.minute, {
      shotsHome: snapshot.counts.shots.home,
      shotsAway: snapshot.counts.shots.away,
      sotHome: snapshot.counts.sot.home,
      sotAway: snapshot.counts.sot.away,
      foulsHome: snapshot.counts.fouls.home,
      foulsAway: snapshot.counts.fouls.away,
      possessionHome: snapshot.counts.possession.home,
      possessionAway: snapshot.counts.possession.away,
    });

    for (const event of events) {
      this.tempoMarkers.push({
        id: `tempo-${++this.spikeSeq}`,
        minute: event.minute,
        severity: tempoSeverity(event.kind, event.minute),
        track: "tempo",
        kind: event.kind,
        label: event.label,
        side: event.side,
        source: event.source === "sim" ? "sim" : "api-football",
      });
    }

    this.boundHistory();
  }

  setTempoStatus(
    status: ShockStripState["tempo"]["status"],
    detail: string,
    source: TempoSource = this.source,
  ): void {
    this.status = status;
    this.detail = detail;
    this.source = source;
  }

  getState(): ShockStripState {
    return {
      tempo: {
        series: [...this.series],
        markers: [...this.tempoMarkers],
        latest: this.lastTempoCounts,
        source: this.source,
        status: this.status,
        detail: this.detail,
      },
      odds: {
        views: structuredClone(this.oddsViews),
        availableViews: [...this.availableViews],
        defaultView: "next_score",
      },
      hybrid: {
        series: [...this.hybridSeries],
        markers: [...this.hybridMarkers],
      },
    };
  }

  private recordOddsViews(tick: MarketTick): void {
    const extracted = extractOddsViews(
      tick.odds,
      tick.minute,
      this.lastFavorite,
      this.favoriteHistory,
    );
    this.lastFavorite = extracted.favorite;
    if (extracted.favorite.source) {
      this.favoriteHistory.push({ minute: tick.minute, prob: extracted.favorite.prob });
      if (this.favoriteHistory.length > 120) {
        this.favoriteHistory = this.favoriteHistory.slice(-120);
      }
    }

    for (const id of ODDS_VIEW_ORDER) {
      const incoming = extracted.views[id];
      if (!incoming.available || incoming.points.length === 0) {
        this.oddsViews[id] = {
          ...this.oddsViews[id],
          available: this.oddsViews[id].points.length > 0,
        };
        continue;
      }
      this.oddsViews[id] = mergeViewPoint(
        { ...this.oddsViews[id], available: true, label: incoming.label },
        incoming.points[0],
      );
    }
    this.availableViews = ODDS_VIEW_ORDER.filter((id) => this.oddsViews[id].available);
  }

  private recordHybrid(minute: number, horizon: HorizonPublication | null): void {
    const thesis = horizon?.thesis ?? null;
    const thesisProb = horizon && thesis ? horizon.probabilities[thesis] ?? 0 : 0;

    const windowStart = minute - HYBRID_BLEND.tempoWindowMinutes;
    const recent = this.tempoMarkers.filter((m) => m.minute >= windowStart && m.minute <= minute);
    const tempoIntensity = tempoIntensityFromSeverities(recent.map((m) => m.severity));

    const fav = this.lastFavorite;
    const oddsWindowStart = minute - HYBRID_BLEND.oddsWindowMinutes;
    const prior = [...this.favoriteHistory].reverse().find((p) => p.minute <= oddsWindowStart);
    const delta = fav && prior ? fav.prob - prior.prob : 0;
    const oddsVelocity = oddsVelocityFromDelta(delta);
    const pressure = blendPressure(tempoIntensity, oddsVelocity);

    const last = this.hybridSeries[this.hybridSeries.length - 1];
    const point = {
      minute,
      thesisProb,
      tempoIntensity,
      oddsVelocity,
      pressure,
      thesis,
    };
    if (last && last.minute === minute) {
      this.hybridSeries[this.hybridSeries.length - 1] = point;
    } else {
      this.hybridSeries.push(point);
    }
  }

  private pushScoreSeries(tick: MarketTick): void {
    const score = tick.score;
    this.upsertSeriesPoint(tick.minute, {
      cornersHome: score.corners.home,
      cornersAway: score.corners.away,
      cardsHome: score.yellow.home + score.red.home,
      cardsAway: score.yellow.away + score.red.away,
    });
  }

  private upsertSeriesPoint(
    minute: number,
    patch: Partial<ShockStripState["tempo"]["series"][number]>,
  ): void {
    const last = this.series[this.series.length - 1];
    if (last && last.minute === minute) {
      Object.assign(last, patch);
      return;
    }
    const base = last
      ? { ...last, minute }
      : {
          minute,
          shotsHome: 0,
          shotsAway: 0,
          sotHome: 0,
          sotAway: 0,
          cornersHome: 0,
          cornersAway: 0,
          cardsHome: 0,
          cardsAway: 0,
          foulsHome: 0,
          foulsAway: 0,
          possessionHome: 50,
          possessionAway: 50,
        };
    this.series.push({ ...base, ...patch, minute });
  }

  private pushTempoFromEvent(event: MatchEvent): void {
    if (!TEMPO_TXLINE_KINDS.has(event.kind)) return;
    const kind = event.kind as TempoMarkerKind;
    this.tempoMarkers.push({
      id: `mat-${event.seq}-${++this.spikeSeq}`,
      minute: event.minute,
      severity: materialSeverity(kind, event.minute),
      track: "tempo",
      kind,
      label: event.label,
      side: event.side,
      source: "txline",
    });
  }

  private boundHistory(): void {
    if (this.series.length > 200) this.series = this.series.slice(-200);
    if (this.tempoMarkers.length > 160) this.tempoMarkers = this.tempoMarkers.slice(-160);
    if (this.hybridMarkers.length > 80) this.hybridMarkers = this.hybridMarkers.slice(-80);
    if (this.hybridSeries.length > 200) this.hybridSeries = this.hybridSeries.slice(-200);
    for (const id of ODDS_VIEW_ORDER) {
      if (this.oddsViews[id].points.length > 200) {
        this.oddsViews[id].points = this.oddsViews[id].points.slice(-200);
      }
    }
  }
}

export { EMPTY_SHOCK_STRIP, shortTermFavorite };
