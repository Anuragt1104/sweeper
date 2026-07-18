/**
 * MarketTickGenerator — a deterministic, fine-grained market data stream.
 *
 * The consumer-track simulation (lib/txline/simulation.ts) models a match as a
 * function of (minute, score) and produces a clean OddsSnapshot. For a *trading*
 * product the sentinel needs something more realistic to react to: a dense tick
 * stream with micro-movement between events, sharp jumps on goals/red cards, and
 * the operational pathologies a real desk faces — **stale lines, suspensions,
 * and outlier prints from a bad operator**.
 *
 * This generator wraps the match model and adds exactly those, all seeded by
 * (fixtureId, config.seed) so a run is perfectly reproducible — the foundation
 * of replay mode. Every tick exposes both the *observed* odds (what hits the
 * wire, with noise + anomalies) and the model *fair* odds (the clean reference),
 * so the replay lab can score detection against ground truth.
 *
 * IMPORTANT: the `anomaly` field is ground-truth for the replay lab only. The
 * Sentinel never reads it — it must *detect* anomalies from observed data alone,
 * exactly as it would on a live TxLINE feed.
 */
import { MATCH_MINUTES, MatchSimulation } from "@/lib/txline/simulation";
import {
  GamePhase,
  isLivePhase,
  type Fixture,
  type MatchEvent,
  type OddsMarket,
  type OddsSnapshot,
  type ScoreSnapshot,
} from "@/lib/txline/types";
import { hashStringToSeed, makeRng, type Rng } from "@/lib/util/rng";
import type { EngineConfig } from "@/lib/engine/config";
import { TempoSynthesizer } from "@/lib/tempo/sim";
import type { TempoSnapshot } from "@/lib/tempo/types";
import type { PricingProvenance } from "@/lib/pricing/types";

export type AnomalyKind = "stale" | "suspend" | "outlier";

/** A forced anomaly the replay lab can inject at a specific match minute. */
export interface ScenarioEvent {
  kind: AnomalyKind;
  atMinute: number;
  /** For stale/suspend: how long it lasts (match-minutes). Default 4. */
  durationMinutes?: number;
  /** For outlier: which market to corrupt. Default match_result. */
  marketType?: OddsMarket["type"];
}

interface AnomalyWindow {
  kind: AnomalyKind;
  startTick: number;
  endTick: number; // inclusive
  marketType?: OddsMarket["type"];
  /** seeded magnitude/direction for outliers */
  mag: number;
}

/** One fully-resolved market data tick. */
export interface MarketTick {
  fixtureId: string;
  /** monotonic tick index (also the ledger sequence anchor). */
  seq: number;
  /** simulated server timestamp (ms). */
  tsMs: number;
  /** match minute (fractional). */
  minute: number;
  phase: GamePhase;
  score: ScoreSnapshot;
  /** true when the book is suspended (prices withdrawn). */
  suspended: boolean;
  /** observed odds on the wire (micro-noise + anomalies applied). */
  odds: OddsSnapshot;
  /** Reference probabilities and their explicit provenance. */
  reference: OddsSnapshot;
  pricing: PricingProvenance;
  /** discrete match events since the previous tick. */
  events: MatchEvent[];
  /** ground-truth injected anomaly, if any (replay lab only; sentinel ignores). */
  anomaly?: AnomalyKind;
  /** Original TxLINE cursors remain visible when local ticks interleave streams. */
  upstream?: {
    scoreSeq: number;
    scoreTsMs: number;
    oddsTsMs: number;
    oddsMessageId?: string;
    scoreEventId?: string;
    oddsEventId?: string;
    heartbeat?: boolean;
  };
  /** Optional enrichment — shots / SOT. Never used for Horizon settlement. */
  tempo?: TempoSnapshot;
}

const OVERROUND = 1.05;

export class MarketTickGenerator {
  readonly fixture: Fixture;
  readonly config: EngineConfig;
  readonly totalTicks: number;
  private sim: MatchSimulation;
  private tempo: TempoSynthesizer;
  private windows: AnomalyWindow[] = [];
  private baseTs: number;

  constructor(fixture: Fixture, config: EngineConfig, scenario: ScenarioEvent[] = []) {
    this.fixture = fixture;
    this.config = config;
    this.sim = new MatchSimulation(fixture);
    this.tempo = new TempoSynthesizer(fixture, this.sim.eventsBetween(-1, MATCH_MINUTES, new Date(0).toISOString()));
    this.totalTicks = Math.floor(MATCH_MINUTES / config.tickMinutes) + 1;
    // Anchor server time to the fixture so timestamps are stable across runs.
    this.baseTs = 1_750_000_000_000 + (hashStringToSeed(fixture.id) % 100_000) * 1000;
    this.planAnomalies(scenario);
  }

  private tickOf(minute: number): number {
    return Math.max(0, Math.min(this.totalTicks - 1, Math.round(minute / this.config.tickMinutes)));
  }

  /** Deterministically lay out anomaly windows + merge any forced scenario events. */
  private planAnomalies(scenario: ScenarioEvent[]) {
    const r = makeRng(hashStringToSeed(this.fixture.id + ":anom") ^ (this.config.seed * 2654435761));
    const a = this.config.anomaly;
    const windows: AnomalyWindow[] = [];

    const placeWindow = (kind: AnomalyKind, durMin: number) => {
      const startMin = r.int(8, MATCH_MINUTES - Math.ceil(durMin) - 2);
      const startTick = this.tickOf(startMin);
      const endTick = Math.min(this.totalTicks - 1, this.tickOf(startMin + durMin));
      windows.push({ kind, startTick, endTick, mag: r.next() });
    };

    // Poisson-ish counts from the configured rates (deterministic rounding).
    const count = (rate: number) => Math.max(0, Math.round(rate + (r.next() - 0.5)));
    for (let i = 0; i < count(a.staleRate); i++) placeWindow("stale", 3 + r.int(0, 3));
    for (let i = 0; i < count(a.suspendRate); i++) placeWindow("suspend", 2 + r.int(0, 2));
    for (let i = 0; i < count(a.outlierRate); i++) {
      const t = this.tickOf(r.int(8, MATCH_MINUTES - 4));
      windows.push({ kind: "outlier", startTick: t, endTick: t, mag: r.next() });
    }

    // Forced scenario windows (replay lab) take precedence and are appended.
    for (const s of scenario) {
      const dur = s.durationMinutes ?? 4;
      const startTick = this.tickOf(s.atMinute);
      const endTick = s.kind === "outlier" ? startTick : Math.min(this.totalTicks - 1, this.tickOf(s.atMinute + dur));
      windows.push({ kind: s.kind, startTick, endTick, marketType: s.marketType, mag: r.next() });
    }

    this.windows = windows.sort((x, y) => x.startTick - y.startTick);
  }

  private windowAt(tick: number, kind: AnomalyKind): AnomalyWindow | undefined {
    return this.windows.find((w) => w.kind === kind && tick >= w.startTick && tick <= w.endTick);
  }

  private minuteOf(tick: number): number {
    return Math.min(MATCH_MINUTES, tick * this.config.tickMinutes);
  }

  /** Clean model fair odds at a tick. */
  private fairAt(tick: number): OddsSnapshot {
    const minute = this.minuteOf(tick);
    const score = this.sim.scoreSnapshot(minute, tick, this.tsOf(tick));
    return this.sim.oddsSnapshot(minute, score, tick, this.tsOf(tick));
  }

  private tsOf(tick: number): string {
    return new Date(this.baseTs + tick * this.config.tickServerMs).toISOString();
  }

  /** Normal observed odds = fair + seeded per-selection micro-noise. */
  private normalObserved(tick: number): OddsSnapshot {
    const fair = this.fairAt(tick);
    const r = makeRng(hashStringToSeed(this.fixture.id + ":noise:" + tick) ^ (this.config.seed * 40503));
    const noise = this.config.anomaly.microNoise;
    return {
      ...fair,
      markets: fair.markets.map((m) => perturbMarket(m, r, noise)),
    };
  }

  /** Build the fully-resolved observed snapshot for a tick (windows applied). */
  private observedAt(tick: number): { odds: OddsSnapshot; suspended: boolean; anomaly?: AnomalyKind } {
    const stale = this.windowAt(tick, "stale");
    const suspend = this.windowAt(tick, "suspend");
    const outlier = this.windowAt(tick, "outlier");

    // STALE: freeze the last observed snapshot from just before the window.
    if (stale) {
      const frozen = this.normalObserved(Math.max(0, stale.startTick - 1));
      return {
        odds: { ...frozen, seq: tick, ts: this.tsOf(tick) },
        suspended: false,
        anomaly: "stale",
      };
    }

    // SUSPEND: prices are withdrawn — keep last value but flag suspended.
    if (suspend) {
      const last = this.normalObserved(Math.max(0, suspend.startTick - 1));
      return {
        odds: { ...last, seq: tick, ts: this.tsOf(tick) },
        suspended: true,
        anomaly: "suspend",
      };
    }

    const odds = this.normalObserved(tick);

    // OUTLIER: corrupt one selection of the targeted market for a single tick.
    if (outlier) {
      const targetType = outlier.marketType ?? "match_result";
      const markets = odds.markets.map((m) => {
        if (m.type !== targetType) return m;
        return corruptMarket(m, outlier.mag, this.config.sentinel.outlierBand);
      });
      return { odds: { ...odds, markets }, suspended: false, anomaly: "outlier" };
    }

    return { odds, suspended: false };
  }

  /** Random-access tick — pure in (tick), so replay scrubbing is exact. */
  at(tick: number): MarketTick {
    const clamped = Math.max(0, Math.min(this.totalTicks - 1, tick));
    const minute = this.minuteOf(clamped);
    const phase = phaseAt(minute);
    const score = this.sim.scoreSnapshot(minute, clamped, this.tsOf(clamped));
    const fair = this.fairAt(clamped);
    const { odds, suspended, anomaly } = this.observedAt(clamped);

    // attach prevPrice (for UI movement arrows) from the previous observed tick
    const prev = clamped > 0 ? this.observedAt(clamped - 1).odds : odds;
    withPrev(odds, prev);

    const afterMin = clamped > 0 ? this.minuteOf(clamped - 1) : -1;
    const events = this.sim.eventsBetween(afterMin, minute, this.tsOf(clamped));

    const tsMs = this.baseTs + clamped * this.config.tickServerMs;
    return {
      fixtureId: this.fixture.id,
      seq: clamped,
      tsMs,
      minute,
      phase,
      score,
      suspended,
      odds,
      reference: fair,
      pricing: {
        source: "simulation_model",
        sampleCount: clamped + 1,
        ready: true,
        standDownReason: null,
        updatedAtMs: this.baseTs + clamped * this.config.tickServerMs,
      },
      events,
      anomaly,
      tempo: this.tempo.snapshot(minute, tsMs),
    };
  }

  /** Iterate every tick once (the autonomous run). */
  *stream(): Generator<MarketTick> {
    for (let i = 0; i < this.totalTicks; i++) yield this.at(i);
  }

  /** All planned anomaly windows (replay-lab ground truth). */
  plannedWindows(): { kind: AnomalyKind; startMinute: number; endMinute: number }[] {
    return this.windows.map((w) => ({
      kind: w.kind,
      startMinute: round1(w.startTick * this.config.tickMinutes),
      endMinute: round1(w.endTick * this.config.tickMinutes),
    }));
  }
}

// ── pure helpers ─────────────────────────────────────────────────────────────

function phaseAt(minute: number): GamePhase {
  if (minute <= 0) return GamePhase.PreMatch;
  if (minute < 45) return GamePhase.FirstHalf;
  if (minute === 45) return GamePhase.HalfTime;
  if (minute < MATCH_MINUTES) return GamePhase.SecondHalf;
  return GamePhase.FullTime;
}

function priceFor(prob: number): number {
  return round2(OVERROUND / clamp(prob, 0.01, 0.99));
}

/** Apply seeded micro-noise to a market's selections and renormalize probs. */
function perturbMarket(m: OddsMarket, r: Rng, noise: number): OddsMarket {
  const raw = m.selections.map((s) => clamp(s.impliedProb + (r.next() * 2 - 1) * noise, 0.005, 0.995));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return {
    ...m,
    selections: m.selections.map((s, i) => {
      const prob = raw[i] / sum;
      return { ...s, impliedProb: prob, price: priceFor(prob), prevPrice: s.price };
    }),
  };
}

/** Corrupt the strongest selection of a market into a single bad outlier print. */
function corruptMarket(m: OddsMarket, mag: number, band: number): OddsMarket {
  if (m.selections.length === 0) return m;
  // pick the favourite (highest prob) and shove it the "wrong" way
  let idx = 0;
  for (let i = 1; i < m.selections.length; i++) {
    if (m.selections[i].impliedProb > m.selections[idx].impliedProb) idx = i;
  }
  const dir = mag > 0.5 ? 1 : -1;
  const shift = band * (2 + mag * 2) * dir;
  const raw = m.selections.map((s, i) =>
    clamp(s.impliedProb + (i === idx ? shift : 0), 0.005, 0.995),
  );
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return {
    ...m,
    selections: m.selections.map((s, i) => {
      const prob = raw[i] / sum;
      return { ...s, impliedProb: prob, price: priceFor(prob) };
    }),
  };
}

/** Write prevPrice onto `cur` from matching selections in `prev`. */
function withPrev(cur: OddsSnapshot, prev: OddsSnapshot) {
  for (const m of cur.markets) {
    const pm = prev.markets.find((x) => x.type === m.type);
    if (!pm) continue;
    for (const s of m.selections) {
      const ps = pm.selections.find((x) => x.key === s.key);
      if (ps) s.prevPrice = ps.price;
    }
  }
}

export { isLivePhase };

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
function round2(x: number) {
  return Math.round(x * 100) / 100;
}
function round1(x: number) {
  return Math.round(x * 10) / 10;
}
