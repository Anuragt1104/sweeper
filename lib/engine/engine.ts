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
import { GamePhase, PHASE_LABEL, type Fixture, type MatchEvent, type OddsMarketType } from "@/lib/txline/types";
import { fmtClock, priceMovement } from "@/lib/util/format";
import { uid } from "@/lib/util/id";
import { MarketTickGenerator, type MarketTick, type ScenarioEvent, type TempoProvider } from "@/lib/market/ticks";
import { Sentinel } from "@/lib/sentinel/sentinel";
import type { SelectionFeatures } from "@/lib/market/features";
import { buildAgents } from "@/lib/agents/registry";
import type { Agent, Decision, DeskSignals } from "@/lib/agents/types";
import { buildSessionScorecard } from "@/lib/agents/session-scorecard";
import { DeskFeatureStore, type DeskPathFeatures } from "@/lib/agents/desk-features";
import { classifyRegime } from "@/lib/agents/regime";
import { SimulatedPaperExchange } from "@/lib/execution/paper";
import { LiveShadowExchange } from "@/lib/execution/live-shadow";
import type { ExecutionAdapter } from "@/lib/execution/types";
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
  type DeskPathView,
  type EngineState,
  type LedgerView,
  type MarketView,
  type SelectionView,
  type TickView,
  type FeedHealth,
  PUBLIC_SCHEMA_VERSION,
  type RunProvenance,
  type SupervisorStatus,
  type TradeReadiness,
} from "@/lib/engine/state";
import { HorizonMachine } from "@/lib/horizon/machine";
import type { FrequencyArtifact } from "@/lib/horizon/probability";
import { loadFrequencyArtifact } from "@/lib/horizon/artifact";
import { ShockStripAssembler } from "@/lib/tempo/strip";
import type { TempoSnapshot } from "@/lib/tempo/types";
import { evaluateTradeReadiness } from "@/lib/readiness/trade-readiness";
import type { SettlementVerification } from "@/lib/proof/txline-settlement-verifier";
import { composeDeskModel, type DeskModelView } from "@/lib/desk/compose";
import { DESK_WEIGHTS } from "@/lib/desk/weights";
import { emptyDeskModel } from "@/lib/desk/empty";
import { snapshotDeskModel } from "@/lib/desk/contract-deck";
import { computeMatchIntensity, emptyMatchIntensity, type MatchIntensity } from "@/lib/desk/match-intensity";
import { projectStrategyStances } from "@/lib/strategy-lab/stances";

export class SweeperEngine {
  readonly sessionId: string;
  readonly fixture: Fixture;
  readonly config: EngineConfig;
  readonly mode: RunProvenance;

  private gen: MarketTickGenerator;
  private sentinel: Sentinel;
  private agents: Agent[];
  private books = new Map<string, Portfolio>();
  private exchange: ExecutionAdapter;
  private ledger: AuditLedger;
  private horizon: HorizonMachine;
  private shockStrip = new ShockStripAssembler();
  private deskFeatures = new DeskFeatureStore();
  private lastPath: DeskPathFeatures | null = null;
  private lastModel: DeskModelView = emptyDeskModel();
  private lastIntensity: MatchIntensity = emptyMatchIntensity();
  private eventTape: MatchEvent[] = [];
  private warmedTicks = 0;

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
  private tradeReadiness: TradeReadiness = {
    ready: false,
    reasons: ["no tick ingested"],
    checkedAtMs: 0,
    scoreAgeMs: null,
    oddsAgeMs: null,
  };
  private supervisorStatus: SupervisorStatus | null = null;

  constructor(
    fixture: Fixture,
    config: EngineConfig,
    mode: RunProvenance = "simulation",
    scenario: ScenarioEvent[] = [],
    horizonArtifact?: FrequencyArtifact,
    sessionId?: string,
    tempoProvider?: TempoProvider,
  ) {
    this.fixture = fixture;
    this.config = config;
    this.mode = mode;
    this.sessionId = sessionId ?? uid("swpr");
    this.ledger = new AuditLedger(mode === "live" ? { maxFullRecords: 256 } : {});
    this.gen = new MarketTickGenerator(fixture, config, scenario, tempoProvider);
    this.sentinel = new Sentinel(fixture.id, config);
    this.agents = buildAgents();
    this.exchange = mode === "simulation"
      ? new SimulatedPaperExchange(config)
      : new LiveShadowExchange(config);
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
    if (mode !== "simulation") {
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

  /** Live tempo enrichment — recomputes desk model + path features agents read. */
  applyTempo(snapshot: TempoSnapshot): void {
    this.shockStrip.applyTempo({
      ...snapshot,
      minute: snapshot.minute || this.currentTick?.minute || 0,
    });
    if (this.currentTick) {
      this.refreshDeskFromStrip(this.currentTick);
    }
    this.updatedAtMs = Date.now();
  }

  setTempoStatus(
    status: "ready" | "polling" | "unavailable" | "error",
    detail: string,
    source: "sim" | "api-football" | "none" = "none",
  ): void {
    this.shockStrip.setTempoStatus(status, detail, source);
  }

  setSupervisorStatus(next: SupervisorStatus): void {
    this.supervisorStatus = { ...next };
  }

  /** Mark every portfolio to *observed* prices — never privileged sim reference. */
  private markAll(tick: MarketTick) {
    for (const m of tick.odds.markets) {
      for (const s of m.selections) {
        const id = selId(m.type, s.key);
        for (const book of this.books.values()) book.mark(id, s.impliedProb);
      }
    }
  }

  /**
   * After Shock Strip ingest (and any tempo apply), compose our desk model and
   * push Hybrid + path features agents trade on.
   */
  private refreshDeskFromStrip(tick: MarketTick): DeskSignals {
    const horizonState = this.horizon.getState();
    const homePrior = this.deskFeatures.homeProbPrior(DESK_WEIGHTS.oddsVelocityMinutes);
    const markers = this.shockStrip.recentMarkerSeverities(
      tick.minute,
      DESK_WEIGHTS.tempoWindowMinutes,
    );
    const stripPeek = this.shockStrip.getState();
    const model = composeDeskModel({
      tick,
      horizon: horizonState.current,
      tempo: stripPeek.tempo.latest,
      homeProbPrior: homePrior,
      markerSeverities: markers,
      includeHorizonMap: true,
    });
    this.lastModel = model;
    this.shockStrip.setHybridPoint({
      minute: tick.minute,
      fairHome: model.fairHome,
      tempoIntensity: model.hybrid.tempoIntensity,
      oddsVelocity: Math.abs(model.hybrid.signedOddsVelocityHome),
      pressure: model.hybrid.pressure,
      thesis: horizonState.current?.thesis ?? null,
    });
    const stripState = this.shockStrip.getState();
    const path = this.deskFeatures.update(
      tick,
      stripState,
      horizonState.current,
      horizonState.lastCollapse,
      {
        fairHome: model.fairHome,
        pressure: model.hybrid.pressure,
        tempoIntensity: model.hybrid.tempoIntensity,
        oddsVelocity: Math.abs(model.hybrid.signedOddsVelocityHome),
      },
    );
    this.lastPath = path;
    return {
      horizon: horizonState.current,
      hybridThesisProb: model.fairHome,
      pressure: model.hybrid.pressure,
      tempoIntensity: model.hybrid.tempoIntensity,
      lastCollapse: horizonState.lastCollapse,
      path,
      model,
    };
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
    this.tradeReadiness = evaluateTradeReadiness(tick, this.feedHealth, this.mode, processedAtMs);
    this.markAll(tick);
    if (tick.events.length) this.eventTape.push(...tick.events);
    // Cap tape so late-match frames stay bounded.
    if (this.eventTape.length > 400) this.eventTape = this.eventTape.slice(-400);
    this.lastIntensity = computeMatchIntensity(tick.score, this.eventTape);

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
    // Shock strip ingest applies tick tempo first; desk model commits Hybrid after.
    this.shockStrip.ingestTick(tick, {
      oddsSwing: horizonState.oddsSwing,
      lastCollapse: horizonState.lastCollapse,
      horizon: horizonState.current,
    });
    const desk = this.refreshDeskFromStrip(tick);

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
      const decision = agent.onTick({
        tick,
        assessment,
        features,
        book,
        cfg: this.config,
        readiness: this.tradeReadiness,
        desk,
      });
      decision.reactedToHash = tickHash;
      this.lastDecision.set(agent.id, decision);

      const decisionHash = this.ledger.append(
        "decision",
        tick.seq,
        tick.tsMs,
        `${agent.name}: ${decision.rationale}`,
        {
          agentId: agent.id,
          rationale: decision.rationale,
          stoodDown: decision.stoodDown ?? false,
          kind: decision.kind ?? null,
          drivingInputs: decision.drivingInputs ?? null,
          analysis: {
            modelVersion: desk.model.weightsVersion,
            regime: classifyRegime(desk.path, this.config),
            quality: assessment.quality,
            fair1x2: desk.model.ready ? desk.model.fair1x2 : null,
            edgeVsBook: desk.model.ready ? desk.model.edgeVsObs : null,
            horizonTransition:
              horizonState.lastCollapse?.triggerSeq === tick.seq
                ? horizonState.lastCollapse
                : null,
          },
          orders: decision.orders,
          quotes: decision.quotes,
        },
        tickHash,
      ).hash;

      if (agent.mode === "taker") {
        for (const order of decision.orders) {
          const res = this.exchange.executeOrder(order, tick, this.tradeReadiness);
          if (res.ok) {
            book.applyFill(res.fill);
            this.ledger.append(
              "fill",
              tick.seq,
              tick.tsMs,
              fillSummary(res.fill),
              { ...res.fill, portfolioAfter: book.metrics() },
              decisionHash,
            );
          }
        }
      } else {
        const fills = this.exchange.matchQuotes(decision.quotes, tick, this.tradeReadiness);
        for (const fill of fills) {
          book.applyFill(fill);
          this.ledger.append(
            "fill",
            tick.seq,
            tick.tsMs,
            fillSummary(fill),
            { ...fill, portfolioAfter: book.metrics() },
            decisionHash,
          );
        }
      }
    }

    // 4. mark + snapshot equity curves (post-fill)
    this.markAll(tick);
    for (const book of this.books.values()) book.snapshot(tick.seq, tick.tsMs);

    this.cursor += 1;
    this.updatedAtMs = tick.tsMs;
    const terminal = this.mode === "simulation"
      ? tick.phase === GamePhase.FullTime || tick.phase === GamePhase.Finished
      : tick.score.lifecycle?.action === "game_finalised";
    if ((this.mode === "simulation" && this.cursor >= this.totalTicks) || terminal) {
      this.finalize();
      return false;
    }
    return true;
  }

  /**
   * Silent warm-start: advance Horizon + Shock Strip + DeskFeatureStore without
   * ledger / Sentinel / agent fills. Used to seed path features from historical
   * or simulated ticks before trading begins.
   */
  warmFeaturesFromTicks(ticks: MarketTick[]): number {
    let n = 0;
    for (const tick of ticks) {
      this.horizon.processTick(tick, { processedAtMs: tick.tsMs });
      const horizonState = this.horizon.getState();
      this.shockStrip.ingestTick(tick, {
        oddsSwing: horizonState.oddsSwing,
        lastCollapse: horizonState.lastCollapse,
        horizon: horizonState.current,
      });
      this.refreshDeskFromStrip(tick);
      n += 1;
    }
    this.warmedTicks += n;
    return n;
  }

  /**
   * Simulation warm-start: pull ticks from the generator up to (but not including)
   * `untilMinute`, seed path features, and leave the trading cursor ready so the
   * next `step()` continues from that minute.
   */
  warmFeaturesUntil(untilMinute: number): number {
    const ticks: MarketTick[] = [];
    while (this.cursor < this.totalTicks) {
      const tick = this.gen.at(this.cursor);
      if (tick.minute >= untilMinute) break;
      ticks.push(tick);
      this.cursor += 1;
    }
    return this.warmFeaturesFromTicks(ticks);
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
    const settlementMode = this.mode === "simulation" ? "simulation" : "live";
    const receipt = buildSettlement(this.fixture, finalScore, tick.phase, root, settlementMode, this.mode === "simulation");
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

  applySettlementVerification(verification: SettlementVerification): SettlementReceipt {
    if (this.mode === "simulation") throw new Error("Simulation settlement does not accept TxLINE verification");
    const tick = this.currentTick;
    if (!tick || tick.score.lifecycle?.action !== "game_finalised") {
      throw new Error("A real game_finalised tick is required before settlement verification");
    }
    if (!verification.verified) {
      if (this.settlement) {
        this.settlement.reason = `${verification.failureCode}: ${verification.detail}`;
        this.settlement.txlineSettlementProof = null;
      }
      this.ledger.append(
        "settlement",
        tick.seq,
        Date.now(),
        `Settlement held · ${verification.failureCode}`,
        verification,
      );
      return this.settlement!;
    }

    const finalScore: FinalScore = { home: tick.score.goals.home, away: tick.score.goals.away };
    const verifiedAtMs = verification.txlineSettlementProof?.verifiedAtMs ?? tick.tsMs;
    const receipt = buildSettlement(this.fixture, finalScore, tick.phase, this.ledger.root(), "live", true);
    receipt.txlineSettlementProof = verification.txlineSettlementProof;
    this.settlement = receipt;
    const outcomes = new Map(Object.entries(receipt.outcomes)) as Map<string, 0 | 1>;
    for (const book of this.books.values()) {
      book.settle(outcomes);
      book.snapshot(tick.seq + 1, verifiedAtMs);
    }
    this.ledger.append(
      "settlement",
      tick.seq,
      verifiedAtMs,
      `TxLINE mainnet proof verified · ${receipt.match} ${finalScore.home}-${finalScore.away}`,
      verification,
    );
    this.updatedAtMs = verifiedAtMs;
    return receipt;
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
      const kind =
        last?.kind ??
        (last?.stoodDown
          ? "stand_down"
          : last?.orders.length
            ? "trade"
            : last?.quotes.length
              ? "quote"
              : last
                ? "hold"
                : null);
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
        stoodDown: last?.stoodDown ?? false,
        // Denser curve for the desk hero sparklines (~120 pts).
        curve: sampleCurve(
          book.curve.map((c) => c.equity),
          120,
        ),
        lastDecisionKind: kind,
        lastSignalIds: last?.signalIds ?? [],
        drivingInputs: last?.drivingInputs ?? null,
      };
    });
    const leader = agents.length
      ? agents.reduce((best, a) => (a.metrics.equity > best.metrics.equity ? a : best)).id
      : null;
    const scorecard = buildSessionScorecard(
      agents,
      this.horizon.getState(),
      leader,
      this.lastPath,
      this.config,
      this.warmedTicks,
    );
    const deskPath = this.toDeskPathView(this.lastPath);
    const deskModel = snapshotDeskModel(this.lastModel);
    const matchIntensity = this.lastIntensity;
    const strategyStances = projectStrategyStances(
      agents,
      this.lastDecision,
      this.tradeReadiness,
      deskModel,
    );

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
      schemaVersion: PUBLIC_SCHEMA_VERSION,
      sessionId: this.sessionId,
      status: this.status,
      provenance: this.mode,
      executionMode: this.mode === "simulation" ? "simulated" : "shadow",
      mode: this.mode,
      fixture: {
        id: this.fixture.id,
        competitionId: this.fixture.competitionId,
        home: this.fixture.home.name,
        away: this.fixture.away.name,
        homeCode: this.fixture.home.code,
        awayCode: this.fixture.away.code,
        stage: this.fixture.stage,
        competition: this.fixture.competition,
      },
      config: this.config,
      progress: {
        // Expose the last ingested seq (not the next cursor) so chips match current.seq.
        tick: tick?.seq ?? 0,
        total: this.totalTicks,
        minute: tick ? round2(tick.minute) : 0,
        pct: Math.round(((tick ? tick.seq + 1 : 0) / this.totalTicks) * 100),
      },
      current: tick ? this.tickView(tick) : null,
      quality: Math.round(this.sentinel.currentQuality()),
      signals: this.signals.slice(-40).reverse(),
      signalCounts: this.signalCounts,
      agents,
      strategyStances,
      leader,
      scorecard,
      deskPath,
      deskModel,
      matchIntensity,
      ledger: {
        size: this.ledger.size(),
        root: this.ledger.root(),
        recent: ledgerRecent.reverse(),
        anchor: this.anchorInfo,
      },
      settlement: this.settlement,
      feedHealth: this.feedHealth,
      tradeReadiness: this.tradeReadiness,
      supervisor: this.supervisorStatus,
      horizon: this.horizon.getState(),
      shockStrip: this.shockStrip.getState(),
      anchorAvailable: this.anchorAvailable(),
      startedAtMs: this.startedAtMs,
      updatedAtMs: this.updatedAtMs,
    };
  }

  private tickView(tick: MarketTick): TickView {
    const markets: MarketView[] = tick.odds.markets.map((m) => {
      const fairM = tick.reference.markets.find((x) => x.type === m.type);
      const selections: SelectionView[] = m.selections.map((s) => {
        const id = selId(m.type, s.key);
        const f = this.sentinelFeature(id);
        const referenceProb = fairM?.selections.find((x) => x.key === s.key)?.impliedProb ?? s.impliedProb;
        return {
          marketType: m.type as OddsMarketType,
          key: s.key,
          label: s.label,
          prob: round3(s.impliedProb),
          price: s.price,
          prevPrice: s.prevPrice,
          decimal: round2(1 / Math.max(0.001, s.impliedProb)),
          referenceProb: round3(referenceProb),
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
      minute: round2(tick.minute),
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
      pricing: tick.pricing,
      readiness: this.tradeReadiness,
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

  private toDeskPathView(path: DeskPathFeatures | null): DeskPathView | null {
    if (!path) return null;
    const tail = path.series.slice(-48);
    return {
      windowMinutes: round2(path.windowMinutes),
      homeRet1: path.homeRet1 != null ? round4(path.homeRet1) : null,
      homeRet5: path.homeRet5 != null ? round4(path.homeRet5) : null,
      homeRet10: path.homeRet10 != null ? round4(path.homeRet10) : null,
      hybridSlope5: path.hybridSlope5 != null ? round4(path.hybridSlope5) : null,
      tempoAccel3: path.tempoAccel3 != null ? round4(path.tempoAccel3) : null,
      pressureDelta5: path.pressureDelta5 != null ? round4(path.pressureDelta5) : null,
      homePathVol: path.homePathVol != null ? round4(path.homePathVol) : null,
      minutesSinceCollapse: path.minutesSinceCollapse != null ? round2(path.minutesSinceCollapse) : null,
      lastCollapseWinner: path.lastCollapseWinner,
      lastCollapseSurprise: path.lastCollapseSurprise,
      tempoOddsDivergence: path.tempoOddsDivergence,
      regime: classifyRegime(path, this.config),
      homeProbSeries: tail.map((p) => (p.homeProb != null ? round3(p.homeProb) : 0)),
      hybridSeries: tail.map((p) => round3(p.hybridThesisProb)),
      tempoSeries: tail.map((p) => round3(p.tempoIntensity)),
      warmedTicks: this.warmedTicks,
    };
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
