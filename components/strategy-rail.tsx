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
import type { StrategyStanceKind } from "@/lib/strategy-lab/designs";
import { Sparkline } from "@/components/charts";

export function StrategyRail({ state, view }: { state: EngineState; view: StrategyLabView }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = view.strategy.rows.find((row) => row.design.id === selectedId) ?? null;
  return (
    <section className="lab-rail lab-rail--strategy" aria-labelledby="strategy-title">
      <header className="rail-heading">
        <span className="rail-number">3</span>
        <div><span>ACT</span><h2 id="strategy-title">What will each strategy do?</h2><p>Stance on this contract · shadow execution.</p></div>
      </header>

      <div className="stance-board" aria-label="Seven strategy stances">
        <div className="stance-board__head"><span>Strategy</span><span>Stance</span><span>Edge / size</span></div>
        {view.strategy.rows.map((row) => (
          <button
            type="button"
            className={`stance-row stance-row--${row.stance.kind}`}
            key={row.design.id}
            onClick={() => setSelectedId(row.design.id)}
            aria-label={`${row.design.name}: ${stanceLabel(row.stance.kind)}. ${row.stance.rationale}`}
          >
            <span className="stance-strategy"><i style={{ background: row.design.color }} /><strong>{row.design.name}</strong><small>{row.stance.rationale}</small></span>
            <span className="stance-action"><StanceIcon kind={row.stance.kind} side={row.stance.side} /><strong>{stanceLabel(row.stance.kind)}</strong>{row.stance.side ? <small>{row.stance.side}</small> : null}</span>
            <span className="stance-numbers tnum"><strong>{pp(row.stance.edgeVsBook)}</strong><small>{row.stance.size ? `${row.stance.size} units` : eligibilityLabel(row.stance.kind)}</small></span>
          </button>
        ))}
      </div>

      <div className="arena-compact">
        <div className="arena-compact__head">
          <div><span>Session scoreboard</span><small>{state.agents.length} strategies · {state.executionMode} PnL</small></div>
          <div><strong>{state.scorecard.leaderName ?? "—"}</strong><span>leads {signed(state.scorecard.leaderPnl)}</span></div>
          <div><strong>Sentinel A/B</strong><span>{signed(state.scorecard.guardedEdge ?? 0)}</span></div>
        </div>
        <div className="arena-grid" role="table" aria-label="Strategy performance scoreboard">
          <div role="row" className="arena-row arena-row--head"><span>Name</span><span>Equity</span><span>PnL</span><span>Trades</span><span>Drawdown</span><span>Path</span></div>
          {view.strategy.rows.map(({ design, agent }) => agent ? (
            <button type="button" role="row" className={`arena-row ${state.leader === agent.id ? "is-leader" : ""}`} key={agent.id} onClick={() => setSelectedId(agent.id)}>
              <span><i style={{ background: design.color }} />{design.name}</span>
              <span className="tnum">{agent.metrics.equity.toFixed(0)}</span>
              <span className={`tnum ${agent.metrics.pnl >= 0 ? "is-positive" : "is-negative"}`}>{signed(agent.metrics.pnl)}</span>
              <span className="tnum">{agent.metrics.trades}</span>
              <span className="tnum">{agent.metrics.maxDrawdown.toFixed(1)}</span>
              <span><Sparkline values={agent.curve} color={design.color} width={68} height={18} /></span>
            </button>
          ) : null)}
        </div>
      </div>

      <div className="stance-live" aria-live="polite" aria-atomic="true">
        {view.strategy.rows.filter((row) => row.stance.kind === "trade" || row.stance.kind === "quote").map((row) => `${row.design.name} ${stanceLabel(row.stance.kind)}`).join(". ")}
      </div>

      {selected ? <StrategyInspector row={selected} onClose={() => setSelectedId(null)} /> : null}
    </section>
  );
}

function StrategyInspector({ row, onClose }: { row: StrategyLabView["strategy"]["rows"][number]; onClose: () => void }) {
  return (
    <aside className="strategy-inspector" aria-label={`${row.design.name} design inspector`}>
      <div className="strategy-inspector__head"><div><i style={{ background: row.design.color }} /><span>Strategy design</span><h3>{row.design.name}</h3></div><button type="button" onClick={onClose} aria-label="Close strategy inspector"><X size={18} /></button></div>
      <div className="inspector-stance"><StanceIcon kind={row.stance.kind} side={row.stance.side} /><div><span>Current stance</span><strong>{stanceLabel(row.stance.kind)} {row.stance.side?.toUpperCase()}</strong><p>{row.stance.rationale}</p></div></div>
      <InspectorBlock title="Stance rule"><p>{row.design.stanceRule}</p></InspectorBlock>
      <InspectorBlock title="Observations read"><TagList values={row.design.reads.observations} /></InspectorBlock>
      <InspectorBlock title="Analysis read"><TagList values={row.design.reads.analysis} /></InspectorBlock>
      <InspectorBlock title="Contract authority">
        <p>Eligible: {row.design.eligibleContracts.join(", ")}</p>
        <p>Fillable now: {row.design.fillableNow.join(", ")}</p>
      </InspectorBlock>
      <InspectorBlock title="Stand-down conditions"><ul>{row.design.standDownWhen.map((condition) => <li key={condition}>{condition}</li>)}</ul></InspectorBlock>
      <InspectorBlock title="Positions and last decision"><p>{row.agent?.positions.length ? row.agent.positions.map((position) => `${position.label} ${position.net}`).join(" · ") : "No open positions"}</p><p>{row.agent?.lastRationale ?? "No decision yet"}</p></InspectorBlock>
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

