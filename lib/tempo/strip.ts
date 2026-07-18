/**
 * Assembles the dual-track Shock Strip from material ticks + tempo enrichment.
 * Horizon never reads this — UI / operator context only.
 */
import type { MatchEvent } from "@/lib/txline/types";
import type { MarketTick } from "@/lib/market/ticks";
import type { HorizonCollapse, OddsSwing } from "@/lib/horizon/machine";
import { materialSeverity, tempoSeverity } from "@/lib/tempo/severity";
import { diffTempo } from "@/lib/tempo/diff";
import type {
  MaterialKind,
  ShockSpike,
  ShockStripState,
  TempoCounts,
  TempoSnapshot,
  TempoSource,
} from "@/lib/tempo/types";
import { EMPTY_SHOCK_STRIP } from "@/lib/tempo/types";

const MATERIAL_KINDS = new Set<string>([
  "goal",
  "yellow",
  "red",
  "corner",
  "kickoff",
  "half-time",
  "full-time",
]);

export class ShockStripAssembler {
  private material: ShockSpike[] = [];
  private tempoMarkers: ShockSpike[] = [];
  private series: ShockStripState["tempo"]["series"] = [];
  private lastTempoCounts: TempoCounts | null = null;
  private lastOddsSwingActive = false;
  private lastCollapseId: string | null = null;
  private source: TempoSource = "none";
  private status: ShockStripState["tempo"]["status"] = "unavailable";
  private detail = "Tempo enrichment idle";
  private spikeSeq = 0;

  ingestTick(tick: MarketTick, opts?: { oddsSwing?: OddsSwing; lastCollapse?: HorizonCollapse | null }): void {
    for (const event of tick.events) {
      this.pushMaterialFromEvent(event);
    }

    if (opts?.oddsSwing?.active && !this.lastOddsSwingActive) {
      this.material.push({
        id: `odds-${++this.spikeSeq}`,
        minute: tick.minute,
        severity: materialSeverity("odds_swing", tick.minute, { oddsDelta: opts.oddsSwing.delta }),
        track: "material",
        kind: "odds_swing",
        label: `Odds swing ${opts.oddsSwing.favorite ?? "?"} ${(opts.oddsSwing.delta * 100).toFixed(1)}%`,
        source: "txline",
      });
    }
    this.lastOddsSwingActive = Boolean(opts?.oddsSwing?.active);

    const collapse = opts?.lastCollapse;
    if (collapse && collapse.id !== this.lastCollapseId) {
      this.lastCollapseId = collapse.id;
      this.material.push({
        id: `hz-${collapse.id}`,
        minute: collapse.minute,
        severity: materialSeverity("horizon_collapse", collapse.minute, {
          surprise: collapse.surprise,
          thesisDead: collapse.thesisDead,
        }),
        track: "material",
        kind: "horizon_collapse",
        label: collapse.surprise
          ? `Horizon SURPRISE → ${collapse.winner}`
          : `Horizon collapse → ${collapse.winner}`,
        source: "horizon",
      });
    }

    if (tick.tempo) this.applyTempo(tick.tempo);
  }

  applyTempo(snapshot: TempoSnapshot): void {
    this.source = snapshot.source;
    this.status = "ready";
    this.detail =
      snapshot.source === "sim"
        ? "Simulated shots / shots on target"
        : "API-Football tempo enrichment (non-settlement)";

    const events = diffTempo(this.lastTempoCounts, snapshot);
    this.lastTempoCounts = snapshot.counts;

    const lastSeries = this.series[this.series.length - 1];
    if (!lastSeries || lastSeries.minute !== snapshot.minute) {
      this.series.push({
        minute: snapshot.minute,
        shotsHome: snapshot.counts.shots.home,
        shotsAway: snapshot.counts.shots.away,
        sotHome: snapshot.counts.sot.home,
        sotAway: snapshot.counts.sot.away,
      });
    } else {
      lastSeries.shotsHome = snapshot.counts.shots.home;
      lastSeries.shotsAway = snapshot.counts.shots.away;
      lastSeries.sotHome = snapshot.counts.sot.home;
      lastSeries.sotAway = snapshot.counts.sot.away;
    }

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

    // Bound history for SSE payload size
    if (this.series.length > 200) this.series = this.series.slice(-200);
    if (this.tempoMarkers.length > 120) this.tempoMarkers = this.tempoMarkers.slice(-120);
    if (this.material.length > 120) this.material = this.material.slice(-120);
  }

  setTempoStatus(status: ShockStripState["tempo"]["status"], detail: string, source: TempoSource = this.source): void {
    this.status = status;
    this.detail = detail;
    this.source = source;
  }

  getState(): ShockStripState {
    return {
      material: [...this.material],
      tempo: {
        series: [...this.series],
        markers: [...this.tempoMarkers],
        latest: this.lastTempoCounts,
        source: this.source,
        status: this.status,
        detail: this.detail,
      },
    };
  }

  private pushMaterialFromEvent(event: MatchEvent): void {
    if (!MATERIAL_KINDS.has(event.kind)) return;
    const kind = event.kind as MaterialKind;
    this.material.push({
      id: `mat-${event.seq}-${++this.spikeSeq}`,
      minute: event.minute,
      severity: materialSeverity(kind, event.minute),
      track: "material",
      kind,
      label: event.label,
      side: event.side,
      source: "txline",
    });
  }
}

export { EMPTY_SHOCK_STRIP };
