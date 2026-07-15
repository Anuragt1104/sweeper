/**
 * Sentinel — the autonomous market-quality engine.
 *
 * One instance watches one fixture. Every tick it:
 *   1. updates rolling features from the observed odds,
 *   2. runs the detectors (sharp move / outlier / stale / suspend / reopen),
 *   3. applies rising-edge dedup so a 4-minute stale window is one signal, not
 *      forty, and a catch-up move right after a stale window isn't mislabeled a
 *      bad print,
 *   4. maintains a 0..100 market-quality score the trading agents consult.
 *
 * It reads only data observable on a live wire (prices, timestamps, suspension
 * state) — never the generator's ground-truth `anomaly` field — so the exact
 * same engine runs on a live TxLINE feed.
 */
import type { MarketTick } from "@/lib/market/ticks";
import { FeatureTracker, type SelectionFeatures } from "@/lib/market/features";
import type { EngineConfig } from "@/lib/engine/config";
import { detectMoves, detectStale, type RawDetection } from "@/lib/sentinel/detectors";
import type { OddsMarketType } from "@/lib/txline/types";
import type { Severity, Signal, SignalKind, SentinelAssessment } from "@/lib/sentinel/types";

export interface SentinelTickResult {
  assessment: SentinelAssessment;
  features: Map<string, SelectionFeatures>;
}

export class Sentinel {
  readonly fixtureId: string;
  private cfg: EngineConfig;
  private tracker: FeatureTracker;
  private staleMarketFlags = new Set<string>();
  private staleSel = new Set<string>();
  private wasSuspended = false;
  private lastBigEventTick = -999;
  private outlierPenalty = 0;
  private quality = 100;

  constructor(fixtureId: string, cfg: EngineConfig) {
    this.fixtureId = fixtureId;
    this.cfg = cfg;
    this.tracker = new FeatureTracker(cfg.sentinel);
  }

  currentQuality(): number {
    return this.quality;
  }

  process(tick: MarketTick): SentinelTickResult {
    const th = this.cfg.sentinel;
    const features = this.tracker.update(tick);
    const signals: Signal[] = [];

    // ── big-event tracking (for sharp/outlier corroboration) ──────────────────
    if (tick.events.some((e) => e.kind === "goal" || e.kind === "red")) {
      this.lastBigEventTick = tick.seq;
    }
    const ticksSinceBig = tick.seq - this.lastBigEventTick;

    // ── suspension edges ──────────────────────────────────────────────────────
    if (tick.suspended && !this.wasSuspended) {
      signals.push(this.mk(tick, "suspended", "critical", 0.99, "SUSPEND_QUOTING", "Book suspended — prices withdrawn", {}));
      this.wasSuspended = true;
    } else if (!tick.suspended && this.wasSuspended) {
      signals.push(this.mk(tick, "reopened", "info", 0.9, "RESUME_QUOTING", "Book reopened — prices live again", {}));
      this.wasSuspended = false;
    }

    // ── stale lines (rising edge, deduped per market) ─────────────────────────
    const prevStaleSel = new Set(this.staleSel);
    const staleNow = detectStale(tick, features, th);
    const staleSelIds = new Set(staleNow.map((d) => d.selId));
    const staleMarketsNow = new Set(staleNow.map((d) => d.marketType));
    for (const d of staleNow) {
      if (!this.staleMarketFlags.has(d.marketType)) {
        this.staleMarketFlags.add(d.marketType);
        signals.push(
          this.fromRaw(tick, {
            ...d,
            message: `Stale market: ${d.marketType} frozen ${Math.round((d.evidence.msSinceChange ?? 0) / 1000)}s while live`,
          }),
        );
      }
    }
    for (const m of [...this.staleMarketFlags]) {
      if (!staleMarketsNow.has(m)) this.staleMarketFlags.delete(m);
    }
    this.staleSel = staleSelIds;
    // selections that just caught up after being stale (suppress move re-fire)
    const refreshed = new Set<string>();
    for (const id of prevStaleSel) if (!staleSelIds.has(id)) refreshed.add(id);

    // ── sharp moves / outliers (skip lines that just caught up from stale) ─────
    if (!tick.suspended) {
      const moves = detectMoves(tick, features, th, ticksSinceBig);
      for (const d of moves) {
        if (refreshed.has(d.selId)) continue; // catch-up after stale ≠ a new anomaly
        signals.push(this.fromRaw(tick, d));
        if (d.kind === "outlier_print") this.outlierPenalty = Math.min(40, this.outlierPenalty + 24);
      }
    }

    // ── market-quality score ──────────────────────────────────────────────────
    const staleCount = this.staleMarketFlags.size;
    const criticalSharp = signals.filter((s) => s.kind === "sharp_move" && s.severity === "critical").length;
    this.quality = clamp(
      100 - 16 * staleCount - (tick.suspended ? 30 : 0) - this.outlierPenalty - 4 * criticalSharp,
      0,
      100,
    );
    this.outlierPenalty *= 0.85;

    const suspendedMarkets: OddsMarketType[] = tick.suspended ? tick.odds.markets.map((m) => m.type) : [];

    return {
      assessment: {
        seq: tick.seq,
        tsMs: tick.tsMs,
        signals,
        quality: Math.round(this.quality),
        suspendedMarkets,
        staleSelections: [...this.staleSel],
      },
      features,
    };
  }

  private fromRaw(tick: MarketTick, d: RawDetection): Signal {
    return {
      id: `${d.kind}:${tick.seq}:${d.selId}`,
      seq: tick.seq,
      tsMs: tick.tsMs,
      fixtureId: this.fixtureId,
      kind: d.kind,
      severity: d.severity,
      confidence: round2(d.confidence),
      action: d.action,
      message: d.message,
      marketType: d.marketType as OddsMarketType,
      selectionKey: d.selectionKey,
      selId: d.selId,
      evidence: d.evidence,
    };
  }

  private mk(
    tick: MarketTick,
    kind: SignalKind,
    severity: Severity,
    confidence: number,
    action: Signal["action"],
    message: string,
    evidence: Signal["evidence"],
  ): Signal {
    return {
      id: `${kind}:${tick.seq}`,
      seq: tick.seq,
      tsMs: tick.tsMs,
      fixtureId: this.fixtureId,
      kind,
      severity,
      confidence,
      action,
      message,
      evidence,
    };
  }
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
function round2(x: number) {
  return Math.round(x * 100) / 100;
}
