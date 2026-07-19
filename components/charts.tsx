/** Tiny dependency-free SVG charts for the console. */

import type { TempoSeriesPoint } from "@/lib/tempo/types";
import { windowMinutePoints, windowTimedValues, type ChartTimeframe } from "@/components/chart-timeframe";

export function Sparkline({
  values,
  color = "var(--color-cyan)",
  width = 120,
  height = 28,
  ariaLabel = "Equity path",
  showPoints = false,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  ariaLabel?: string;
  showPoints?: boolean;
}) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return { x, y, v };
  });
  const pts = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible" role="img" aria-label={ariaLabel}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      {showPoints ? coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 2 : 1.2} fill={color} opacity={i === coords.length - 1 ? 1 : 0.35}>
          <title>{c.v.toFixed(1)}</title>
        </circle>
      )) : null}
    </svg>
  );
}

export interface EquitySeries {
  name: string;
  color: string;
  equity: number[];
  minutes?: number[];
  lineStyle?: "solid" | "dashed" | "dotted";
  dashArray?: string;
  markers?: Array<{
    index: number;
    label: string;
    side?: "buy" | "sell";
  }>;
}

export function EquityChart({
  series,
  width = 640,
  height = 220,
  baseline,
  ariaLabel = "Strategy equity paths and fill markers",
  timeframe = "full",
}: {
  series: EquitySeries[];
  width?: number;
  height?: number;
  baseline?: number;
  ariaLabel?: string;
  timeframe?: ChartTimeframe;
}) {
  const visibleSeries = series.map((item) => {
    const { values: equity, minutes, offset } = windowTimedValues(item.equity, item.minutes, timeframe);
    return {
      ...item,
      equity,
      minutes,
      markers: item.markers?.filter((marker) => marker.index >= offset).map((marker) => ({ ...marker, index: marker.index - offset })),
    };
  });
  const all = visibleSeries.flatMap((s) => s.equity);
  if (all.length === 0) return <svg width={width} height={height} />;
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (baseline != null) {
    min = Math.min(min, baseline);
    max = Math.max(max, baseline);
  }
  const pad = (max - min) * 0.08 || 1;
  min -= pad;
  max += pad;
  const span = max - min || 1;
  const padL = 8;
  const padR = 8;
  const W = width - padL - padR;
  const y = (v: number) => height - 16 - ((v - min) / span) * (height - 28);
  const len = Math.max(...visibleSeries.map((s) => s.equity.length), 2);
  const allMinutes = visibleSeries.flatMap((item) => item.minutes ?? []);
  const minMinute = allMinutes.length ? Math.min(...allMinutes) : 0;
  const maxMinute = allMinutes.length ? Math.max(...allMinutes) : 0;
  const x = (i: number, minutes?: number[]) => {
    if (minutes?.[i] != null && maxMinute > minMinute) return padL + ((minutes[i] - minMinute) / (maxMinute - minMinute)) * W;
    return padL + (i / (len - 1)) * W;
  };

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="equity-chart" role="img" aria-label={ariaLabel}>
      <title>{ariaLabel}</title>
      {baseline != null && (
        <line x1={padL} y1={y(baseline)} x2={width - padR} y2={y(baseline)} stroke="var(--lab-line-strong, var(--color-line2))" strokeDasharray="3 3" strokeWidth={1} />
      )}
      {visibleSeries.map((s) => {
        const pts = s.equity.map((v, i) => `${x(i, s.minutes).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        return (
          <g key={s.name}>
            <polyline
              points={pts}
              fill="none"
              stroke={s.color}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeDasharray={s.dashArray ?? (s.lineStyle === "dashed" ? "8 4" : s.lineStyle === "dotted" ? "2 4" : undefined)}
              opacity={0.92}
            />
            {(s.markers ?? []).map((marker, mi) => {
              const idx = Math.max(0, Math.min(s.equity.length - 1, marker.index));
              const equity = s.equity[idx];
              if (equity == null) return null;
              return (
                <circle
                  key={`${s.name}-m-${mi}`}
                  cx={x(idx, s.minutes)}
                  cy={y(equity)}
                  r={3.2}
                  fill={marker.side === "sell" ? "var(--lab-warn, #e8b45a)" : s.color}
                  stroke="rgba(8,13,20,.85)"
                  strokeWidth={1}
                >
                  <title>{marker.label}</title>
                </circle>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

export function TempoPathChart({
  series,
  homeCode,
  awayCode,
  timeframe = "full",
}: {
  series: TempoSeriesPoint[];
  homeCode: string;
  awayCode: string;
  timeframe?: ChartTimeframe;
}) {
  const samples = windowMinutePoints(series, timeframe);
  if (samples.length < 2) {
    return <div className="timeline-empty">Waiting for enough tempo samples</div>;
  }

  const width = 820;
  const height = 276;
  const panels = [
    { id: "shots", label: "Shots", home: samples.map((point) => point.shotsHome), away: samples.map((point) => point.shotsAway) },
    { id: "sot", label: "On target", home: samples.map((point) => point.sotHome), away: samples.map((point) => point.sotAway) },
    { id: "corners", label: "Corners", home: samples.map((point) => point.cornersHome), away: samples.map((point) => point.cornersAway) },
  ];
  const minMinute = samples[0].minute;
  const maxMinute = samples.at(-1)?.minute ?? minMinute + 1;
  const x = (minute: number) => 90 + ((minute - minMinute) / Math.max(1, maxMinute - minMinute)) * (width - 112);
  const panelHeight = 78;

  return (
    <div className="tempo-path">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Cumulative home and away tempo paths for ${homeCode} and ${awayCode}`}>
        {panels.map((panel, panelIndex) => {
          const top = 8 + panelIndex * 84;
          const max = Math.max(1, ...panel.home, ...panel.away);
          const y = (value: number) => top + 7 + (1 - value / max) * (panelHeight - 18);
          return (
            <g key={panel.id}>
              <line x1="90" y1={top + panelHeight - 11} x2={width - 22} y2={top + panelHeight - 11} className="timeline-grid" />
              <text x="8" y={top + 15} className="timeline-label tempo-panel-label">{panel.label}</text>
              <text x="8" y={top + 31} className="timeline-label">{homeCode} {panel.home.at(-1)}</text>
              <text x="8" y={top + 46} className="timeline-label">{awayCode} {panel.away.at(-1)}</text>
              <polyline points={panel.home.map((value, index) => `${x(samples[index].minute).toFixed(1)},${y(value).toFixed(1)}`).join(" ")} fill="none" stroke="var(--lab-observation)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <polyline points={panel.away.map((value, index) => `${x(samples[index].minute).toFixed(1)},${y(value).toFixed(1)}`).join(" ")} fill="none" stroke="var(--lab-muted)" strokeWidth="1.7" strokeDasharray="7 4" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
        <text x="90" y={height - 4} className="timeline-label">{minMinute.toFixed(0)}′</text>
        <text x={width - 22} y={height - 4} textAnchor="end" className="timeline-label">{maxMinute.toFixed(0)}′</text>
      </svg>
      <div className="tempo-path__legend" aria-label="Tempo path legend">
        <span><i style={{ background: "var(--lab-observation)" }} />{homeCode} home</span>
        <span><i style={{ background: "none", borderTop: "2px dashed var(--lab-muted)" }} />{awayCode} away</span>
      </div>
    </div>
  );
}

/** Compact arc gauge for market quality (0..100). */
export function QualityGauge({ value, size = 92 }: { value: number; size?: number }) {
  const r = size / 2 - 8;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(100, value)) / 100;
  const color = value >= 75 ? "var(--color-up)" : value >= 50 ? "var(--color-warn)" : "var(--color-crit)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-line)" strokeWidth={7} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={`${(frac * circ).toFixed(1)} ${circ.toFixed(1)}`}
        transform={`rotate(-90 ${c} ${c})`}
      />
      <text x={c} y={c - 2} textAnchor="middle" fontSize={22} fontWeight={700} fill="var(--color-ink)" className="tnum">
        {Math.round(value)}
      </text>
      <text x={c} y={c + 14} textAnchor="middle" fontSize={8.5} fill="var(--color-faint)" letterSpacing="0.12em">
        QUALITY
      </text>
    </svg>
  );
}
