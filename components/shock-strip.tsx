"use client";

import type { EngineState } from "@/lib/engine/state";
import type { ShockSpike, TempoSeriesPoint } from "@/lib/tempo/types";

const WIDTH = 720;
const HEIGHT = 168;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 10;
const MID = 78;
const TRACK_H = 58;

export function ShockStrip({ state }: { state: EngineState }) {
  const strip = state.shockStrip;
  const minute = Math.max(1, state.current?.minute ?? 90);
  const x = (m: number) => PAD_L + (Math.min(m, 90) / 90) * (WIDTH - PAD_L - PAD_R);

  return (
    <section className="panel shock-strip" aria-label="Shock strip">
      <div className="panel-head">
        <div>
          <span className="text-sm font-semibold">Shock strip</span>
          <span className="ml-2 text-[11px] text-faint">material shocks · tempo enrichment</span>
        </div>
        <span className={`text-[11px] ${tempoTone(strip.tempo.status)}`}>
          tempo · {strip.tempo.source} · {strip.tempo.status}
        </span>
      </div>
      <div className="p-3 overflow-x-auto">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full min-w-[560px] h-auto" role="img">
          <title>Dual-track shock strip</title>
          {/* axes */}
          <line x1={PAD_L} y1={MID} x2={WIDTH - PAD_R} y2={MID} stroke="var(--color-line2)" strokeWidth={1} />
          {[0, 15, 30, 45, 60, 75, 90].map((m) => (
            <g key={m}>
              <line x1={x(m)} y1={PAD_T} x2={x(m)} y2={HEIGHT - 18} stroke="var(--color-line)" strokeWidth={1} opacity={0.45} />
              <text x={x(m)} y={HEIGHT - 4} textAnchor="middle" fill="var(--color-faint)" fontSize={9} fontFamily="var(--font-mono)">
                {m}′
              </text>
            </g>
          ))}
          <text x={4} y={PAD_T + 10} fill="var(--color-muted)" fontSize={9}>
            material
          </text>
          <text x={4} y={MID + 14} fill="var(--color-muted)" fontSize={9}>
            tempo
          </text>

          {/* material spikes (up) */}
          {strip.material.map((spike) => (
            <Spike key={spike.id} spike={spike} x={x(spike.minute)} baseline={MID} direction={-1} maxH={TRACK_H} />
          ))}

          {/* tempo cumulative lines (below) */}
          <TempoLines series={strip.tempo.series} x={x} baseline={MID} maxH={TRACK_H} />

          {/* tempo markers */}
          {strip.tempo.markers.map((spike) => (
            <Spike key={spike.id} spike={spike} x={x(spike.minute)} baseline={MID} direction={1} maxH={TRACK_H * 0.55} muted />
          ))}

          {/* live playhead */}
          <line
            x1={x(minute)}
            y1={PAD_T}
            x2={x(minute)}
            y2={HEIGHT - 18}
            stroke="var(--color-brand)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            opacity={0.85}
          />
        </svg>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          <Legend swatch="var(--color-brand)" label="Goal / red / collapse" />
          <Legend swatch="var(--color-warn)" label="Yellow / odds swing" />
          <Legend swatch="var(--color-cyan)" label="Shots (cumulative)" />
          <Legend swatch="var(--color-info)" label="Shots on target" />
          <span className="text-faint ml-auto">{strip.tempo.detail}</span>
        </div>

        {strip.tempo.latest && (
          <div className="mt-2 flex gap-4 text-xs tnum">
            <span>
              Shots {strip.tempo.latest.shots.home}–{strip.tempo.latest.shots.away}
            </span>
            <span className="text-muted">
              On target {strip.tempo.latest.sot.home}–{strip.tempo.latest.sot.away}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function Spike({
  spike,
  x,
  baseline,
  direction,
  maxH,
  muted,
}: {
  spike: ShockSpike;
  x: number;
  baseline: number;
  direction: 1 | -1;
  maxH: number;
  muted?: boolean;
}) {
  const h = Math.max(4, spike.severity * maxH);
  const y2 = baseline + direction * h;
  const color = spikeColor(spike);
  return (
    <g opacity={muted ? 0.75 : 1}>
      <line x1={x} y1={baseline} x2={x} y2={y2} stroke={color} strokeWidth={spike.track === "material" ? 2.2 : 1.4} />
      <circle cx={x} cy={y2} r={spike.track === "material" ? 3.2 : 2.2} fill={color} />
      <title>
        {spike.minute.toFixed(0)}′ · {spike.label} · sev {(spike.severity * 100).toFixed(0)}
      </title>
    </g>
  );
}

function TempoLines({
  series,
  x,
  baseline,
  maxH,
}: {
  series: TempoSeriesPoint[];
  x: (m: number) => number;
  baseline: number;
  maxH: number;
}) {
  if (series.length < 2) return null;
  const maxShots = Math.max(1, ...series.map((p) => p.shotsHome + p.shotsAway));
  const maxSot = Math.max(1, ...series.map((p) => p.sotHome + p.sotAway));

  const shotsPts = series
    .map((p) => {
      const total = p.shotsHome + p.shotsAway;
      const y = baseline + (total / maxShots) * maxH;
      return `${x(p.minute).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const sotPts = series
    .map((p) => {
      const total = p.sotHome + p.sotAway;
      const y = baseline + (total / maxSot) * maxH * 0.72;
      return `${x(p.minute).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <g>
      <polyline points={shotsPts} fill="none" stroke="var(--color-cyan)" strokeWidth={1.6} opacity={0.85} />
      <polyline points={sotPts} fill="none" stroke="var(--color-info)" strokeWidth={1.6} strokeDasharray="4 3" opacity={0.9} />
    </g>
  );
}

function spikeColor(spike: ShockSpike): string {
  if (spike.kind === "goal" || spike.kind === "red" || spike.kind === "horizon_collapse") return "var(--color-brand)";
  if (spike.kind === "yellow" || spike.kind === "odds_swing") return "var(--color-warn)";
  if (spike.kind === "shot_on_target") return "var(--color-info)";
  if (spike.kind === "shot") return "var(--color-cyan)";
  return "var(--color-muted)";
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: swatch }} />
      {label}
    </span>
  );
}

function tempoTone(status: string): string {
  if (status === "ready") return "text-up";
  if (status === "polling") return "text-warn";
  if (status === "error") return "text-crit";
  return "text-faint";
}
