"use client";

import { useMemo, useState } from "react";
import type { EngineState } from "@/lib/engine/state";
import type {
  HybridSeriesPoint,
  OddsViewId,
  OddsViewPoint,
  ShockSpike,
  TempoSeriesPoint,
} from "@/lib/tempo/types";
import { ODDS_VIEW_LABELS, ODDS_VIEW_ORDER } from "@/lib/tempo/types";

const WIDTH = 720;
const HEIGHT = 248;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 8;
const BAND_H = 68;
const BAND_GAP = 6;
const AXIS_Y = HEIGHT - 16;

function bandBaseline(index: number): number {
  return PAD_T + (index + 1) * BAND_H + index * BAND_GAP;
}

export function ShockStrip({ state }: { state: EngineState }) {
  const strip = state.shockStrip;
  const minute = Math.max(1, state.current?.minute ?? 90);
  const x = (m: number) => PAD_L + (Math.min(m, 90) / 90) * (WIDTH - PAD_L - PAD_R);

  const preferred =
    strip.odds.availableViews.includes("next_score")
      ? "next_score"
      : strip.odds.availableViews[0] ?? strip.odds.defaultView;
  const [oddsView, setOddsView] = useState<OddsViewId>(preferred);
  const activeView: OddsViewId = strip.odds.availableViews.includes(oddsView)
    ? oddsView
    : preferred;

  const viewSeries = strip.odds.views[activeView];
  const tempoY0 = bandBaseline(0);
  const oddsY0 = bandBaseline(1);
  const hybridY0 = bandBaseline(2);

  const thesisLine = useMemo(
    () => polylineFromHybrid(strip.hybrid.series, x, hybridY0, BAND_H, "thesisProb"),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- x/baselines are pure from constants
    [strip.hybrid.series],
  );
  const pressureLine = useMemo(
    () => polylineFromHybrid(strip.hybrid.series, x, hybridY0, BAND_H, "pressure"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [strip.hybrid.series],
  );

  return (
    <section className="panel shock-strip" aria-label="Shock strip">
      <div className="panel-head flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <span className="text-sm font-semibold">Shock strip</span>
          <span className="ml-2 text-[11px] text-faint">Tempo · Odds · Hybrid</span>
        </div>
        <span className={`text-[11px] ${tempoTone(strip.tempo.status)}`}>
          Tempo · {strip.tempo.source} · {strip.tempo.status}
        </span>
        <span className="text-[11px] text-muted">
          Odds · {ODDS_VIEW_LABELS[activeView]}
        </span>
      </div>

      <div className="px-3 pt-2 flex flex-wrap gap-1.5">
        {ODDS_VIEW_ORDER.map((id) => {
          const available = strip.odds.availableViews.includes(id);
          return (
            <button
              key={id}
              type="button"
              disabled={!available}
              onClick={() => setOddsView(id)}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                activeView === id
                  ? "border-brand text-ink bg-panel2"
                  : available
                    ? "border-line2 text-muted hover:border-line"
                    : "border-line text-faint opacity-40 cursor-not-allowed"
              }`}
            >
              {ODDS_VIEW_LABELS[id]}
            </button>
          );
        })}
      </div>

      <div className="p-3 overflow-x-auto">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full min-w-[560px] h-auto" role="img">
          <title>Tempo Odds Hybrid shock strip</title>

          {[0, 15, 30, 45, 60, 75, 90].map((m) => (
            <g key={m}>
              <line
                x1={x(m)}
                y1={PAD_T}
                x2={x(m)}
                y2={AXIS_Y - 4}
                stroke="var(--color-line)"
                strokeWidth={1}
                opacity={0.4}
              />
              <text
                x={x(m)}
                y={AXIS_Y + 10}
                textAnchor="middle"
                fill="var(--color-faint)"
                fontSize={9}
                fontFamily="var(--font-mono)"
              >
                {m}′
              </text>
            </g>
          ))}

          <BandLabel y={tempoY0 - BAND_H + 12} text="Tempo" />
          <BandLabel y={oddsY0 - BAND_H + 12} text="Odds" />
          <BandLabel y={hybridY0 - BAND_H + 12} text="Hybrid" />

          <line x1={PAD_L} y1={tempoY0} x2={WIDTH - PAD_R} y2={tempoY0} stroke="var(--color-line2)" strokeWidth={1} />
          <line x1={PAD_L} y1={oddsY0} x2={WIDTH - PAD_R} y2={oddsY0} stroke="var(--color-line2)" strokeWidth={1} />
          <line x1={PAD_L} y1={hybridY0} x2={WIDTH - PAD_R} y2={hybridY0} stroke="var(--color-line2)" strokeWidth={1} />

          {/* Tempo */}
          <TempoLines series={strip.tempo.series} x={x} baseline={tempoY0} maxH={BAND_H * 0.85} />
          {strip.tempo.markers.map((spike) => (
            <Spike
              key={spike.id}
              spike={spike}
              x={x(spike.minute)}
              baseline={tempoY0}
              direction={-1}
              maxH={BAND_H * 0.9}
            />
          ))}

          {/* Odds */}
          <OddsLines points={viewSeries?.points ?? []} x={x} baseline={oddsY0} maxH={BAND_H * 0.85} viewId={activeView} />

          {/* Hybrid */}
          {thesisLine && (
            <polyline points={thesisLine} fill="none" stroke="var(--color-brand)" strokeWidth={1.8} opacity={0.95} />
          )}
          {pressureLine && (
            <polyline
              points={pressureLine}
              fill="none"
              stroke="var(--color-warn)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.9}
            />
          )}
          {strip.hybrid.markers.map((spike) => (
            <Spike
              key={spike.id}
              spike={spike}
              x={x(spike.minute)}
              baseline={hybridY0}
              direction={-1}
              maxH={BAND_H * (spike.kind === "horizon_collapse" && spike.severity >= 0.9 ? 1 : 0.72)}
            />
          ))}

          <line
            x1={x(minute)}
            y1={PAD_T}
            x2={x(minute)}
            y2={AXIS_Y - 4}
            stroke="var(--color-brand)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            opacity={0.85}
          />
        </svg>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          <Legend swatch="var(--color-brand)" label="Tempo goal / Hybrid thesis" />
          <Legend swatch="var(--color-cyan)" label="Shots cumulative" />
          <Legend swatch="var(--color-info)" label="SOT / Odds selection" />
          <Legend swatch="var(--color-warn)" label="Hybrid pressure" />
          <span className="text-faint ml-auto">{strip.tempo.detail}</span>
        </div>

        {strip.tempo.latest && (
          <div className="mt-2 flex flex-wrap gap-4 text-xs tnum">
            <span>
              Shots {strip.tempo.latest.shots.home}–{strip.tempo.latest.shots.away}
            </span>
            <span className="text-muted">
              On target {strip.tempo.latest.sot.home}–{strip.tempo.latest.sot.away}
            </span>
            <span className="text-muted">
              Fouls {strip.tempo.latest.fouls.home}–{strip.tempo.latest.fouls.away}
            </span>
            <span className="text-muted">
              Poss {strip.tempo.latest.possession.home.toFixed(0)}–{strip.tempo.latest.possession.away.toFixed(0)}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function BandLabel({ y, text }: { y: number; text: string }) {
  return (
    <text x={4} y={y} fill="var(--color-muted)" fontSize={9} fontWeight={600}>
      {text}
    </text>
  );
}

function Spike({
  spike,
  x,
  baseline,
  direction,
  maxH,
}: {
  spike: ShockSpike;
  x: number;
  baseline: number;
  direction: 1 | -1;
  maxH: number;
}) {
  const h = Math.max(4, spike.severity * maxH);
  const y2 = baseline + direction * h;
  const color = spikeColor(spike);
  const bold = spike.track === "tempo" && (spike.kind === "goal" || spike.kind === "red");
  return (
    <g>
      <line x1={x} y1={baseline} x2={x} y2={y2} stroke={color} strokeWidth={bold ? 2.2 : 1.4} />
      <circle cx={x} cy={y2} r={bold ? 3.2 : 2.2} fill={color} />
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
      const y = baseline - (total / maxShots) * maxH;
      return `${x(p.minute).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const sotPts = series
    .map((p) => {
      const total = p.sotHome + p.sotAway;
      const y = baseline - (total / maxSot) * maxH * 0.72;
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

function OddsLines({
  points,
  x,
  baseline,
  maxH,
  viewId,
}: {
  points: OddsViewPoint[];
  x: (m: number) => number;
  baseline: number;
  maxH: number;
  viewId: OddsViewId;
}) {
  if (points.length < 1) return null;

  if (viewId === "swing") {
    const pts = points
      .filter((p) => p.favoriteProb != null)
      .map((p) => {
        const y = baseline - (p.favoriteProb ?? 0) * maxH;
        return `${x(p.minute).toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    if (!pts) return null;
    return <polyline points={pts} fill="none" stroke="var(--color-warn)" strokeWidth={1.7} opacity={0.9} />;
  }

  const keys = collectKeys(points);
  const colors = ["var(--color-info)", "var(--color-cyan)", "var(--color-brand)", "var(--color-muted)"];
  return (
    <g>
      {keys.map((key, i) => {
        const pts = points
          .map((p) => {
            const sel = p.selections.find((s) => s.key === key);
            if (!sel) return null;
            const y = baseline - sel.prob * maxH;
            return `${x(p.minute).toFixed(1)},${y.toFixed(1)}`;
          })
          .filter(Boolean)
          .join(" ");
        if (!pts) return null;
        return (
          <polyline
            key={key}
            points={pts}
            fill="none"
            stroke={colors[i % colors.length]}
            strokeWidth={1.5}
            opacity={0.9}
          />
        );
      })}
    </g>
  );
}

function collectKeys(points: OddsViewPoint[]): string[] {
  const keys: string[] = [];
  for (const p of points) {
    for (const s of p.selections) {
      if (!keys.includes(s.key)) keys.push(s.key);
    }
  }
  return keys.slice(0, 4);
}

function polylineFromHybrid(
  series: HybridSeriesPoint[],
  x: (m: number) => number,
  baseline: number,
  maxH: number,
  field: "thesisProb" | "pressure",
): string | null {
  if (series.length < 2) return null;
  return series
    .map((p) => {
      const y = baseline - p[field] * maxH * 0.92;
      return `${x(p.minute).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function spikeColor(spike: ShockSpike): string {
  if (spike.kind === "goal" || spike.kind === "red" || spike.kind === "horizon_collapse") {
    return "var(--color-brand)";
  }
  if (spike.kind === "yellow" || spike.kind === "odds_swing") return "var(--color-warn)";
  if (spike.kind === "shot_on_target" || spike.kind === "dangerous_attack") return "var(--color-info)";
  if (spike.kind === "shot" || spike.kind === "attack") return "var(--color-cyan)";
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
