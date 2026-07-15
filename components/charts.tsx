/** Tiny dependency-free SVG charts for the console. */

export function Sparkline({
  values,
  color = "var(--color-cyan)",
  width = 120,
  height = 28,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - 2 - ((v - min) / span) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = values[values.length - 1];
  const lastY = height - 2 - ((last - min) / span) * (height - 4);
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={width} cy={lastY} r={2} fill={color} />
    </svg>
  );
}

export interface EquitySeries {
  name: string;
  color: string;
  equity: number[];
}

export function EquityChart({
  series,
  width = 640,
  height = 220,
  baseline,
}: {
  series: EquitySeries[];
  width?: number;
  height?: number;
  baseline?: number;
}) {
  const all = series.flatMap((s) => s.equity);
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
  const len = Math.max(...series.map((s) => s.equity.length), 2);
  const x = (i: number) => padL + (i / (len - 1)) * W;

  return (
    <svg width={width} height={height}>
      {baseline != null && (
        <line x1={padL} y1={y(baseline)} x2={width - padR} y2={y(baseline)} stroke="var(--color-line2)" strokeDasharray="3 3" strokeWidth={1} />
      )}
      {series.map((s) => {
        const pts = s.equity.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        return <polyline key={s.name} points={pts} fill="none" stroke={s.color} strokeWidth={1.8} strokeLinejoin="round" opacity={0.92} />;
      })}
    </svg>
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
