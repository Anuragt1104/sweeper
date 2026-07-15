import { SIMULATION_BOOTSTRAP } from "@/lib/horizon/bootstrap";
import {
  HORIZON_OUTCOMES,
  lockBadges,
  lookupProbabilities,
  type FrequencyArtifact,
  type HorizonOutcome,
  type HorizonProbabilities,
  type ProbabilityFallback,
  type ProbabilitySource,
} from "@/lib/horizon/probability";
import type { MarketTick } from "@/lib/market/ticks";
import type { MatchEvent } from "@/lib/txline/types";

export interface HorizonPublication {
  id: string;
  fixtureId: string;
  openedMinute: number;
  closesMinute: number;
  openedAtMs: number;
  lastRefreshAtMs: number;
  refreshNumber: number;
  probabilities: HorizonProbabilities;
  thesis: HorizonOutcome;
  action: Exclude<HorizonOutcome, "quiet">;
  support: number;
  bucket: string;
  fallback: ProbabilityFallback;
  lowData: boolean;
  source: ProbabilitySource;
  provenance: string;
}

export interface HorizonCollapse {
  id: string;
  fixtureId: string;
  horizonId: string;
  winner: HorizonOutcome;
  minute: number;
  tsMs: number;
  triggerSeq: number;
  settlingProbability: number;
  thesis: HorizonOutcome;
  action: Exclude<HorizonOutcome, "quiet">;
  surprise: boolean;
  thesisDead: boolean;
  brierScore: number;
  latencyMs: number;
  settledSnapshot: HorizonPublication;
}

export interface OddsSwing {
  active: boolean;
  favorite: "home" | "away" | null;
  fromProbability: number;
  toProbability: number;
  delta: number;
  windowSeconds: number;
  reason: "movement" | "goal_in_lookback" | "insufficient_history" | "below_threshold" | "missing_1x2";
}

export interface HorizonMetrics {
  horizonsOpened: number;
  horizonsSettled: number;
  thesisHitRate: number;
  actionHitRate: number;
  surprises: number;
  thesisDeadCount: number;
  meanBrierScore: number;
  liveCollapseLatencyMs: number;
}

export interface HorizonState {
  ready: boolean;
  current: HorizonPublication | null;
  lastCollapse: HorizonCollapse | null;
  collapseTicker: HorizonCollapse[];
  oddsSwing: OddsSwing;
  metrics: HorizonMetrics;
  updatedAtMs: number;
  missingRequiredMarket: boolean;
}

export interface HorizonContext {
  tickHash?: string;
  /** Wall-clock processing time; separate from upstream event time for latency. */
  processedAtMs?: number;
}

export interface HorizonProofRecord {
  kind: "horizon_open" | "horizon_refresh" | "horizon_collapse";
  tick: number;
  tsMs: number;
  summary: string;
  payload: unknown;
  reactedToHash?: string;
}

type RecordSink = (record: HorizonProofRecord) => void;

const HORIZON_MINUTES = 10;
const REFRESH_MS = 30_000;
const SWING_LOOKBACK_MS = 180_000;
const SWING_THRESHOLD = 0.08;

interface OddsPoint {
  tsMs: number;
  home: number;
  away: number;
}

/**
 * Deep Horizon module. Transport, React, agents, and proof storage only see its
 * compact `processTick` interface and serializable state.
 */
export class HorizonMachine {
  private current: HorizonPublication | null = null;
  private lastCollapse: HorizonCollapse | null = null;
  private ticker: HorizonCollapse[] = [];
  private oddsHistory: OddsPoint[] = [];
  private goalTimes: number[] = [];
  private oddsSwing: OddsSwing = emptySwing("missing_1x2");
  private opened = 0;
  private settled = 0;
  private thesisHits = 0;
  private actionHits = 0;
  private surprises = 0;
  private thesisDead = 0;
  private brierTotal = 0;
  private lastLatency = 0;
  private updatedAtMs = 0;

  constructor(
    private readonly artifact: FrequencyArtifact = SIMULATION_BOOTSTRAP,
    private readonly record: RecordSink = () => undefined,
  ) {}

  processTick(tick: MarketTick, context: HorizonContext = {}): HorizonState {
    const processedAtMs = context.processedAtMs ?? tick.tsMs;
    this.updatedAtMs = processedAtMs;
    this.updateOddsSwing(tick);

    if (!this.current) this.open(tick, tick.minute, context);

    const material = tick.events
      .filter(isMaterial)
      .slice()
      .sort((a, b) => a.seq - b.seq || a.minute - b.minute);

    for (const event of material) {
      if (!this.current) break;
      while (this.current && event.minute > this.current.closesMinute) {
        this.collapse("quiet", this.current.closesMinute, tick, context, processedAtMs);
        this.open(tick, this.lastCollapse!.minute, context);
      }
      if (this.current && event.minute >= this.current.openedMinute && event.minute <= this.current.closesMinute) {
        this.collapse(eventOutcome(event), event.minute, tick, context, processedAtMs, event.seq);
        this.open(tick, event.minute, context);
        // One upstream tick can contain several cumulative deltas. The active
        // Horizon collapses on the first sequence-ordered event only; later
        // deltas must not instantly collapse the freshly opened publication.
        break;
      }
    }

    while (this.current && tick.minute >= this.current.closesMinute) {
      this.collapse("quiet", this.current.closesMinute, tick, context, processedAtMs);
      this.open(tick, this.lastCollapse!.minute, context);
    }

    if (this.current && processedAtMs - this.current.lastRefreshAtMs >= REFRESH_MS) {
      this.refresh(tick, context);
    }

    return this.snapshot(tick);
  }

  getState(): HorizonState {
    return this.snapshot();
  }

  private open(tick: MarketTick, minute: number, context: HorizonContext) {
    const lookup = lookupProbabilities(this.artifact, features(tick, minute));
    const badges = lockBadges(lookup.probabilities);
    this.opened += 1;
    this.current = {
      id: `${tick.fixtureId}:${tick.seq}:${this.opened}`,
      fixtureId: tick.fixtureId,
      openedMinute: round2(minute),
      closesMinute: round2(minute + HORIZON_MINUTES),
      openedAtMs: tick.tsMs,
      lastRefreshAtMs: tick.tsMs,
      refreshNumber: 0,
      probabilities: lookup.probabilities,
      thesis: badges.thesis,
      action: badges.action,
      support: lookup.support,
      bucket: lookup.bucket,
      fallback: lookup.fallback,
      lowData: lookup.lowData,
      source: lookup.source,
      provenance: lookup.provenance,
    };
    this.record({
      kind: "horizon_open",
      tick: tick.seq,
      tsMs: tick.tsMs,
      summary: `Horizon opened ${this.current.openedMinute}′–${this.current.closesMinute}′`,
      payload: this.current,
      reactedToHash: context.tickHash,
    });
  }

  private refresh(tick: MarketTick, context: HorizonContext) {
    const previous = this.current!;
    const lookup = lookupProbabilities(this.artifact, features(tick, tick.minute));
    const badges = lockBadges(lookup.probabilities, { thesis: previous.thesis, action: previous.action });
    this.current = {
      ...previous,
      lastRefreshAtMs: tick.tsMs,
      refreshNumber: previous.refreshNumber + 1,
      probabilities: lookup.probabilities,
      thesis: badges.thesis,
      action: badges.action,
      support: lookup.support,
      bucket: lookup.bucket,
      fallback: lookup.fallback,
      lowData: lookup.lowData,
      source: lookup.source,
      provenance: lookup.provenance,
    };
    this.record({
      kind: "horizon_refresh",
      tick: tick.seq,
      tsMs: tick.tsMs,
      summary: `Horizon soft refresh #${this.current.refreshNumber}`,
      payload: this.current,
      reactedToHash: context.tickHash,
    });
  }

  private collapse(
    winner: HorizonOutcome,
    minute: number,
    tick: MarketTick,
    context: HorizonContext,
    processedAtMs: number,
    eventSeq = tick.seq,
  ) {
    const settledSnapshot = structuredClone(this.current!);
    const probability = settledSnapshot.probabilities[winner];
    const surprise = probability < 0.15;
    const thesisDead = !surprise && winner !== settledSnapshot.thesis;
    const brierScore = HORIZON_OUTCOMES.reduce((sum, outcome) => {
      const actual = outcome === winner ? 1 : 0;
      return sum + Math.pow(settledSnapshot.probabilities[outcome] - actual, 2);
    }, 0);
    const eventTs = materialEventTimestamp(tick, eventSeq) ?? tick.tsMs;
    const latencyMs = Math.max(0, processedAtMs - eventTs);
    const collapse: HorizonCollapse = {
      id: `${settledSnapshot.id}:${eventSeq}:${winner}`,
      fixtureId: tick.fixtureId,
      horizonId: settledSnapshot.id,
      winner,
      minute: round2(minute),
      tsMs: eventTs,
      triggerSeq: eventSeq,
      settlingProbability: probability,
      thesis: settledSnapshot.thesis,
      action: settledSnapshot.action,
      surprise,
      thesisDead,
      brierScore,
      latencyMs,
      settledSnapshot,
    };

    this.settled += 1;
    if (winner === settledSnapshot.thesis) this.thesisHits += 1;
    if (winner === settledSnapshot.action) this.actionHits += 1;
    if (surprise) this.surprises += 1;
    if (thesisDead) this.thesisDead += 1;
    this.brierTotal += brierScore;
    this.lastLatency = latencyMs;
    this.lastCollapse = collapse;
    this.ticker = [collapse, ...this.ticker].slice(0, 30);
    this.current = null;

    this.record({
      kind: "horizon_collapse",
      tick: tick.seq,
      tsMs: eventTs,
      summary: `Horizon collapsed to ${winner}${surprise ? " · SURPRISE" : thesisDead ? " · THESIS DEAD" : ""}`,
      payload: collapse,
      reactedToHash: context.tickHash,
    });
  }

  private updateOddsSwing(tick: MarketTick) {
    for (const event of tick.events) if (event.kind === "goal") this.goalTimes.push(timestampOfEvent(event, tick.tsMs));
    this.goalTimes = this.goalTimes.filter((ts) => ts >= tick.tsMs - 10 * 60_000);

    const oneXTwo = tick.odds.markets.find((market) => market.type === "match_result");
    const home = oneXTwo?.selections.find((selection) => selection.key === "home")?.impliedProb;
    const away = oneXTwo?.selections.find((selection) => selection.key === "away")?.impliedProb;
    if (home === undefined || away === undefined || !Number.isFinite(home) || !Number.isFinite(away)) {
      this.oddsSwing = emptySwing("missing_1x2");
      return;
    }

    this.oddsHistory.push({ tsMs: tick.tsMs, home, away });
    this.oddsHistory = this.oddsHistory.filter((point) => point.tsMs >= tick.tsMs - 10 * 60_000);
    const target = tick.tsMs - SWING_LOOKBACK_MS;
    const base = this.oddsHistory.filter((point) => point.tsMs <= target).at(-1);
    const favorite = home >= away ? "home" : "away";
    if (!base) {
      this.oddsSwing = { ...emptySwing("insufficient_history"), favorite, toProbability: favorite === "home" ? home : away };
      return;
    }

    const fromProbability = base[favorite];
    const toProbability = favorite === "home" ? home : away;
    const delta = Math.abs(toProbability - fromProbability);
    const goalInLookback = this.goalTimes.some((ts) => ts > base.tsMs && ts <= tick.tsMs);
    const active = delta >= SWING_THRESHOLD && !goalInLookback;
    this.oddsSwing = {
      active,
      favorite,
      fromProbability,
      toProbability,
      delta,
      windowSeconds: Math.round((tick.tsMs - base.tsMs) / 1000),
      reason: goalInLookback ? "goal_in_lookback" : active ? "movement" : "below_threshold",
    };
  }

  private snapshot(tick?: MarketTick): HorizonState {
    return {
      ready: this.current !== null,
      current: this.current,
      lastCollapse: this.lastCollapse,
      collapseTicker: this.ticker,
      oddsSwing: this.oddsSwing,
      metrics: {
        horizonsOpened: this.opened,
        horizonsSettled: this.settled,
        thesisHitRate: rate(this.thesisHits, this.settled),
        actionHitRate: rate(this.actionHits, this.settled),
        surprises: this.surprises,
        thesisDeadCount: this.thesisDead,
        meanBrierScore: this.settled ? round4(this.brierTotal / this.settled) : 0,
        liveCollapseLatencyMs: this.lastLatency,
      },
      updatedAtMs: this.updatedAtMs,
      missingRequiredMarket: tick ? !hasUsableOneXTwo(tick) : this.oddsSwing.reason === "missing_1x2",
    };
  }
}

function features(tick: MarketTick, minute: number) {
  return {
    minute,
    scoreDiff: tick.score.goals.home - tick.score.goals.away,
    cardDiff:
      tick.score.yellow.home + 2 * tick.score.red.home -
      (tick.score.yellow.away + 2 * tick.score.red.away),
  };
}

function isMaterial(event: MatchEvent): boolean {
  return event.kind === "goal" || event.kind === "yellow" || event.kind === "red";
}

function eventOutcome(event: MatchEvent): HorizonOutcome {
  if (event.kind === "goal") return event.side === "away" ? "goal_away" : "goal_home";
  return "card";
}

function timestampOfEvent(event: MatchEvent, fallback: number): number {
  const parsed = Date.parse(event.ts);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function materialEventTimestamp(tick: MarketTick, seq: number): number | undefined {
  const event = tick.events.find((candidate) => candidate.seq === seq);
  return event ? timestampOfEvent(event, tick.tsMs) : undefined;
}

function hasUsableOneXTwo(tick: MarketTick): boolean {
  const market = tick.odds.markets.find((candidate) => candidate.type === "match_result");
  return ["home", "draw", "away"].every((key) =>
    market?.selections.some((selection) => selection.key === key && selection.impliedProb > 0),
  );
}

function emptySwing(reason: OddsSwing["reason"]): OddsSwing {
  return { active: false, favorite: null, fromProbability: 0, toProbability: 0, delta: 0, windowSeconds: 0, reason };
}

function rate(hit: number, total: number): number {
  return total ? round4(hit / total) : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
