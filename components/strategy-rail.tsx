"use client";

import { useState } from "react";
import {
  Ban,
  CircleDollarSign,
  CircleOff,
  Equal,
  FileQuestion,
  MessageSquareQuote,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import type { EngineState } from "@/lib/engine/state";
import type { StrategyLabView } from "@/lib/strategy-lab/projection";
import type { StrategyDesign, StrategyStanceKind } from "@/lib/strategy-lab/designs";
import { Sparkline } from "@/components/charts";
import { TimeframeControl, windowTimedValues, type ChartTimeframe } from "@/components/chart-timeframe";
import { RailHeading } from "@/components/rail-heading";

export function StrategyRail({
  state,
  view,
  onExpand,
  onEvidence,
}: {
  state: EngineState;
  view: StrategyLabView;
  onExpand: () => void;
  onEvidence: (strategyId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [family, setFamily] = useState<"all" | "core" | "event" | "meta">("all");
  const [equityTimeframe, setEquityTimeframe] = useState<ChartTimeframe>(15);
  const selected = view.strategy.rows.find((row) => row.design.id === selectedId) ?? null;
  const filteredRows = view.strategy.rows.filter((row) => matchesFamily(row.design, family));
  const ranked = [...filteredRows]
    .filter((row) => row.agent)
    .sort((a, b) => (b.agent?.metrics.equity ?? 0) - (a.agent?.metrics.equity ?? 0));
  const liveStances = filteredRows.filter((row) => row.stance.kind === "trade" || row.stance.kind === "quote");
  const regime = state.scorecard.regime;

  return (
    <section className="lab-rail lab-rail--strategy" aria-labelledby="strategy-title">
      <RailHeading
        number="3"
        verb="ACT"
        title="Who is winning — and what will they do?"
        description="Session PnL competition · not contract analysis. Analysis rail owns buckets / paths."
        id="strategy-title"
        onExpand={onExpand}
      />

      <div className="arena-compact">
        <div className="arena-compact__head">
          <div>
            <span>Session scoreboard</span>
            <small>
              Equity / fills competition · {state.agents.length} strategies · {state.executionMode} · regime {regime}
            </small>
          </div>
          <div>
            <strong>{state.scorecard.leaderName ?? "—"}</strong>
            <span>leads {signed(state.scorecard.leaderPnl)}</span>
          </div>
          <div className="arena-timeframe">
            <TimeframeControl value={equityTimeframe} onChange={setEquityTimeframe} label="Compact equity timeframe" />
          </div>
        </div>

        <div className="arena-lifts" aria-label="Strategy A/B lifts versus Value">
          {view.strategy.lifts.map((lift) => (
            <div key={lift.id} className="arena-lift">
              <strong>{lift.label}</strong>
              <span className={lift.value == null ? "" : lift.value >= 0 ? "is-positive" : "is-negative"}>
                {lift.value == null ? "—" : signed(lift.value)}
              </span>
            </div>
          ))}
          <div className="arena-lift">
            <strong>Stood down</strong>
            <span className="tnum">{state.scorecard.stoodDownCount}</span>
          </div>
        </div>

        <div className="arena-family" role="tablist" aria-label="Strategy family filter">
          {([
            ["all", "All"],
            ["core", "Core"],
            ["event", "Event"],
            ["meta", "Meta"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={family === id}
              className={family === id ? "is-active" : ""}
              onClick={() => setFamily(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="arena-grid" role="table" aria-label="Strategy performance scoreboard">
          <div role="row" className="arena-row arena-row--head">
            <span>Name</span><span>Equity</span><span>PnL</span><span>Trades</span><span>Drawdown</span><span>Path</span>
          </div>
          {ranked.map(({ design, agent }) => agent ? (
            <button
              type="button"
              role="row"
              className={`arena-row ${state.leader === agent.id ? "is-leader" : ""} ${selectedId === agent.id ? "is-selected" : ""}`}
              key={agent.id}
              onClick={() => setSelectedId(agent.id)}
              title={`${design.name}: equity ${agent.metrics.equity.toFixed(0)}, PnL ${signed(agent.metrics.pnl)}, ${agent.metrics.trades} trades`}
            >
              <span><i style={{ background: design.color }} />{design.name}</span>
              <span className="tnum">{agent.metrics.equity.toFixed(0)}</span>
              <span className={`tnum ${agent.metrics.pnl >= 0 ? "is-positive" : "is-negative"}`}>{signed(agent.metrics.pnl)}</span>
              <span className="tnum">{agent.metrics.trades}</span>
              <span className="tnum">{agent.metrics.maxDrawdown.toFixed(1)}</span>
              <span><Sparkline values={windowTimedValues(agent.curve, agent.curveMinutes, equityTimeframe).values} color={design.color} width={68} height={18} ariaLabel={`${design.name} equity over selected timeframe`} /></span>
            </button>
          ) : null)}
        </div>
      </div>

      <div className="stance-board" aria-label="Strategy stances on selected contract">
        <div className="stance-board__intro">
          <div>
            <span>Contract stances</span>
            <strong>{view.selectedContract.replaceAll("_", " ")}</strong>
          </div>
          <small>{liveStances.length ? `${liveStances.length} active` : "All flat / gated"}</small>
        </div>
        <div className="stance-board__head"><span>Strategy</span><span>Stance</span><span>Edge / size</span></div>
        {filteredRows.map((row) => (
          <button
            type="button"
            className={`stance-row stance-row--${row.stance.kind} ${selectedId === row.design.id ? "is-selected" : ""}`}
            key={row.design.id}
            onClick={() => setSelectedId(row.design.id)}
            aria-label={`${row.design.name}: ${stanceLabel(row.stance.kind)}. ${row.stance.rationale}`}
            title={row.stance.rationale}
          >
            <span className="stance-strategy">
              <i style={{ background: row.design.color }} />
              <strong>{row.design.name}</strong>
              <small>{row.stance.rationale}</small>
            </span>
            <span className="stance-action">
              <StanceIcon kind={row.stance.kind} side={row.stance.side} />
              <strong>{stanceLabel(row.stance.kind)}</strong>
              {row.stance.side ? <small>{row.stance.side}</small> : null}
            </span>
            <span className="stance-numbers tnum">
              <strong>{pp(row.stance.edgeVsBook)}</strong>
              <small>{row.stance.size ? `${row.stance.size} units` : eligibilityLabel(row.stance.kind)}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="event-desk" aria-label="Event specialists this session">
        <div className="event-desk__head">
          <span>Event / microstructure tape</span>
          <small>Specialist PnL this session</small>
        </div>
        <div className="event-desk__grid">
          <EventChip label="Goal fade" trades={state.scorecard.goalOverreactionTrades} pnl={state.scorecard.goalOverreactionPnl} />
          <EventChip label="Shock fade" trades={state.scorecard.shockFadeTrades} pnl={state.scorecard.shockFadePnl} />
          <EventChip label="Stale reopen" trades={state.scorecard.staleReopenTrades} pnl={state.scorecard.staleReopenPnl} />
          <EventChip label="Collapse fade" trades={state.scorecard.collapseFadeTrades} pnl={state.scorecard.collapseFadePnl} />
        </div>
      </div>

      <div className="stance-live" aria-live="polite" aria-atomic="true">
        {liveStances.map((row) => `${row.design.name} ${stanceLabel(row.stance.kind)}`).join(". ")}
      </div>

      {selected ? (
        <StrategyInspector
          row={selected}
          attribution={view.research.rows.find((entry) => entry.design.id === selected.design.id) ?? null}
          contractLabel={view.selectedContract.replaceAll("_", " ")}
          onClose={() => setSelectedId(null)}
          onEvidence={() => onEvidence(selected.design.id)}
        />
      ) : null}
    </section>
  );
}

function EventChip({ label, trades, pnl }: { label: string; trades: number; pnl: number }) {
  return (
    <div className="event-chip">
      <span>{label}</span>
      <strong className={pnl >= 0 ? "is-positive" : "is-negative"}>{signed(pnl)}</strong>
      <small className="tnum">{trades} fills</small>
    </div>
  );
}

function matchesFamily(design: StrategyDesign, family: "all" | "core" | "event" | "meta"): boolean {
  return family === "all" || design.families.includes(family);
}

function StrategyInspector({
  row,
  attribution,
  contractLabel,
  onClose,
  onEvidence,
}: {
  row: StrategyLabView["strategy"]["rows"][number];
  attribution: StrategyLabView["research"]["rows"][number] | null;
  contractLabel: string;
  onClose: () => void;
  onEvidence: () => void;
}) {
  return (
    <aside className="strategy-inspector" aria-label={`${row.design.name} design inspector`}>
      <div className="strategy-inspector__head">
        <div>
          <i style={{ background: row.design.color }} />
          <span>Strategy design</span>
          <h3>{row.design.name}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close strategy inspector"><X size={18} /></button>
      </div>
      <div className="inspector-stance">
        <StanceIcon kind={row.stance.kind} side={row.stance.side} />
        <div>
          <span>Current stance</span>
          <strong>{stanceLabel(row.stance.kind)} {row.stance.side?.toUpperCase()}</strong>
          <p>{row.stance.rationale}</p>
        </div>
      </div>
      {attribution ? (
        <InspectorBlock title={`PnL on ${contractLabel}`}>
          <p>
            Contract {signed(attribution.contractPnl)} · Total {signed(attribution.totalPnl)} ·{" "}
            {attribution.contractTrades} fills here
          </p>
          {attribution.lastDriver ? <p>Driver · {attribution.lastDriver}</p> : null}
          {attribution.contractMarkers.length > 0 ? (
            <ul className="inspector-fill-tape">
              {attribution.contractMarkers.slice(-4).reverse().map((marker, index) => (
                <li key={`${marker.minute}-${marker.selectionKey}-${index}`}>
                  {marker.minute.toFixed(0)}′ {marker.side} {marker.size} {marker.selectionKey} — {marker.rationale}
                </li>
              ))}
            </ul>
          ) : (
            <p>No fills on this contract yet.</p>
          )}
        </InspectorBlock>
      ) : null}
      <InspectorBlock title="Stance rule"><p>{row.design.stanceRule}</p></InspectorBlock>
      <InspectorBlock title="Observations read"><TagList values={row.design.reads.observations} /></InspectorBlock>
      <InspectorBlock title="Analysis read"><TagList values={row.design.reads.analysis} /></InspectorBlock>
      <InspectorBlock title="Contract authority">
        <p>Eligible: {row.design.eligibleContracts.join(", ")}</p>
        <p>Fillable now: {row.design.fillableNow.join(", ")}</p>
      </InspectorBlock>
      <InspectorBlock title="Stand-down conditions">
        <ul>{row.design.standDownWhen.map((condition) => <li key={condition}>{condition}</li>)}</ul>
      </InspectorBlock>
      <InspectorBlock title="Positions and last decision">
        <p>{row.agent?.positions.length ? row.agent.positions.map((position) => `${position.label} ${position.net}`).join(" · ") : "No open positions"}</p>
        <p>{row.agent?.lastRationale ?? "No decision yet"}</p>
      </InspectorBlock>
      <button className="btn" type="button" onClick={onEvidence}>Open Decision Receipt</button>
    </aside>
  );
}

function InspectorBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h4>{title}</h4>{children}</section>;
}

function TagList({ values }: { values: string[] }) {
  return <div className="inspector-tags">{values.map((value) => <span key={value}>{value}</span>)}</div>;
}

function StanceIcon({ kind, side }: { kind: StrategyStanceKind; side?: "buy" | "sell" }) {
  if (kind === "trade") return side === "sell" ? <TrendingDown size={15} /> : <TrendingUp size={15} />;
  if (kind === "quote") return <MessageSquareQuote size={15} />;
  if (kind === "stand_down") return <Ban size={15} />;
  if (kind === "flat") return <Equal size={15} />;
  if (kind === "no_model") return <FileQuestion size={15} />;
  if (kind === "ineligible") return <CircleOff size={15} />;
  return <CircleDollarSign size={15} />;
}

function stanceLabel(kind: StrategyStanceKind): string {
  return kind.replaceAll("_", " ").toUpperCase();
}

function eligibilityLabel(kind: StrategyStanceKind): string {
  if (kind === "no_model") return "no fill path";
  if (kind === "ineligible") return "not designed";
  if (kind === "flat") return "eligible";
  if (kind === "stand_down") return "gated";
  return "";
}

function pp(value: number | null | undefined): string {
  if (value == null) return "—";
  const amount = value * 100;
  return `${amount >= 0 ? "+" : ""}${amount.toFixed(1)}pp`;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}
