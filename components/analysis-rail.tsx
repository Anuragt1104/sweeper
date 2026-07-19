"use client";

import { AlertTriangle, CheckCircle2, Clock3, Gauge, GitCompareArrows, Shield } from "lucide-react";
import type { EngineState } from "@/lib/engine/state";
import type { StrategyLabView } from "@/lib/strategy-lab/projection";

export function AnalysisRail({ state, view }: { state: EngineState; view: StrategyLabView }) {
  const deck = view.analysis.deck;
  const collapse = state.horizon.lastCollapse;
  return (
    <section className="lab-rail lab-rail--analysis" aria-labelledby="analysis-title">
      <header className="rail-heading">
        <span className="rail-number">2</span>
        <div><span>INTERPRET</span><h2 id="analysis-title">What does the desk infer?</h2><p>Models computed by the desk.</p></div>
      </header>

      <div className="analysis-focus">
        <div className="analysis-focus__head">
          <div><span>{deck.title}</span><strong>{deck.subtitle}</strong></div>
          {deck.remainingMinutes != null ? <div className="horizon-countdown"><Clock3 size={13} /><span>closes in</span><strong className="tnum">{deck.remainingMinutes.toFixed(1)}′</strong></div> : null}
        </div>

        {view.analysis.pricingBoundary ? (
          <div className="pricing-boundary"><AlertTriangle size={14} aria-hidden="true" /><strong>{view.analysis.pricingBoundary.split(" · ")[0]}</strong><span>{view.analysis.pricingBoundary.split(" · ")[1]}</span></div>
        ) : null}

        <div className={`analysis-outs analysis-outs--${deck.outs.length}`} key={collapse?.id ?? deck.viewId}>
          {deck.outs.map((out) => {
            const edge = out.bookProb != null && out.modelProb != null ? out.modelProb - out.bookProb : null;
            return (
              <div className={`analysis-out analysis-out--${out.tone} ${out.thesis ? "is-thesis" : ""}`} key={out.key}>
                <div className="analysis-out__label"><strong>{out.label}</strong><span>{out.thesis ? "THESIS" : out.action ? "ACTION" : ""}</span></div>
                <div className="analysis-out__value tnum">{Math.round(out.displayProb * 100)}<small>%</small></div>
                <ProbabilityGap book={out.bookProb} fair={out.modelProb} />
                <div className="analysis-out__legend">
                  <span>BOOK <b className="tnum">{pct(out.bookProb)}</b></span>
                  <span>DESK <b className="tnum">{pct(out.modelProb)}</b></span>
                  <span className={edge == null ? "" : edge >= 0 ? "is-positive" : "is-negative"}>EDGE <b className="tnum">{pp(edge)}</b></span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="analysis-provenance">
          <span>{deck.detail}</span>
          {state.horizon.current && deck.viewId === "next_score" ? (
            <span>{state.horizon.current.source} · {state.horizon.current.lowData ? "LOW DATA" : `N=${state.horizon.current.support}`}</span>
          ) : null}
        </div>
      </div>

      <div className="analysis-ribbon" aria-label="Desk model state">
        <Ribbon icon={<Gauge size={14} />} label="Intensity" value={view.analysis.intensity} />
        <Ribbon icon={<GitCompareArrows size={14} />} label="Regime" value={view.analysis.regime} />
        <Ribbon icon={<Shield size={14} />} label="Sentinel" value={`${view.analysis.quality}/100`} />
        <Ribbon icon={<CheckCircle2 size={14} />} label="Desk" value={view.analysis.readiness ? "ready" : "stand down"} />
      </div>

      <div className="focused-timeline">
        <div className="rail-section__head"><span>Selected-contract path</span><small>Observed book{view.selectedContract === "match_1x2" ? " · desk reference" : ""}</small></div>
        <Timeline points={view.analysis.timeline} collapseMinute={state.horizon.lastCollapse?.minute ?? null} />
        <div className="timeline-legend"><span><i className="book" />Observed</span>{view.selectedContract === "match_1x2" ? <span><i className="desk" />Desk reference</span> : null}{collapse ? <span><i className="collapse" />Collapse {collapse.minute.toFixed(0)}′</span> : null}</div>
      </div>

      {collapse ? (
        <div className="collapse-manifest" key={collapse.id} aria-live="polite">
          <span>HORIZON COLLAPSE · {collapse.minute.toFixed(0)}′</span>
          <strong>{collapse.winner.replaceAll("_", " ")}</strong>
          <em>{collapse.surprise ? "SURPRISE" : collapse.thesisDead ? "THESIS DEAD" : "THESIS HELD"}</em>
          <small className="tnum">settling p {Math.round(collapse.settlingProbability * 100)}% · {collapse.latencyMs}ms</small>
        </div>
      ) : (
        <div className="collapse-placeholder"><span>Horizon open</span><strong>No collapse in this session window</strong></div>
      )}
    </section>
  );
}

function ProbabilityGap({ book, fair }: { book: number | null; fair: number | null }) {
  return (
    <div className="probability-gap" aria-label={`Book ${pct(book)}, desk ${pct(fair)}`}>
      <span className="probability-gap__track" />
      {book != null ? <i className="probability-gap__book" style={{ left: `${book * 100}%` }} /> : null}
      {fair != null ? <i className="probability-gap__fair" style={{ left: `${fair * 100}%` }} /> : null}
      {book != null && fair != null ? <b style={{ left: `${Math.min(book, fair) * 100}%`, width: `${Math.abs(book - fair) * 100}%` }} /> : null}
    </div>
  );
}

function Ribbon({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div>{icon}<span>{label}</span><strong>{value}</strong></div>;
}

function Timeline({ points, collapseMinute }: { points: StrategyLabView["analysis"]["timeline"]; collapseMinute: number | null }) {
  const width = 500;
  const height = 116;
  if (points.length < 2) return <div className="timeline-empty">Waiting for enough path samples</div>;
  const minMinute = points[0].minute;
  const maxMinute = points.at(-1)?.minute ?? minMinute + 1;
  const values = points.flatMap((point) => [point.bookProbability, point.deskProbability]).filter((value): value is number => value != null);
  const min = Math.max(0, Math.min(...values) - 0.04);
  const max = Math.min(1, Math.max(...values) + 0.04);
  const x = (minute: number) => 14 + ((minute - minMinute) / Math.max(0.01, maxMinute - minMinute)) * (width - 28);
  const y = (probability: number) => 10 + (1 - (probability - min) / Math.max(0.01, max - min)) * (height - 24);
  const line = (key: "bookProbability" | "deskProbability") => points
    .filter((point) => point[key] != null)
    .map((point) => `${x(point.minute).toFixed(1)},${y(point[key] as number).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="timeline-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Contract path from ${minMinute.toFixed(0)} to ${maxMinute.toFixed(0)} minutes`}>
      {[0.25, 0.5, 0.75].map((fraction) => <line key={fraction} x1="14" y1={height * fraction} x2={width - 14} y2={height * fraction} className="timeline-grid" />)}
      <polyline points={line("bookProbability")} className="timeline-line timeline-line--book" />
      <polyline points={line("deskProbability")} className="timeline-line timeline-line--desk" />
      {collapseMinute != null && collapseMinute >= minMinute && collapseMinute <= maxMinute ? <line x1={x(collapseMinute)} x2={x(collapseMinute)} y1="8" y2={height - 10} className="timeline-collapse" /> : null}
      <text x="14" y={height - 1} className="timeline-label">{minMinute.toFixed(0)}′</text>
      <text x={width - 14} y={height - 1} textAnchor="end" className="timeline-label">{maxMinute.toFixed(0)}′</text>
    </svg>
  );
}

function pct(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function pp(value: number | null): string {
  if (value == null) return "—";
  const amount = value * 100;
  return `${amount >= 0 ? "+" : ""}${amount.toFixed(1)}pp`;
}

