"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { EngineState } from "@/lib/engine/state";
import { StrategyLabProjection, type StrategyLabView } from "@/lib/strategy-lab/projection";
import type { AnalysisChart } from "@/lib/strategy-lab/analysis-chart";
import { ODDS_VIEW_LABELS, ODDS_VIEW_ORDER, type OddsViewId } from "@/lib/tempo/types";
import { AnalysisPathChart, ResidualStrip } from "@/components/analysis-rail";
import { EquityChart, Sparkline, TempoPathChart } from "@/components/charts";
import { feedStreamLabel } from "@/components/format";
import { OddsBoard } from "@/components/panels";
import {
  TimeframeControl,
  timeframeLabel,
  timeframeStart,
  windowMinutePoints,
  type ChartTimeframe,
} from "@/components/chart-timeframe";

export type RailId = "observe" | "interpret" | "act";

const RAIL_COPY: Record<RailId, { eyebrow: string; question: string; label: string }> = {
  observe: { eyebrow: "OBSERVE · UPSTREAM TRUTH", question: "What changed?", label: "Observe" },
  interpret: { eyebrow: "INTERPRET · CONTRACT ANALYSIS", question: "Why would a Strategy act?", label: "Interpret" },
  act: { eyebrow: "ACT · EXECUTION AND OUTCOMES", question: "Who acted, and what changed?", label: "Act" },
};

export function RailDetailDrawer({
  rail,
  state,
  view,
  onClose,
}: {
  rail: RailId | null;
  state: EngineState | null;
  view: StrategyLabView | null;
  onClose: () => void;
}) {
  const open = rail != null;
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  const copy = rail ? RAIL_COPY[rail] : RAIL_COPY.observe;
  const contractLabel = view ? ODDS_VIEW_LABELS[view.selectedContract] : "Selected contract";

  return (
    <>
      <div className={`drawer-scrim ${open ? "is-open" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${copy.label} details`}
        aria-hidden={!open}
        inert={!open}
        className={`advanced-drawer rail-detail-drawer rail-detail-drawer--${rail ?? "observe"} ${open ? "is-open" : ""}`}
      >
        <header className="advanced-drawer__head rail-detail-drawer__head">
          <div>
            <span>{copy.eyebrow}</span>
            <strong>{copy.question}</strong>
            <small>{contractLabel} · follows the contract navigator</small>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={`Close ${copy.label} details`}>
            <X size={19} />
          </button>
        </header>
        <div className="advanced-drawer__body rail-detail-drawer__body">
          {!state || !view || !rail ? (
            <div className="drawer-empty">Waiting for an engine session…</div>
          ) : rail === "observe" ? (
            <ObserveDetails state={state} view={view} />
          ) : rail === "interpret" ? (
            <InterpretDetails state={state} view={view} />
          ) : (
            <ActDetails state={state} view={view} />
          )}
        </div>
      </aside>
    </>
  );
}

function ObserveDetails({ state, view }: { state: EngineState; view: StrategyLabView }) {
  const [movementTimeframe, setMovementTimeframe] = useState<ChartTimeframe>(30);
  const [tempoTimeframe, setTempoTimeframe] = useState<ChartTimeframe>(30);
  const pricing = state.current?.pricing;
  const movement = useMemo(() => marketMovement(state, movementTimeframe), [state, movementTimeframe]);
  const ledger = useMemo(() => changeLedger(view, movement), [view, movement]);
  return (
    <div className="rail-detail-stack rail-detail-stack--observe">
      <DetailSection
        title="Market movement"
        meta={<DetailMeta label={`${movement.length} selections · ${timeframeLabel(movementTimeframe)}`}><TimeframeControl value={movementTimeframe} onChange={setMovementTimeframe} label="Market movement timeframe" /></DetailMeta>}
        className="rail-detail-section--movement rail-detail-section--wide"
      >
        <div className="rail-detail-table-scroll">
          <table className="rail-detail-table rail-detail-table--movement">
            <caption>Observed probability changes by contract and selection</caption>
            <thead><tr><th scope="col">Contract / outcome</th><th scope="col">Now</th><th scope="col">Window Δ</th><th scope="col">Range</th><th scope="col">Observed path</th></tr></thead>
            <tbody>
              {movement.map((row) => (
                <tr key={row.id}>
                  <th scope="row"><span>{row.contractLabel}</span><strong>{row.selectionLabel}</strong></th>
                  <td className="tnum">{pct(row.current)}</td>
                  <td className={`tnum ${row.delta > 0 ? "is-positive" : row.delta < 0 ? "is-negative" : ""}`}>{pp(row.delta)}</td>
                  <td className="tnum">{pct(row.min)}–{pct(row.max)}</td>
                  <td><Sparkline values={row.path} width={170} height={26} color="var(--lab-observation)" ariaLabel={`${row.contractLabel} ${row.selectionLabel} probability path`} showPoints /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!movement.length ? <div className="drawer-empty">Waiting for enough observed odds points.</div> : null}
      </DetailSection>

      <DetailSection title="Full tick diagnostics" meta={`${state.current?.markets.length ?? 0} TxLINE markets · current snapshot`} className="rail-detail-section--markets rail-detail-section--wide">
        <OddsBoard tick={state.current} />
      </DetailSection>

      <DetailSection title="Tempo by side" meta={<DetailMeta label={timeframeLabel(tempoTimeframe)}><TimeframeControl value={tempoTimeframe} onChange={setTempoTimeframe} label="Tempo timeframe" /></DetailMeta>} className="rail-detail-section--tempo">
        <TempoPathChart series={state.shockStrip.tempo.series} homeCode={state.fixture.homeCode} awayCode={state.fixture.awayCode} timeframe={tempoTimeframe} />
        <p className="rail-detail-note">Home and away paths stay separate so pressure changes remain visible. Counts come from {state.shockStrip.tempo.source}; enrichment never settles Horizon.</p>
      </DetailSection>

      <DetailSection title="Change ledger" meta={`${ledger.length} market and match changes`} className="rail-detail-section--events">
        <ol className="rail-change-ledger">
          {ledger.length ? ledger.map((item) => (
            <li key={item.id}>
              <time className="tnum">{item.minute.toFixed(0)}′</time>
              <span><strong>{item.label}</strong><small>{item.source}</small></span>
              <em className={item.tone}>{item.change}</em>
            </li>
          )) : <li className="drawer-empty">No observed changes yet.</li>}
        </ol>
      </DetailSection>

      <DetailSection title="Feed and provenance" meta={state.feedHealth.status} className="rail-detail-section--truth rail-detail-section--wide">
        <dl className="rail-detail-facts rail-detail-facts--four">
          <Fact label="Run provenance" value={view.observation.sourceLabel} />
          <Fact label="Feed detail" value={state.feedHealth.detail} />
          <Fact label="Score stream" value={feedStreamLabel(state.feedHealth.scoreStreamAccepted, state.provenance)} />
          <Fact label="Odds stream" value={feedStreamLabel(state.feedHealth.oddsStreamAccepted, state.provenance)} />
          <Fact label="Score age" value={age(view.observation.scoreAgeMs)} />
          <Fact label="Odds age" value={age(view.observation.oddsAgeMs)} />
          <Fact label="Sequence" value={state.feedHealth.sequenceGap ? `Gap ${state.feedHealth.sequenceGap.expected} → ${state.feedHealth.sequenceGap.received}` : "Continuous"} />
          <Fact label="Reconnects" value={String(state.feedHealth.reconnectCount)} />
          <Fact label="Tempo feed" value={`${state.shockStrip.tempo.status} · ${state.shockStrip.tempo.detail}`} />
          <Fact label="Reference pricing" value={pricing ? `${pricing.source.replaceAll("_", " ")} · ${pricing.sampleCount} samples` : "Awaiting tick"} />
          <Fact label="Market tick" value={state.current ? `seq ${state.current.seq} · ${state.current.clock}` : "Awaiting tick"} />
          <Fact label="Suspension" value={state.current?.suspended ? "Book suspended" : "Book open"} />
        </dl>
      </DetailSection>
    </div>
  );
}

function InterpretDetails({ state, view }: { state: EngineState; view: StrategyLabView }) {
  const [comparisonTimeframe, setComparisonTimeframe] = useState<ChartTimeframe>(15);
  const [pathTimeframe, setPathTimeframe] = useState<ChartTimeframe>(30);
  const [driverTimeframe, setDriverTimeframe] = useState<ChartTimeframe>(15);
  const contractViews = useMemo(() => {
    const analysisOrder = [view.selectedContract, ...ODDS_VIEW_ORDER.filter((contract) => contract !== view.selectedContract)];
    return analysisOrder.map((contract) => StrategyLabProjection.project(state, contract));
  }, [state, view.selectedContract]);
  const comparisonRows = useMemo(() => contractViews.map((contractView) => contractAnalysisRow(contractView, comparisonTimeframe)), [contractViews, comparisonTimeframe]);
  const chart = view.analysis.chart;
  const drivers = useMemo(() => driverDecompositionChart(state, view), [state, view]);
  const horizon = state.horizon.current;
  const collapse = state.horizon.lastCollapse;
  const activeStrategies = view.strategy.rows.filter((row) => row.stance.kind === "trade" || row.stance.kind === "quote").length;
  const eligibleStrategies = view.strategy.rows.filter((row) => row.stance.kind !== "ineligible").length;
  const strategyReasons = prioritizedStrategyReasons(view).slice(0, 5);
  const strongest = strongestBucket(view);
  const leading = leadingBucket(view);
  const chartLatestMinute = Math.max(state.current?.minute ?? state.progress.minute, ...chart.series.flatMap((series) => series.points.map((point) => point.minute)));
  const visibleMarkers = chart.markers.filter((marker) => marker.minute >= timeframeStart(chartLatestMinute, pathTimeframe));

  return (
    <div className="rail-detail-stack">
      <DetailSection title="Strategy pretext" meta={`${ODDS_VIEW_LABELS[view.selectedContract]} · selected in the main navigator`} className="rail-detail-section--wide">
        <dl className="analysis-input-ledger analysis-input-ledger--pretext">
          <Fact label="Analysis boundary" value={analysisBoundary(view)} />
          <Fact label="Leading outcome" value={leading ? `${leading.label} · ${pct(leading.model ?? leading.book)}` : "Awaiting contract path"} />
          <Fact label="Fair-value gap" value={view.analysis.deck.source === "desk_1x2" ? pp(strongest?.edge ?? null) : "Not priced"} />
          <Fact label="Regime" value={view.research.deskInputs.regime} />
          <Fact label="Match intensity" value={view.research.deskInputs.intensity} />
          <Fact label="Pressure" value={view.research.deskInputs.pressure == null ? "No pressure model" : pct(view.research.deskInputs.pressure)} />
          <Fact label="Sentinel quality" value={`${view.research.deskInputs.quality}/100`} />
          <Fact label="Trade readiness" value={view.research.deskInputs.readiness ? "Ready" : state.tradeReadiness.reasons[0] ?? "Stood down"} />
          <Fact label="Strategy impact" value={`${activeStrategies} active · ${eligibleStrategies} eligible`} />
          <Fact label="Causal chain" value={view.research.chain} />
        </dl>
        <div className="analysis-pretext-reasons">
          <div className="analysis-pretext-reasons__head"><span>Representative Strategy reasoning</span><small>actionable and gated rationales first</small></div>
          <ul>
            {strategyReasons.map((row) => (
              <li key={row.design.id}>
                <i style={{ background: row.design.color }} />
                <span><strong>{row.design.name}</strong><small>{row.stance.rationale}</small></span>
                <em className={`decision-kind decision-kind--${row.stance.kind}`}>{decisionLabel(row.stance.kind, row.stance.side)}</em>
                <b className="tnum">{pp(row.stance.edgeVsBook ?? null)}</b>
              </li>
            ))}
          </ul>
        </div>
      </DetailSection>

      <DetailSection
        title="Contract-wise analysis"
        meta={<DetailMeta label={timeframeLabel(comparisonTimeframe)}><TimeframeControl value={comparisonTimeframe} onChange={setComparisonTimeframe} label="Contract analysis timeframe" /></DetailMeta>}
        className="rail-detail-section--wide rail-detail-section--contract-table"
      >
        <div className="rail-detail-table-scroll">
          <table className="rail-detail-table rail-detail-table--contract-analysis">
            <caption>Analysis metrics for every contract without changing the selected contract</caption>
            <thead><tr><th scope="col">Contract</th><th scope="col">Leading view</th><th scope="col">Current</th><th scope="col">Window Δ</th><th scope="col">Range</th><th scope="col">Fair gap</th><th scope="col">Evidence</th><th scope="col">Strategy pretext</th><th scope="col">Path</th></tr></thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.contract} className={row.contract === view.selectedContract ? "is-selected" : ""}>
                  <th scope="row"><strong>{row.label}</strong><small>{row.boundary}</small></th>
                  <td>{row.leadingOutcome}</td>
                  <td className="tnum">{pct(row.current)}</td>
                  <td className={`tnum ${row.delta == null ? "" : row.delta >= 0 ? "is-positive" : "is-negative"}`}>{pp(row.delta)}</td>
                  <td className="tnum">{pp(row.range)}</td>
                  <td className="tnum">{row.fairGap == null ? "not priced" : pp(row.fairGap)}</td>
                  <td className="tnum">{row.evidenceCount}</td>
                  <td title={row.strategyPretext}>{row.strategyPretext}</td>
                  <td>{row.path.length >= 2 ? <Sparkline values={row.path} width={120} height={25} color={row.contract === view.selectedContract ? "var(--lab-analysis)" : "var(--lab-muted)"} ariaLabel={`${row.label} analysis path over ${timeframeLabel(comparisonTimeframe)}`} /> : <span className="rail-detail-no-path">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailSection>

      <DetailSection
        title="Selected contract path"
        meta={<DetailMeta label={chart.subtitle}><TimeframeControl value={pathTimeframe} onChange={setPathTimeframe} label="Selected contract path timeframe" /></DetailMeta>}
        className="rail-detail-section--path rail-detail-section--wide"
      >
        <AnalysisPathChart chart={chart} size="large" timeframe={pathTimeframe} />
        <ChartLegend chart={chart} />
        <p className={chart.traded ? "analysis-agent-hint" : "analysis-reference-note"}>{chart.agentHint}</p>
        {chart.residual && chart.residual.length >= 2 ? <ResidualStrip residual={chart.residual} timeframe={pathTimeframe} /> : null}
      </DetailSection>

      <DetailSection
        title="Driver decomposition"
        meta={<DetailMeta label="odds · hybrid synthesis · tempo · pressure"><TimeframeControl value={driverTimeframe} onChange={setDriverTimeframe} label="Driver decomposition timeframe" /></DetailMeta>}
        className="rail-detail-section--path rail-detail-section--wide"
      >
        <AnalysisPathChart chart={drivers} size="large" timeframe={driverTimeframe} />
        <ChartLegend chart={drivers} />
        <p className="analysis-reference-note">This shows the Analysis inputs Strategies read. Tempo and pressure are context; only a defensible fair-value model can create an executable edge.</p>
      </DetailSection>

      <DetailSection title="Outcome analysis" meta={view.analysis.pricingBoundary ?? view.analysis.referenceStatus}>
        <table className="rail-detail-table rail-detail-table--buckets">
          <caption>Selected contract outcome analysis</caption>
          <thead><tr><th scope="col">Outcome</th><th scope="col">Book</th><th scope="col">Desk</th><th scope="col">Edge</th><th scope="col">Band</th></tr></thead>
          <tbody>{chart.buckets.map((bucket) => <tr key={bucket.key}><th scope="row">{bucket.label}</th><td className="tnum">{pct(bucket.book)}</td><td className="tnum">{pct(bucket.model)}</td><td className={`tnum ${bucket.edge == null ? "" : bucket.edge >= 0 ? "is-positive" : "is-negative"}`}>{pp(bucket.edge)}</td><td><span className={`rail-detail-band rail-detail-band--${bucket.band}`}>{bucket.band}</span></td></tr>)}</tbody>
        </table>
      </DetailSection>

      <DetailSection title="Evidence tape" meta={`${visibleMarkers.length} markers in selected path window`} className="rail-detail-section--evidence">
        {visibleMarkers.length ? <ol className="rail-detail-marker-tape">{visibleMarkers.slice().reverse().map((marker, index) => <li key={`${marker.minute}-${marker.kind}-${index}`}><time className="tnum">{marker.minute.toFixed(0)}′</time><span>{marker.label}</span><em>{marker.tone}</em></li>)}</ol> : <div className="drawer-empty">No contract-relevant evidence in this timeframe.</div>}
      </DetailSection>

      {view.selectedContract === "next_score" ? (
        <DetailSection title="Horizon window" meta={horizon ? `closes ${horizon.closesMinute.toFixed(0)}′` : collapse ? `collapsed ${collapse.minute.toFixed(0)}′` : "not open"} className="rail-detail-section--wide">
          {horizon ? <div className="horizon-detail-summary"><div><span>Thesis</span><strong>{horizon.thesis.replaceAll("_", " ")}</strong></div><div><span>Action</span><strong>{horizon.action.replaceAll("_", " ")}</strong></div><div><span>Support</span><strong className="tnum">{horizon.lowData ? "LOW DATA" : `N=${horizon.support}`}</strong></div><div><span>Source</span><strong>{horizon.source}</strong></div></div> : collapse ? <div className="horizon-detail-summary"><div><span>Winner</span><strong>{collapse.winner.replaceAll("_", " ")}</strong></div><div><span>Verdict</span><strong>{collapse.surprise ? "SURPRISE" : collapse.thesisDead ? "THESIS DEAD" : "THESIS HELD"}</strong></div><div><span>Settling P</span><strong className="tnum">{pct(collapse.settlingProbability)}</strong></div><div><span>Latency</span><strong className="tnum">{collapse.latencyMs}ms</strong></div></div> : <div className="drawer-empty">No Horizon window or completed collapse is available.</div>}
        </DetailSection>
      ) : null}
    </div>
  );
}

function ActDetails({ state, view }: { state: EngineState; view: StrategyLabView }) {
  const [equityTimeframe, setEquityTimeframe] = useState<ChartTimeframe>(30);
  const linePatterns = [undefined, "9 3", "2 3", "12 3 2 3", "5 2", "10 2", "3 2 1 2", "14 4", "8 2 2 2", "4 5", "1 4"];
  const series = view.research.rows.flatMap((row, index) => row.agent ? [{
    name: row.design.name,
    color: row.design.color,
    lineStyle: (["solid", "dashed", "dotted"] as const)[index % 3],
    dashArray: linePatterns[index],
    equity: row.agent.curve,
    minutes: row.agent.curveMinutes,
    markers: row.contractMarkers.map((marker) => ({
      index: marker.index,
      side: marker.side,
      label: `${marker.minute.toFixed(0)}′ ${row.design.name} ${marker.side} ${marker.size} ${marker.selectionKey} · ${marker.rationale}`,
    })),
  }] : []);
  const fills = view.research.rows.flatMap((row) => row.contractMarkers.map((marker, index) => ({ row, marker, id: `${row.design.id}-${marker.minute}-${marker.selectionKey}-${index}` }))).sort((a, b) => b.marker.minute - a.marker.minute);
  const buys = fills.filter(({ marker }) => marker.side === "buy");
  const sells = fills.filter(({ marker }) => marker.side === "sell");
  const active = view.research.rows.filter((row) => row.stance.kind === "trade" || row.stance.kind === "quote");
  const contractPnl = view.research.rows.reduce((sum, row) => sum + row.contractPnl, 0);
  const totalPnl = view.research.rows.reduce((sum, row) => sum + row.totalPnl, 0);
  const exposure = view.research.rows.reduce((sum, row) => sum + row.contractExposure, 0);
  return (
    <div className="rail-detail-stack">
      <DetailSection title="Execution state" meta={`${ODDS_VIEW_LABELS[view.selectedContract]} · ${state.executionMode}`} className="rail-detail-section--wide">
        <dl className="execution-summary">
          <Fact label="Active now" value={`${active.length} of ${view.research.rows.length} strategies`} />
          <Fact label="Buy fills" value={`${buys.length} · ${units(buys.map(({ marker }) => marker.size))} units`} />
          <Fact label="Sell fills" value={`${sells.length} · ${units(sells.map(({ marker }) => marker.size))} units`} />
          <Fact label="Contract exposure" value={exposure.toFixed(1)} />
          <Fact label="Contract PnL" value={signed(contractPnl)} />
          <Fact label="Whole-book PnL" value={signed(totalPnl)} />
        </dl>
      </DetailSection>

      <DetailSection title="Decision board" meta="current stance, size, edge, and reason" className="rail-detail-section--wide">
        <div className="rail-detail-table-scroll">
          <table className="rail-detail-table rail-detail-table--decisions">
            <caption>Current strategy decisions on the selected contract</caption>
            <thead><tr><th scope="col">Strategy</th><th scope="col">Decision</th><th scope="col">Edge</th><th scope="col">Size</th><th scope="col">Exposure</th><th scope="col">Contract PnL</th><th scope="col">Reason</th></tr></thead>
            <tbody>
              {view.research.rows.map((row) => (
                <tr key={row.design.id}>
                  <th scope="row"><i style={{ background: row.design.color }} />{row.design.name}</th>
                  <td><span className={`decision-kind decision-kind--${row.stance.kind}`}>{decisionLabel(row.stance.kind, row.stance.side)}</span></td>
                  <td className="tnum">{pp(row.stance.edgeVsBook ?? null)}</td>
                  <td className="tnum">{row.stance.size == null ? "—" : row.stance.size.toFixed(1)}</td>
                  <td className="tnum">{row.contractExposure.toFixed(1)}</td>
                  <td className={`tnum ${row.contractPnl >= 0 ? "is-positive" : "is-negative"}`}>{signed(row.contractPnl)}</td>
                  <td title={row.stance.rationale}>{row.stance.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailSection>

      <DetailSection title="Equity and selected-contract fills" meta={<DetailMeta label={`${series.length} strategy paths · ${timeframeLabel(equityTimeframe)}`}><TimeframeControl value={equityTimeframe} onChange={setEquityTimeframe} label="Expanded equity timeframe" /></DetailMeta>} className="rail-detail-section--equity rail-detail-section--wide">
        <EquityChart series={series} width={820} height={300} baseline={state.config.execution.bankroll} ariaLabel={`${ODDS_VIEW_LABELS[view.selectedContract]} strategy equity paths with contract fill markers`} timeframe={equityTimeframe} />
        <div className="act-equity-legend">
          {series.map((item) => <span key={item.name}><svg viewBox="0 0 18 4" aria-hidden="true"><line x1="0" y1="2" x2="18" y2="2" stroke={item.color} strokeWidth="2" strokeDasharray={item.dashArray} /></svg>{item.name}</span>)}
        </div>
        <p className="rail-detail-note">Equity is tick-sampled and plotted on its recorded match-minute coordinates; each window ends at the latest retained sample.</p>
      </DetailSection>

      <DetailSection title="Fill tape" meta={`${fills.length} selected-contract executions`} className="rail-detail-section--fills">
        {fills.length ? (
          <ol className="execution-fill-tape">
            {fills.map(({ row, marker, id }) => (
              <li key={id}>
                <time className="tnum">{marker.minute.toFixed(0)}′</time>
                <i style={{ background: row.design.color }} />
                <span><strong>{row.design.name}</strong><small>{marker.selectionKey} · {marker.rationale}</small></span>
                <em className={`fill-side fill-side--${marker.side}`}>{marker.side} {marker.size}</em>
              </li>
            ))}
          </ol>
        ) : <div className="drawer-empty">No fills on this contract. The decision board still shows who is gated, flat, or analysis-only.</div>}
      </DetailSection>

      <DetailSection title="PnL attribution" meta="realized, unrealized, exposure, and whole-book total" className="rail-detail-section--attribution">
        <div className="rail-detail-table-scroll">
          <table className="rail-detail-table rail-detail-table--attribution">
            <caption>Strategy contract PnL attribution</caption>
            <thead><tr><th scope="col">Strategy</th><th scope="col">Contract</th><th scope="col">Realized</th><th scope="col">Unrealized</th><th scope="col">Total</th><th scope="col">Fills</th><th scope="col">Exposure</th></tr></thead>
            <tbody>
              {view.research.rows.map((row) => {
                const slice = row.agent?.contractPnl.find((item) => item.marketType === view.research.marketType);
                return (
                  <tr key={row.design.id}>
                    <th scope="row"><i style={{ background: row.design.color }} />{row.design.name}</th>
                    <td className={`tnum ${row.contractPnl >= 0 ? "is-positive" : "is-negative"}`}>{signed(row.contractPnl)}</td>
                    <td className="tnum">{signed(slice?.realized ?? 0)}</td>
                    <td className="tnum">{signed(slice?.unrealized ?? 0)}</td>
                    <td className={`tnum ${row.totalPnl >= 0 ? "is-positive" : "is-negative"}`}>{signed(row.totalPnl)}</td>
                    <td className="tnum">{row.contractTrades}</td>
                    <td className="tnum">{row.contractExposure.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DetailSection>

      <DetailSection title="A/B lifts" meta="versus Value where applicable" className="rail-detail-section--wide">
        <div className="rail-detail-lifts">
          {view.strategy.lifts.map((lift) => (
            <div key={lift.id}><span>{lift.label}</span><strong className={`tnum ${lift.value == null ? "" : lift.value >= 0 ? "is-positive" : "is-negative"}`}>{lift.value == null ? "—" : signed(lift.value)}</strong></div>
          ))}
          <div><span>Stood down</span><strong className="tnum">{state.scorecard.stoodDownCount}</strong></div>
        </div>
      </DetailSection>
    </div>
  );
}

type MovementRow = {
  id: string;
  contract: OddsViewId;
  contractLabel: string;
  selectionLabel: string;
  current: number;
  delta: number;
  min: number;
  max: number;
  minute: number;
  path: number[];
};

function marketMovement(state: EngineState, timeframe: ChartTimeframe): MovementRow[] {
  return ODDS_VIEW_ORDER.flatMap((contract) => {
    const samples = windowMinutePoints(state.shockStrip.odds.views[contract].points, timeframe);
    const latest = samples.at(-1);
    if (!latest) return [];
    const favoriteLabel = latest.favorite === "home" ? state.fixture.homeCode : latest.favorite === "away" ? state.fixture.awayCode : "Favorite";
    const currentSelections = latest.selections.length
      ? latest.selections
      : latest.favoriteProb == null ? [] : [{ key: "favorite", label: favoriteLabel, prob: latest.favoriteProb }];
    return currentSelections.map((selection) => {
      const path = samples.flatMap((sample) => {
        if (selection.key === "favorite") return sample.favoriteProb == null ? [] : [sample.favoriteProb];
        const point = sample.selections.find((candidate) => candidate.key === selection.key);
        return point ? [point.prob] : [];
      });
      const current = path.at(-1) ?? selection.prob;
      return {
        id: `${contract}-${selection.key}`,
        contract,
        contractLabel: ODDS_VIEW_LABELS[contract],
        selectionLabel: selection.label,
        current,
        delta: current - (path[0] ?? current),
        min: Math.min(...path, current),
        max: Math.max(...path, current),
        minute: latest.minute,
        path,
      };
    });
  });
}

function changeLedger(view: StrategyLabView, movement: MovementRow[]) {
  const events = view.observation.events.map((event) => ({
    id: event.id,
    minute: event.minute,
    label: event.label,
    source: event.source === "txline" ? "TxLINE match event" : "Tempo enrichment",
    change: event.kind.replaceAll("_", " "),
    tone: "",
  }));
  const odds = movement.filter((row) => Math.abs(row.delta) >= 0.001).map((row) => ({
    id: `odds-${row.id}`,
    minute: row.minute,
    label: `${row.contractLabel} · ${row.selectionLabel}`,
    source: "Observed odds window",
    change: pp(row.delta),
    tone: row.delta > 0 ? "is-positive" : "is-negative",
  }));
  return [...events, ...odds].sort((a, b) => b.minute - a.minute);
}

function strongestBucket(view: StrategyLabView) {
  return view.analysis.chart.buckets.reduce<StrategyLabView["analysis"]["chart"]["buckets"][number] | null>((best, bucket) => {
    if (!best) return bucket;
    return Math.abs(bucket.edge ?? 0) > Math.abs(best.edge ?? 0) ? bucket : best;
  }, null);
}

function leadingBucket(view: StrategyLabView) {
  return view.analysis.chart.buckets.reduce<StrategyLabView["analysis"]["chart"]["buckets"][number] | null>((best, bucket) => {
    const value = bucket.model ?? bucket.book ?? 0;
    const bestValue = best?.model ?? best?.book ?? 0;
    return !best || value > bestValue ? bucket : best;
  }, null);
}

function primarySeriesPoints(view: StrategyLabView, bucketKey: string | undefined): Array<{ minute: number; value: number }> {
  const preferred = bucketKey
    ? view.analysis.chart.series.find((series) => series.id === bucketKey || series.id === `book_${bucketKey}` || series.id === `fair_${bucketKey}` || series.id === `p_${bucketKey}`)
    : view.analysis.chart.series[0];
  return preferred?.points ?? [];
}

type ContractAnalysisRow = {
  contract: OddsViewId;
  label: string;
  boundary: string;
  leadingOutcome: string;
  current: number | null;
  delta: number | null;
  range: number | null;
  fairGap: number | null;
  evidenceCount: number;
  strategyPretext: string;
  path: number[];
};

function contractAnalysisRow(view: StrategyLabView, timeframe: ChartTimeframe): ContractAnalysisRow {
  const leading = leadingBucket(view);
  const points = windowMinutePoints(primarySeriesPoints(view, leading?.key), timeframe);
  const path = points.map((point) => point.value);
  const current = path.at(-1) ?? leading?.book ?? leading?.model ?? null;
  const delta = path.length >= 2 ? path.at(-1)! - path[0] : null;
  const range = path.length >= 2 ? Math.max(...path) - Math.min(...path) : null;
  const latestMinute = points.at(-1)?.minute ?? 0;
  const evidenceCount = view.analysis.chart.markers.filter((marker) => marker.minute >= timeframeStart(latestMinute, timeframe)).length;
  const active = view.strategy.rows.filter((row) => row.stance.kind === "trade" || row.stance.kind === "quote").length;
  const representative = prioritizedStrategyReasons(view)[0];
  const status = active ? `${active} active` : representative ? decisionLabel(representative.stance.kind, representative.stance.side) : "analysis only";
  return {
    contract: view.selectedContract,
    label: ODDS_VIEW_LABELS[view.selectedContract],
    boundary: analysisBoundary(view),
    leadingOutcome: leading?.label ?? "Awaiting line",
    current,
    delta,
    range,
    fairGap: view.analysis.deck.source === "desk_1x2" ? strongestBucket(view)?.edge ?? null : null,
    evidenceCount,
    strategyPretext: representative ? `${status} · ${representative.design.name}: ${representative.stance.rationale}` : "Analysis context only",
    path,
  };
}

function prioritizedStrategyReasons(view: StrategyLabView) {
  const priority: Record<StrategyLabView["strategy"]["rows"][number]["stance"]["kind"], number> = {
    trade: 0,
    quote: 1,
    stand_down: 2,
    no_model: 3,
    ineligible: 4,
    flat: 5,
  };
  return view.strategy.rows
    .filter((row) => row.stance.rationale)
    .slice()
    .sort((left, right) => priority[left.stance.kind] - priority[right.stance.kind]);
}

function analysisBoundary(view: StrategyLabView): string {
  if (view.analysis.deck.source === "unavailable") return "No observed market";
  if (view.analysis.deck.source === "desk_1x2") return "Desk fair vs observed book";
  if (view.analysis.deck.source === "horizon") return "Horizon Analysis model";
  if (view.analysis.chart.traded) return "Observed path · executable Contract";
  return "Observed path · no fair-value model";
}

function driverDecompositionChart(state: EngineState, view: StrategyLabView): AnalysisChart {
  const samples = state.shockStrip.strategies[view.selectedContract].series;
  return {
    mode: view.analysis.chart.mode,
    title: `${ODDS_VIEW_LABELS[view.selectedContract]} drivers`,
    subtitle: "Normalized Analysis inputs read by Strategies",
    yLabel: "Normalized value",
    yMin: 0,
    yMax: 1,
    series: [
      { id: "driver_odds", label: "Observed odds", role: "book", points: samples.map((point) => ({ minute: point.minute, value: point.oddsProb })) },
      { id: "driver_hybrid", label: "Hybrid synthesis", role: "model", points: samples.map((point) => ({ minute: point.minute, value: point.hybridProb })) },
      { id: "driver_tempo", label: "Tempo context", role: "aux", points: samples.map((point) => ({ minute: point.minute, value: point.tempoIntensity })) },
      { id: "driver_pressure", label: "Pressure", role: "signal", points: samples.map((point) => ({ minute: point.minute, value: point.pressure })) },
    ],
    buckets: [],
    markers: view.analysis.chart.markers.filter((marker) => marker.tone !== "fill"),
    residual: null,
    agentHint: "Driver decomposition is Analysis context. It is not a fair-value model by itself.",
    traded: view.analysis.chart.traded,
  };
}

function decisionLabel(kind: StrategyLabView["strategy"]["rows"][number]["stance"]["kind"], side?: "buy" | "sell") {
  if (kind === "trade") return side ? `${side} trade` : "trade";
  if (kind === "quote") return "quote";
  if (kind === "stand_down") return "stand down";
  if (kind === "no_model") return "no model";
  return kind;
}

function ChartLegend({ chart }: { chart: AnalysisChart }) {
  return (
    <div className="timeline-legend rail-detail-legend">
      {chart.series.map((series) => <span key={series.id}><i className={`series-swatch series-swatch--${series.role}`} />{series.label}</span>)}
      {chart.markers.some((marker) => marker.tone === "event") ? <span><i className="goal" />Events</span> : null}
      {chart.markers.some((marker) => marker.tone === "fill") ? <span><i className="fill" />Fills</span> : null}
      {chart.markers.some((marker) => marker.tone === "signal") ? <span><i className="signal" />Signals</span> : null}
    </div>
  );
}

function DetailMeta({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="detail-meta"><span>{label}</span>{children}</div>;
}

function DetailSection({ title, meta, className = "", children }: { title: string; meta: React.ReactNode; className?: string; children: React.ReactNode }) {
  return <section className={`rail-detail-section ${className}`}><header><h2>{title}</h2><div className="rail-detail-section__meta">{meta}</div></header><div className="rail-detail-section__body">{children}</div></section>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function age(value: number | null): string {
  if (value == null) return "—";
  if (value < 1000) return "now";
  return `${Math.round(value / 1000)}s`;
}

function pct(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function pp(value: number | null): string {
  if (value == null) return "—";
  const amount = value * 100;
  return `${amount >= 0 ? "+" : ""}${amount.toFixed(1)}pp`;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function units(values: number[]): string {
  return values.reduce((sum, value) => sum + value, 0).toFixed(1);
}
