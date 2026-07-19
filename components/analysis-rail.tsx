"use client";

import { useId, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Gauge, GitCompareArrows, Shield } from "lucide-react";
import type { EngineState } from "@/lib/engine/state";
import type { StrategyLabView } from "@/lib/strategy-lab/projection";
import type {
  AnalysisChart,
  AnalysisMarker,
  AnalysisSeries,
} from "@/lib/strategy-lab/analysis-chart";
import { RailHeading } from "@/components/rail-heading";
import { TimeframeControl, windowMinutePoints, type ChartTimeframe } from "@/components/chart-timeframe";

const SERIES_STROKE: Record<AnalysisSeries["role"], string> = {
  book: "var(--lab-cyan)",
  model: "var(--lab-lime)",
  signal: "var(--lab-amber)",
  aux: "var(--lab-muted)",
};

const SERIES_DASH: Record<AnalysisSeries["role"], string | undefined> = {
  book: undefined,
  model: "5 3",
  signal: "2 3",
  aux: "1 4",
};

export function AnalysisRail({ state, view, onExpand }: { state: EngineState; view: StrategyLabView; onExpand: () => void }) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>(15);
  const deck = view.analysis.deck;
  const chart = view.analysis.chart;
  const collapse = state.horizon.lastCollapse;
  const bucketByKey = new Map(chart.buckets.map((bucket) => [bucket.key, bucket]));

  return (
    <section className="lab-rail lab-rail--analysis" aria-labelledby="analysis-title">
      <RailHeading
        number="2"
        verb="INTERPRET"
        title="What does the desk infer?"
        description="Contract evidence · price paths · Strategy pretext."
        id="analysis-title"
        onExpand={onExpand}
      />

      <div className="analysis-focus">
        <div className="analysis-focus__head">
          <div>
            <span>{deck.title}</span>
            <strong>{deck.subtitle}</strong>
          </div>
          {deck.remainingMinutes != null ? (
            <div className="horizon-countdown">
              <Clock3 size={13} />
              <span>closes in</span>
              <strong className="tnum">{deck.remainingMinutes.toFixed(1)}′</strong>
            </div>
          ) : null}
        </div>

        {view.analysis.pricingBoundary ? (
          <div className="pricing-boundary">
            <AlertTriangle size={14} aria-hidden="true" />
            <strong>{view.analysis.pricingBoundary.split(" · ")[0]}</strong>
            <span>{view.analysis.pricingBoundary.split(" · ")[1]}</span>
          </div>
        ) : null}

        <div className={`analysis-outs analysis-outs--${deck.outs.length}`} key={collapse?.id ?? deck.viewId}>
          {deck.outs.map((out) => {
            const bucket = bucketByKey.get(out.key);
            const edge = bucket?.edge ?? (out.bookProb != null && out.modelProb != null ? out.modelProb - out.bookProb : null);
            const band = bucket?.band ?? "unknown";
            return (
              <div
                className={`analysis-out analysis-out--${out.tone} analysis-out--band-${band} ${out.thesis ? "is-thesis" : ""}`}
                key={out.key}
              >
                <div className="analysis-out__label">
                  <strong>{out.label}</strong>
                  <span>{out.thesis ? "THESIS" : band !== "unknown" ? band.toUpperCase() : out.action ? "ACTION" : ""}</span>
                </div>
                <div className="analysis-out__value tnum">
                  {Math.round(out.displayProb * 100)}
                  <small>%</small>
                </div>
                <ProbabilityGap book={out.bookProb} fair={out.modelProb} />
                <div className="analysis-out__legend">
                  <span>
                    BOOK <b className="tnum">{pct(out.bookProb)}</b>
                  </span>
                  <span>
                    DESK <b className="tnum">{pct(out.modelProb)}</b>
                  </span>
                  <span className={edge == null ? "" : edge >= 0 ? "is-positive" : "is-negative"}>
                    EDGE <b className="tnum">{pp(edge)}</b>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="analysis-provenance">
          <span>{deck.detail}</span>
          {state.horizon.current && deck.viewId === "next_score" ? (
            <span>
              {state.horizon.current.source} ·{" "}
              {state.horizon.current.lowData ? "LOW DATA" : `N=${state.horizon.current.support}`}
            </span>
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
        <div className="rail-section__head rail-section__head--timeframe">
          <div>
            <span>{chart.title}</span>
            <small>
              {chart.subtitle}
              {chart.markers.length ? ` · ${chart.markers.length} markers` : ""}
              {chart.traded ? "" : " · not traded"}
            </small>
          </div>
          <TimeframeControl value={timeframe} onChange={setTimeframe} label="Compact Analysis timeframe" />
        </div>
        <AnalysisPathChart chart={chart} timeframe={timeframe} />
        <div className="timeline-legend">
          {chart.series.map((series) => (
            <span key={series.id}>
              <i className={`series-swatch series-swatch--${series.role}`} />
              {series.label}
            </span>
          ))}
          {chart.markers.some((m) => m.tone === "event") ? (
            <span>
              <i className="goal" />Events
            </span>
          ) : null}
          {chart.markers.some((m) => m.tone === "fill") ? (
            <span>
              <i className="fill" />Fills
            </span>
          ) : null}
          {chart.markers.some((m) => m.tone === "signal") ? (
            <span>
              <i className="signal" />Signals
            </span>
          ) : null}
        </div>
        {!chart.traded ? (
          <p className="analysis-reference-note">{chart.agentHint}</p>
        ) : (
          <p className="analysis-agent-hint">{chart.agentHint}</p>
        )}
        {chart.residual && chart.residual.length >= 2 ? <ResidualStrip residual={chart.residual} timeframe={timeframe} /> : null}
      </div>

      {collapse ? (
        <div className="collapse-manifest" key={collapse.id} aria-live="polite">
          <span>HORIZON COLLAPSE · {collapse.minute.toFixed(0)}′</span>
          <strong>{collapse.winner.replaceAll("_", " ")}</strong>
          <em>{collapse.surprise ? "SURPRISE" : collapse.thesisDead ? "THESIS DEAD" : "THESIS HELD"}</em>
          <small className="tnum">
            settling p {Math.round(collapse.settlingProbability * 100)}% · {collapse.latencyMs}ms
          </small>
        </div>
      ) : (
        <div className="collapse-placeholder">
          <span>Horizon open</span>
          <strong>No collapse in this session window</strong>
        </div>
      )}
    </section>
  );
}

function ProbabilityGap({ book, fair }: { book: number | null; fair: number | null }) {
  return (
    <div
      className="probability-gap"
      aria-label={`Book ${pct(book)}, desk ${pct(fair)}`}
      title={`Book ${pct(book)} · Desk ${pct(fair)}`}
    >
      <span className="probability-gap__track" />
      {book != null ? <i className="probability-gap__book" style={{ left: `${book * 100}%` }} /> : null}
      {fair != null ? <i className="probability-gap__fair" style={{ left: `${fair * 100}%` }} /> : null}
      {book != null && fair != null ? (
        <b style={{ left: `${Math.min(book, fair) * 100}%`, width: `${Math.abs(book - fair) * 100}%` }} />
      ) : null}
    </div>
  );
}

function Ribbon({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function AnalysisPathChart({
  chart,
  size = "compact",
  timeframe = "full",
}: {
  chart: AnalysisChart;
  size?: "compact" | "large";
  timeframe?: ChartTimeframe;
}) {
  const tipId = useId();
  const [hover, setHover] = useState<{
    minute: number;
    values: Array<{ label: string; value: number }>;
    x: number;
    y: number;
  } | null>(null);

  const width = size === "large" ? 820 : 500;
  const height = size === "large" ? 250 : 128;
  const chartLatestMinute = Math.max(...chart.series.flatMap((item) => item.points.map((point) => point.minute)), 0);
  const series = chart.series
    .map((item) => ({ ...item, points: windowMinutePoints(item.points, timeframe, chartLatestMinute) }))
    .filter((s) => s.points.length >= 2);
  if (series.length === 0) {
    return <div className="timeline-empty">Waiting for enough path samples on this contract</div>;
  }

  const allPoints = series.flatMap((s) => s.points);
  const minMinute = Math.min(...allPoints.map((p) => p.minute));
  const maxMinute = Math.max(...allPoints.map((p) => p.minute));
  const values = allPoints.map((p) => p.value);
  const min = Math.max(chart.yMin, Math.min(...values) - 0.04);
  const max = Math.min(chart.yMax, Math.max(...values) + 0.04);
  const x = (minute: number) =>
    14 + ((minute - minMinute) / Math.max(0.01, maxMinute - minMinute)) * (width - 28);
  const y = (value: number) => 10 + (1 - (value - min) / Math.max(0.01, max - min)) * (height - 24);

  const markers = chart.markers.filter((m) => m.minute >= minMinute - 0.5 && m.minute <= maxMinute + 0.5);
  const hoverMinutes = uniqueMinutes(series);

  return (
    <div className={`timeline-frame timeline-frame--${size}`}>
      <svg
        className="timeline-svg timeline-svg--multi"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${chart.title} from ${minMinute.toFixed(0)} to ${maxMinute.toFixed(0)} minutes`}
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1="14"
            y1={height * fraction}
            x2={width - 14}
            y2={height * fraction}
            className="timeline-grid"
          />
        ))}
        {series.map((s) => (
          <polyline
            key={s.id}
            points={s.points.map((p) => `${x(p.minute).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
            className={`timeline-line timeline-line--${s.role}`}
            style={{
              stroke: SERIES_STROKE[s.role],
              strokeDasharray: SERIES_DASH[s.role],
              opacity: s.role === "aux" ? 0.55 : 0.95,
            }}
          />
        ))}
        {markers.map((marker, index) => (
          <MarkerGlyph key={`${marker.tone}-${marker.kind}-${marker.minute}-${index}`} marker={marker} x={x} height={height} />
        ))}
        {hoverMinutes.map((minute) => {
          const cx = x(minute);
          const valuesAt = series
            .map((s) => {
              const pt = nearestPoint(s.points, minute);
              return pt ? { label: s.label, value: pt.value, y: y(pt.value) } : null;
            })
            .filter((v): v is { label: string; value: number; y: number } => v != null);
          if (valuesAt.length === 0) return null;
          const tipY = valuesAt[0].y;
          return (
            <circle
              key={`hit-${minute}`}
              className="timeline-hit"
              cx={cx}
              cy={tipY}
              r={9}
              onMouseEnter={() =>
                setHover({
                  minute,
                  values: valuesAt.map(({ label, value }) => ({ label, value })),
                  x: cx,
                  y: tipY,
                })
              }
            />
          );
        })}
        <text x="14" y={height - 1} className="timeline-label">
          {minMinute.toFixed(0)}′
        </text>
        <text x={width - 14} y={height - 1} textAnchor="end" className="timeline-label">
          {maxMinute.toFixed(0)}′
        </text>
      </svg>
      {hover ? (
        <div
          className="timeline-tooltip"
          id={tipId}
          style={{ left: `${(hover.x / width) * 100}%`, top: `${(hover.y / height) * 100}%` }}
          role="tooltip"
        >
          <strong className="tnum">{hover.minute.toFixed(0)}′</strong>
          {hover.values.map((entry) => (
            <span key={entry.label}>
              {entry.label} <b className="tnum">{pct(entry.value)}</b>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MarkerGlyph({
  marker,
  x,
  height,
}: {
  marker: AnalysisMarker;
  x: (minute: number) => number;
  height: number;
}) {
  const cx = x(marker.minute);
  const toneClass = `timeline-marker timeline-marker--${marker.tone} timeline-event--${marker.kind}`;
  return (
    <g className={toneClass}>
      <line x1={cx} x2={cx} y1="6" y2={height - 12} className={`timeline-event timeline-event--${marker.kind}`} />
      <circle cx={cx} cy={marker.tone === "fill" ? height - 14 : 8} r={marker.tone === "fill" ? 3.4 : 2.6} className={`timeline-event-dot timeline-event-dot--${marker.kind}`}>
        <title>{marker.label}</title>
      </circle>
    </g>
  );
}

export function ResidualStrip({ residual, timeframe = "full" }: { residual: Array<{ minute: number; value: number }>; timeframe?: ChartTimeframe }) {
  const samples = windowMinutePoints(residual, timeframe);
  if (samples.length < 2) return null;
  const width = 500;
  const height = 36;
  const minMinute = samples[0].minute;
  const maxMinute = samples.at(-1)?.minute ?? minMinute + 1;
  const maxAbs = Math.max(0.02, ...samples.map((sample) => Math.abs(sample.value)));
  const x = (minute: number) =>
    14 + ((minute - minMinute) / Math.max(0.01, maxMinute - minMinute)) * (width - 28);
  const y = (value: number) => height / 2 - (value / maxAbs) * ((height - 8) / 2);
  const line = samples.map((sample) => `${x(sample.minute).toFixed(1)},${y(sample.value).toFixed(1)}`).join(" ");
  const latest = samples.at(-1)!;

  return (
    <div className="residual-strip" aria-label="Desk fair minus observed residual">
      <div className="residual-strip__head">
        <span>Fair − book residual</span>
        <strong className={latest.value >= 0 ? "is-positive" : "is-negative"}>{pp(latest.value)}</strong>
      </div>
      <svg className="residual-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Residual path">
        <line x1="14" x2={width - 14} y1={height / 2} y2={height / 2} className="residual-zero" />
        <polyline points={line} className="residual-line" />
      </svg>
    </div>
  );
}

function uniqueMinutes(series: AnalysisSeries[]): number[] {
  const set = new Set<number>();
  for (const s of series) {
    for (const p of s.points) set.add(p.minute);
  }
  return [...set].sort((a, b) => a - b);
}

function nearestPoint(
  points: Array<{ minute: number; value: number }>,
  minute: number,
  tolerance = 0.6,
): { minute: number; value: number } | null {
  let best: { minute: number; value: number } | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const delta = Math.abs(point.minute - minute);
    if (delta < bestDelta) {
      best = point;
      bestDelta = delta;
    }
  }
  return bestDelta <= tolerance ? best : null;
}

function pct(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function pp(value: number | null): string {
  if (value == null) return "—";
  const amount = value * 100;
  return `${amount >= 0 ? "+" : ""}${amount.toFixed(1)}pp`;
}
