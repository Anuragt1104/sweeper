/**
 * SweeperEngine — the autonomous run loop.
 *
 * One engine drives one fixture from kickoff to settlement with **no human
 * input**. Each `step()`:
 *   1. pulls the next market tick (observed odds + score + events),
 *   2. records it on the audit ledger and captures its hash,
 *   3. runs the Sentinel → signals (each bound to that tick hash),
 *   4. lets every agent decide, routes orders/quotes through the paper exchange,
 *      and books the fills,
 *   5. marks every portfolio to fair and snapshots the equity curve.
 * At the final tick it runs the proof-backed settlement guardrail.
 *
 * The same loop runs three ways with identical logic: the in-browser dashboard
 * (driven by a server timer), the headless CLI runner, and replay (stepped as
 * fast as possible). Determinism comes from (fixtureId, config.seed).
 */
import { GamePhase, PHASE_LABEL, type Fixture, type OddsMarketType } from "@/lib/txline/types";
import { fmtClock, priceMovement } from "@/lib/util/format";
import { uid } from "@/lib/util/id";
import { MarketTickGenerator, type MarketTick, type ScenarioEvent } from "@/lib/market/ticks";
import { Sentinel } from "@/lib/sentinel/sentinel";
import type { SelectionFeatures } from "@/lib/market/features";
import { buildAgents } from "@/lib/agents/registry";
import type { Agent, Decision } from "@/lib/agents/types";
import { PaperExchange } from "@/lib/execution/paper";
import { Portfolio } from "@/lib/execution/portfolio";
import { AuditLedger } from "@/lib/proof/ledger";
import { buildSettlement, type FinalScore, type SettlementReceipt } from "@/lib/proof/settlement";
import { anchorConfigured, anchorRoot, explorerTxUrl } from "@/lib/proof/anchor";
import type { Signal } from "@/lib/sentinel/types";
import type { EngineConfig } from "@/lib/engine/config";
import { selId } from "@/lib/market/ids";
import {
  EMPTY_SIGNAL_COUNTS,
  OFFLINE_FEED_HEALTH,
  sampleCurve,
  type AgentView,
  type AnchorInfo,
  type EngineState,
  type LedgerView,
  type MarketView,
  type SelectionView,
  type TickView,
  type FeedHealth,
} from "@/lib/engine/state";
import { HorizonMachine } from "@/lib/horizon/machine";
import type { FrequencyArtifact } from "@/lib/horizon/probability";
import { loadFrequencyArtifact } from "@/lib/horizon/artifact";
import { ShockStripAssembler } from "@/lib/tempo/strip";
import type { TempoSnapshot } from "@/lib/tempo/types";

export class SweeperEngine {
  readonly sessionId: string;
  readonly fixture: Fixture;
  readonly config: EngineConfig;
  readonly mode: "simulation" | "live";

  private gen: MarketTickGenerator;
  private sentinel: Sentinel;
  private agents: Agent[];
  private books = new Map<string, Portfolio>();
  private exchange: PaperExchange;
  private ledger = new AuditLedger();
  private horizon: HorizonMachine;
  private shockStrip = new ShockStripAssembler();

  private cursor = 0;
  private status: EngineState["status"] = "idle";
  private currentTick: MarketTick | null = null;
  private signals: Signal[] = [];
  private signalCounts = { ...EMPTY_SIGNAL_COUNTS };
  private lastDecision = new Map<string, Decision>();
  private settlement: SettlementReceipt | null = null;
  private anchorInfo: AnchorInfo | null = null;
  private startedAtMs = 0;
  private updatedAtMs = 0;
  private feedHealth: FeedHealth = { ...OFFLINE_FEED_HEALTH };

  constructor(
    fixture: Fixture,
    config: EngineConfig,
    mode: "simulation" | "live" = "simulation",
    scenario: ScenarioEvent[] = [],
    horizonArtifact?: FrequencyArtifact,
  ) {
    this.fixture = fixture;
    this.config = config;
    this.mode = mode;
    this.sessionId = uid("swpr");
    this.gen = new MarketTickGenerator(fixture, config, scenario);
    this.sentinel = new Sentinel(fixture.id, config);
    this.agents = buildAgents();
    this.exchange = new PaperExchange(config);
    this.horizon = new HorizonMachine(horizonArtifact ?? loadFrequencyArtifact(), (record) => {
      this.ledger.append(
        record.kind,
        record.tick,
        record.tsMs,
        record.summary,
        record.payload,
        record.reactedToHash,
      );
    });
    if (mode === "live") {
      this.feedHealth = {
        ...OFFLINE_FEED_HEALTH,
        status: "connecting",
        detail: "Hydrating TxLINE score and odds snapshots",
        watching: 1,
      };
    }
    for (const a of this.agents) this.books.set(a.id, new Portfolio(a.id, config.execution.bankroll));
  }

  get totalTicks(): number {
    return this.gen.totalTicks;
  }
  get isRunning(): boolean {
    return this.status === "running";
  }
  get isFinished(): boolean {
    return this.status === "finished";
  }

  setFeedHealth(next: FeedHealth): void {
    this.feedHealth = { ...next };
  }

  /** Live tempo enrichment (API-Football). Does not touch Horizon. */
  applyTempo(snapshot: TempoSnapshot): void {
    this.shockStrip.applyTempo({
      ...snapshot,
      minute: snapshot.minute || this.currentTick?.minute || 0,
    });
    this.updatedAtMs = Date.now();
  }

  setTempoStatus(
    status: "ready" | "polling" | "unavailable" | "error",
    detail: string,
    source: "sim" | "api-football" | "none" = "none",
  ): void {
    this.shockStrip.setTempoStatus(status, detail, source);
  }

  /** Mark every portfolio to the model fair price for the given tick. */
  private markAll(tick: MarketTick) {
    for (const m of tick.fair.markets) {
      for (const s of m.selections) {
        const id = selId(m.type, s.key);
        for (const book of this.books.values()) book.mark(id, s.impliedProb);
      }
    }
  }

  /** Advance one tick. Returns true while more ticks remain. */
  step(): boolean {
    if (this.status === "finished") return false;
    const tick = this.gen.at(this.cursor);
    return this.ingest(tick);
  }

  /**
   * Deterministic trading/Horizon seam. Simulation, replay, and TxLINE live
   * adapters all hand normalized ticks to this one method.
   */
  ingest(tick: MarketTick, processedAtMs = tick.tsMs): boolean {
    if (this.status === "finished") return false;
    if (this.status === "idle") {
      this.status = "running";
      this.startedAtMs = tick.tsMs;
    }
    this.currentTick = tick;
    this.markAll(tick);

    // 1. record the data we ingested → hash links every downstream decision
    const tickHash = this.ledger.append(
      "tick",
      tick.seq,
      tick.tsMs,
      `Tick ${tick.seq} · ${fmtClock(tick.minute, tick.phase)} · q-pending`,
      tickPayload(tick),
    ).hash;

    // Horizon records are bound to the same triggering tick hash as trading.
    this.horizon.processTick(tick, { tickHash, processedAtMs });
    const horizonState = this.horizon.getState();
    // Shock strip is UI-only; never feeds Horizon settlement.
    this.shockStrip.ingestTick(tick, {
      oddsSwing: horizonState.oddsSwing,
      lastCollapse: horizonState.lastCollapse,
    });

    // 2. sentinel
    const { assessment, features } = this.sentinel.process(tick);
    this.lastFeatures = features;
    this.lastAssessmentStale = assessment.staleSelections;
    for (const sig of assessment.signals) {
      sig.reactedToHash = tickHash;
      this.signals.push(sig);
      this.signalCounts[sig.kind] += 1;
      this.ledger.append("signal", tick.seq, tick.tsMs, `${sig.kind}: ${sig.message}`, sig, tickHash);
    }

    // 3. agents decide → execute
    for (const agent of this.agents) {
      const book = this.books.get(agent.id)!;
      const decision = agent.onTick({ tick, assessment, features, book, cfg: this.config });
      decision.reactedToHash = tickHash;
      this.lastDecision.set(agent.id, decision);

      if (agent.mode === "taker") {
        for (const order of decision.orders) {
          const res = this.exchange.executeOrder(order, tick);
          if (res.ok) {
            book.applyFill(res.fill);
            this.ledger.append("fill", tick.seq, tick.tsMs, fillSummary(res.fill), res.fill, tickHash);
          }
        }
      } else {
        const fills = this.exchange.matchFlow(decision.quotes, tick);
        for (const fill of fills) {
          book.applyFill(fill);
          this.ledger.append("fill", tick.seq, tick.tsMs, fillSummary(fill), fill, tickHash);
        }
      }

      if (decision.orders.length || decision.quotes.length) {
        this.ledger.append(
          "decision",
          tick.seq,
          tick.tsMs,
          `${agent.name}: ${decision.rationale}`,
          { agentId: agent.id, rationale: decision.rationale, orders: decision.orders, quotes: decision.quotes },
          tickHash,
        );
      }
    }

    // 4. mark + snapshot equity curves (post-fill)
    this.markAll(tick);
    for (const book of this.books.values()) book.snapshot(tick.seq, tick.tsMs);

    this.cursor += 1;
    this.updatedAtMs = tick.tsMs;
    const terminal = tick.phase === GamePhase.FullTime || tick.phase === GamePhase.Finished;
    if ((this.mode === "simulation" && this.cursor >= this.totalTicks) || terminal) {
      this.finalize();
      return false;
    }
    return true;
  }

  /** Run every remaining tick (replay / CLI). */
  runToCompletion(): EngineState {
    while (this.step()) {
      /* keep stepping */
    }
    return this.getState();
  }

  private finalize() {
    const tick = this.currentTick!;
    const finalScore: FinalScore = { home: tick.score.goals.home, away: tick.score.goals.away };
    const root = this.ledger.root();
    const receipt = buildSettlement(this.fixture, finalScore, tick.phase, root, this.mode, this.mode === "simulation");
    this.settlement = receipt;

    if (receipt.status === "settled") {
      const outcomes = new Map(Object.entries(receipt.outcomes)) as Map<string, 0 | 1>;
      for (const book of this.books.values()) {
        book.settle(outcomes);
        book.snapshot(tick.seq + 1, tick.tsMs + this.config.tickServerMs);
      }
    } else {
      const hold: Signal = {
        id: `settlement_hold:${tick.seq}`,
        seq: tick.seq,
        tsMs: tick.tsMs,
        fixtureId: this.fixture.id,
        kind: "settlement_hold",
        severity: "critical",
        confidence: 1,
        action: "SETTLEMENT_HOLD",
        message: receipt.reason ?? "Settlement held",
        evidence: {},
      };
      this.signals.push(hold);
      this.signalCounts.settlement_hold += 1;
    }

    this.ledger.append(
      "settlement",
      tick.seq,
      tick.tsMs,
      `Settlement ${receipt.status} · ${receipt.match} ${finalScore.home}-${finalScore.away}`,
      receipt,
    );
    this.status = "finished";
    this.updatedAtMs = tick.tsMs;
  }

  /** Anchor the ledger root on Solana devnet (optional). */
  async anchor(): Promise<AnchorInfo | null> {
    if (!anchorConfigured()) return null;
    const root = this.ledger.root();
    const sig = await anchorRoot(this.sessionId, root);
    this.anchorInfo = { sig, url: explorerTxUrl(sig), root };
    return this.anchorInfo;
  }

  anchorAvailable(): boolean {
    return anchorConfigured();
  }

  proof(seq: number) {
    return this.ledger.proof(seq);
  }

  getLedger(): AuditLedger {
    return this.ledger;
  }

  // ── snapshot ────────────────────────────────────────────────────────────────

  getState(): EngineState {
    const tick = this.currentTick;
    const agents: AgentView[] = this.agents.map((a) => {
      const book = this.books.get(a.id)!;
      const last = this.lastDecision.get(a.id);
      return {
        id: a.id,
        name: a.name,
        kind: a.kind,
        blurb: a.blurb,
        mode: a.mode,
        metrics: book.metrics(),
        positions: book.positions().map((p) => ({
          selId: p.selId,
          label: `${p.marketType}/${p.selectionKey}`,
          net: p.net,
          avg: round3(p.avg),
          mark: round3(p.mark),
          unrealized: round2(p.net * (p.mark - p.avg)),
        })),
        lastRationale: last?.rationale ?? "—",
        curve: sampleCurve(book.curve.map((c) => c.equity)),
      };
    });
    const leader = agents.length
      ? agents.reduce((best, a) => (a.metrics.equity > best.metrics.equity ? a : best)).id
      : null;

    const ledgerRecent: LedgerView[] = this.ledger.recent(40).map((r) => ({
      seq: r.seq,
      tick: r.tick,
      kind: r.kind,
      summary: r.summary,
      hash: r.hash,
      reactedToHash: r.reactedToHash,
      tsMs: r.tsMs,
    }));

    return {
      sessionId: this.sessionId,
      status: this.status,
      mode: this.mode,
      fixture: {
        id: this.fixture.id,
        home: this.fixture.home.name,
        away: this.fixture.away.name,
        homeCode: this.fixture.home.code,
        awayCode: this.fixture.away.code,
        stage: this.fixture.stage,
        competition: this.fixture.competition,
      },
      config: this.config,
      progress: {
        tick: this.cursor,
        total: this.totalTicks,
        minute: tick ? Math.round(tick.minute) : 0,
        pct: Math.round((this.cursor / this.totalTicks) * 100),
      },
      current: tick ? this.tickView(tick) : null,
      quality: Math.round(this.sentinel.currentQuality()),
      signals: this.signals.slice(-40).reverse(),
      signalCounts: this.signalCounts,
      agents,
      leader,
      ledger: {
        size: this.ledger.size(),
        root: this.ledger.root(),
        recent: ledgerRecent.reverse(),
        anchor: this.anchorInfo,
      },
      settlement: this.settlement,
      feedHealth: this.feedHealth,
      horizon: this.horizon.getState(),
      shockStrip: this.shockStrip.getState(),
      anchorAvailable: this.anchorAvailable(),
      startedAtMs: this.startedAtMs,
      updatedAtMs: this.updatedAtMs,
    };
  }

  private tickView(tick: MarketTick): TickView {
    const markets: MarketView[] = tick.odds.markets.map((m) => {
      const fairM = tick.fair.markets.find((x) => x.type === m.type);
      const selections: SelectionView[] = m.selections.map((s) => {
        const id = selId(m.type, s.key);
        const f = this.sentinelFeature(id);
        const fairProb = fairM?.selections.find((x) => x.key === s.key)?.impliedProb ?? s.impliedProb;
        return {
          marketType: m.type as OddsMarketType,
          key: s.key,
          label: s.label,
          prob: round3(s.impliedProb),
          price: s.price,
          prevPrice: s.prevPrice,
          decimal: round2(1 / Math.max(0.001, s.impliedProb)),
          fairProb: round3(fairProb),
          movement: priceMovement(s.price, s.prevPrice),
          z: f ? round2(f.z) : 0,
          vol: f ? round4(f.vol) : 0,
          stale: this.staleSet().has(id),
        };
      });
      return { type: m.type as OddsMarketType, label: m.label, line: m.line, selections };
    });

    return {
      seq: tick.seq,
      minute: Math.round(tick.minute),
      phase: tick.phase,
      phaseLabel: PHASE_LABEL[tick.phase],
      clock: fmtClock(tick.minute, tick.phase),
      tsMs: tick.tsMs,
      homeName: this.fixture.home.name,
      awayName: this.fixture.away.name,
      homeCode: this.fixture.home.code,
      awayCode: this.fixture.away.code,
      homeGoals: tick.score.goals.home,
      awayGoals: tick.score.goals.away,
      homeCorners: tick.score.corners.home,
      awayCorners: tick.score.corners.away,
      suspended: tick.suspended,
      quality: Math.round(this.sentinel.currentQuality()),
      markets,
      events: tick.events.map((e) => ({ kind: e.kind, label: e.label, minute: e.minute })),
      anomaly: tick.anomaly,
    };
  }

  // feature/stale lookups for the view (cached from the latest sentinel pass)
  private lastFeatures: Map<string, SelectionFeatures> | null = null;
  private lastAssessmentStale: string[] = [];
  private sentinelFeature(id: string): SelectionFeatures | undefined {
    return this.lastFeatures?.get(id);
  }
  private staleSet(): Set<string> {
    return new Set(this.lastAssessmentStale);
  }
}

// ── ledger payload + summary helpers ─────────────────────────────────────────

function tickPayload(tick: MarketTick) {
  return {
    fixtureId: tick.fixtureId,
    seq: tick.seq,
    tsMs: tick.tsMs,
    minute: round2(tick.minute),
    suspended: tick.suspended,
    score: { home: tick.score.goals.home, away: tick.score.goals.away },
    odds: tick.odds.markets.map((m) => ({
      type: m.type,
      sel: m.selections.map((s) => ({ key: s.key, prob: round4(s.impliedProb), price: s.price })),
    })),
  };
}

function fillSummary(f: { agentId: string; side: string; size: number; selectionKey: string; price: number }): string {
  return `${f.agentId} ${f.side} ${f.size} ${f.selectionKey} @ ${f.price}`;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
