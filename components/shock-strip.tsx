"use client";

import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { EngineState } from "@/lib/engine/state";
import type { HorizonPublication } from "@/lib/horizon/machine";
import type { OddsViewId, OddsViewPoint, ShockSpike, StrategyLensPoint, StrategyLensSeries } from "@/lib/tempo/types";
import { ODDS_VIEW_LABELS, ODDS_VIEW_ORDER } from "@/lib/tempo/types";
import {
  HORIZON_PATH_COLORS,
  HORIZON_PATH_LABELS,
  OUTCOME_ORDER,
  projectHorizonForecast,
  projectOddsLensForecast,
  type ForecastPoint,
} from "@/lib/tempo/forecast";

const WIDTH = 720;
const HEIGHT = 200;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 24;

const COLOR_TEMPO = "var(--color-cyan)";
const COLOR_ODDS = "var(--color-info)";
const COLOR_HYBRID = "var(--color-brand)";

const ODDS_PATH_COLORS = ["#5aa6ff", "#2fe0cf", "#c8f751", "#f5b942", "#fb6f86"];

export function ShockStrip({
  state,
  selectedContract,
  onSelectContract,
}: {
  state: EngineState;
  selectedContract: OddsViewId;
  onSelectContract: (id: OddsViewId) => void;
}) {
  const strip = state.shockStrip;
  const minute = Math.max(0, state.current?.minute ?? 0);
  const horizon = state.horizon?.current ?? null;
  const [compareAll, setCompareAll] = useState(false);

  const available = ODDS_VIEW_ORDER.filter(
    (id) => strip.strategies?.[id]?.available || strip.odds.availableViews.includes(id),
  );
  // Always render the full fixed grid so bet availability never reshapes layout.
  const charts = ODDS_VIEW_ORDER;
  const model = state.deskModel;
  const intensity = state.matchIntensity;
  const path = state.deskPath;

  return (
    <section className="panel strategies-chart shock-slot" aria-label="Contract lenses · Tempo Odds Hybrid">
      <div className="panel-head flex items-center gap-2">
        <div className="mr-auto min-w-0">
          <span className="text-sm font-semibold">Contract lenses</span>
          <span className="ml-2 text-[11px] text-faint whitespace-nowrap">
            Tempo · Odds · Hybrid per market · not the shared desk signals
          </span>
        </div>
        <span className={`text-[11px] shrink-0 ${tempoTone(strip.tempo.status)}`}>
          Tempo · {strip.tempo.source} · {strip.tempo.status}
        </span>
      </div>

      <div className="px-3 pt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted min-h-[28px] border-b border-line/60 pb-2">
        <span className="text-[10px] uppercase tracking-wide text-faint shrink-0">Desk signals</span>
        <span className="tnum">
          Tempo {pct(model?.hybrid.tempoIntensity)}
        </span>
        <span className="tnum">
          |Δodds| {pct(model ? Math.abs(model.hybrid.signedOddsVelocityHome) : undefined)}
        </span>
        <span className="tnum">Pressure {pct(model?.hybrid.pressure)}</span>
        <span className="tnum">Q {state.quality}</span>
        {path?.regime && <span className="chip text-[10px]">{path.regime}</span>}
        {intensity?.flurrySummary && (
          <span className="chip text-[10px] text-warn">{intensity.flurrySummary}</span>
        )}
        {(intensity?.cardsLast5Min ?? 0) >= 2 && (
          <span className="chip text-[10px] text-warn">{intensity!.cardsLast5Min} cards / 5′</span>
        )}
        {intensity?.redCardActive && <span className="chip text-[10px] text-down">red active</span>}
        {intensity?.isComeback && <span className="chip text-[10px] text-brand">comeback</span>}
        <span className="text-faint ml-auto truncate max-w-[35%]">{strip.tempo.detail}</span>
      </div>

      <div className="px-3 pt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted min-h-[28px]">
        <Legend swatch={COLOR_TEMPO} label="Tempo (solid)" />
        <Legend swatch={COLOR_ODDS} label="Odds (solid)" />
        <Legend swatch={COLOR_HYBRID} label="Hybrid (solid)" />
        <Legend swatch={COLOR_HYBRID} label="Hybrid forecast" dotted />
      </div>

      <div className="px-3 pt-2 flex flex-wrap gap-1.5 min-h-[32px]">
        <button
          type="button"
          onClick={() => setCompareAll((v) => !v)}
          className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
            compareAll ? "border-brand text-ink bg-panel2" : "border-line2 text-muted hover:border-line"
          }`}
        >
          {compareAll ? "Comparing all" : "Compare all"}
        </button>
        {ODDS_VIEW_ORDER.map((id) => {
          const availableView = available.includes(id);
          return (
            <button
              key={id}
              type="button"
              disabled={!availableView && id !== selectedContract}
              onClick={() => {
                setCompareAll(false);
                onSelectContract(id);
              }}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                !compareAll && selectedContract === id
                  ? "border-brand text-ink bg-panel2"
                  : availableView
                    ? "border-line2 text-muted hover:border-line"
                    : "border-line text-faint opacity-40 cursor-not-allowed"
              }`}
            >
              {ODDS_VIEW_LABELS[id]}
            </button>
          );
        })}
      </div>

      <p className="px-3 pt-1.5 text-[11px] text-faint">
        Lenses show how shared tempo/odds look on each contract. Agents trade contracts; PnL is on fills.
      </p>

      <div className="p-3 strategies-chart__grid">
        {charts.map((id) => {
          const lens =
            strip.strategies?.[id] ??
            ({
              id,
              label: ODDS_VIEW_LABELS[id],
              available: false,
              blurb: "",
              series: [],
            } satisfies StrategyLensSeries);
          const dimmed = !compareAll && selectedContract !== id;
          return (
            <div
              key={id}
              className={dimmed ? "opacity-45" : undefined}
              onClick={() => {
                if (available.includes(id) || id === selectedContract) {
                  setCompareAll(false);
                  onSelectContract(id);
                }
              }}
              role="presentation"
            >
              <LensChart
                lens={lens}
                minute={minute}
                horizon={id === "next_score" ? horizon : null}
                oddsPoint={strip.odds.views[id]?.points.at(-1)}
                collapses={strip.hybrid.markers}
                tempoMarkers={strip.tempo.markers}
              />
            </div>
          );
        })}
      </div>

      <div className="px-3 pb-3 flex flex-wrap gap-4 text-xs tnum text-muted min-h-[28px]">
        <span>
          Shots {strip.tempo.latest?.shots.home ?? 0}–{strip.tempo.latest?.shots.away ?? 0}
        </span>
        <span>
          On target {strip.tempo.latest?.sot.home ?? 0}–{strip.tempo.latest?.sot.away ?? 0}
        </span>
        <span>
          Fouls {strip.tempo.latest?.fouls.home ?? 0}–{strip.tempo.latest?.fouls.away ?? 0}
        </span>
        <span>
          Poss {(strip.tempo.latest?.possession.home ?? 0).toFixed(0)}–
          {(strip.tempo.latest?.possession.away ?? 0).toFixed(0)}
        </span>
      </div>
    </section>
  );
}

interface HoverState {
  minute: number;
  mode: "observed" | "forecast" | "tempo_event" | "collapse";
  point: StrategyLensPoint | null;
  forecast: ForecastPoint | null;
  spike: ShockSpike | null;
  svgX: number;
  clientX: number;
  clientY: number;
  nearby: ShockSpike[];
}

function LensChart({
  lens,
  minute,
  horizon,
  oddsPoint,
  collapses,
  tempoMarkers,
}: {
  lens: StrategyLensSeries;
  minute: number;
  horizon: HorizonPublication | null;
  oddsPoint: OddsViewPoint | undefined;
  collapses: ShockSpike[];
  tempoMarkers: ShockSpike[];
}) {
  const h = HEIGHT;
  const plotH = h - PAD_T - PAD_B;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const x = (m: number) => PAD_L + (Math.min(Math.max(m, 0), 90) / 90) * (WIDTH - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - clamp01(v)) * plotH;
  const minuteFromSvgX = (svgX: number) =>
    clamp((svgX - PAD_L) / Math.max(1, WIDTH - PAD_L - PAD_R), 0, 1) * 90;

  const last = lens.series[lens.series.length - 1] ?? null;
  const visibleTempo = useMemo(
    () => tempoMarkers.filter((s) => s.minute <= minute + 0.01).slice(-40),
    [tempoMarkers, minute],
  );

  const forecast = useMemo(() => {
    if (!last) return [] as ForecastPoint[];
    if (lens.id === "next_score" && horizon) {
      return projectHorizonForecast(horizon, Math.max(minute, last.minute), last.hybridProb);
    }
    return projectOddsLensForecast(lens.id, last, oddsPoint, Math.max(minute, last.minute));
  }, [lens.id, last, horizon, oddsPoint, minute]);

  const tempoLine = useMemo(
    () => polyline01(lens.series.map((p) => ({ minute: p.minute, value: p.tempoIntensity })), x, y),
    [lens.series, plotH],
  );
  const oddsLine = useMemo(
    () => polyline01(lens.series.map((p) => ({ minute: p.minute, value: p.oddsProb })), x, y),
    [lens.series, plotH],
  );
  const hybridLine = useMemo(
    () => polyline01(lens.series.map((p) => ({ minute: p.minute, value: p.hybridProb })), x, y),
    [lens.series, plotH],
  );

  const hybridForecastLine = useMemo(
    () => polyline01(forecast.map((p) => ({ minute: p.minute, value: p.hybrid })), x, y),
    [forecast, plotH],
  );

  const pathKeys = useMemo(() => {
    if (forecast.length === 0) return [] as string[];
    if (lens.id === "next_score") return [...OUTCOME_ORDER];
    return Object.keys(forecast[0].paths).slice(0, 4);
  }, [forecast, lens.id]);

  const pathLines = useMemo(() => {
    return pathKeys.map((key) => ({
      key,
      points: polyline01(
        forecast.map((p) => ({ minute: p.minute, value: p.paths[key] ?? 0 })),
        x,
        y,
      ),
      color:
        lens.id === "next_score" && key in HORIZON_PATH_COLORS
          ? HORIZON_PATH_COLORS[key as keyof typeof HORIZON_PATH_COLORS]
          : ODDS_PATH_COLORS[pathKeys.indexOf(key) % ODDS_PATH_COLORS.length],
      label:
        lens.id === "next_score" && key in HORIZON_PATH_LABELS
          ? HORIZON_PATH_LABELS[key as keyof typeof HORIZON_PATH_LABELS]
          : key,
    }));
  }, [forecast, pathKeys, lens.id, plotH]);

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * WIDTH;
    const svgY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * h;
    const hoverMinute = minuteFromSvgX(svgX);

    // Prefer glyphs when the pointer is near them (bottom ticks / collapse dots).
    const nearCollapseBand = Math.abs(svgY - y(0.08)) < 18;
    const nearTempoBand = svgY > h - PAD_B - 22;
    if (nearCollapseBand && collapses.length > 0) {
      const spike = nearestSpike(collapses, hoverMinute, 2.5);
      if (spike) {
        setHover({
          minute: spike.minute,
          mode: "collapse",
          point: null,
          forecast: null,
          spike,
          svgX: x(spike.minute),
          clientX: e.clientX,
          clientY: e.clientY,
          nearby: [],
        });
        return;
      }
    }
    if (nearTempoBand && visibleTempo.length > 0) {
      const spike = nearestSpike(visibleTempo, hoverMinute, 2.0);
      if (spike) {
        setHover({
          minute: spike.minute,
          mode: "tempo_event",
          point: null,
          forecast: null,
          spike,
          svgX: x(spike.minute),
          clientX: e.clientX,
          clientY: e.clientY,
          nearby: visibleTempo
            .filter((s) => Math.abs(s.minute - spike.minute) <= 1.2 && s.id !== spike.id)
            .slice(0, 3),
        });
        return;
      }
    }

    const inForecast = forecast.length > 0 && hoverMinute > minute + 0.05;
    if (inForecast) {
      const fp = nearestForecast(forecast, hoverMinute);
      if (!fp) return;
      setHover({
        minute: fp.minute,
        mode: "forecast",
        point: null,
        forecast: fp,
        spike: null,
        svgX: x(fp.minute),
        clientX: e.clientX,
        clientY: e.clientY,
        nearby: [],
      });
      return;
    }

    if (lens.series.length === 0) return;
    const point = nearestPoint(lens.series, hoverMinute);
    if (!point) return;
    const nearby = [...visibleTempo, ...collapses]
      .filter((s) => Math.abs(s.minute - point.minute) <= 1.5)
      .sort((a, b) => a.minute - b.minute)
      .slice(0, 4);
    setHover({
      minute: point.minute,
      mode: "observed",
      point,
      forecast: null,
      spike: null,
      svgX: x(point.minute),
      clientX: e.clientX,
      clientY: e.clientY,
      nearby,
    });
  }

  function onPointerLeave() {
    setHover(null);
  }

  const tipStyle = hoverTipStyle(hover, wrapRef.current);

  return (
    <div ref={wrapRef} className="relative rounded-xl border border-line bg-panel2/40 overflow-hidden">
      <div className="px-3 py-2 flex items-baseline gap-2 border-b border-line lens-chart-head">
        <span className="text-sm font-semibold shrink-0">{lens.label}</span>
        <span className="text-[11px] text-faint truncate">{lens.blurb || (lens.available ? "" : "awaiting market")}</span>
        <span className="ml-auto text-[11px] tnum text-muted shrink-0 lens-chart-metrics whitespace-nowrap">
          T {((last?.tempoIntensity ?? 0) * 100).toFixed(0)} · O {((last?.oddsProb ?? 0) * 100).toFixed(0)} · H{" "}
          {((last?.hybridProb ?? 0) * 100).toFixed(0)}
        </span>
      </div>

      <div className="px-3 pt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted min-h-[22px] overflow-hidden">
        {pathKeys.length > 0 ? (
          <>
            <span className="text-faint uppercase tracking-wide">Forecast paths</span>
            {pathLines.map((path) => (
              <span key={path.key} className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-3 border-t-2 border-dotted"
                  style={{ borderColor: path.color }}
                />
                {path.label}
              </span>
            ))}
          </>
        ) : (
          <span className="text-faint">Forecast paths appear once the series has samples</span>
        )}
      </div>

      <div className="p-2 strategies-chart__viewport">
        <svg
          viewBox={`0 0 ${WIDTH} ${h}`}
          className="w-full h-full cursor-crosshair"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${lens.label} strategies`}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          <title>{lens.label} Tempo Odds Hybrid</title>
          {[0, 0.5, 1].map((v) => (
            <line
              key={v}
              x1={PAD_L}
              y1={y(v)}
              x2={WIDTH - PAD_R}
              y2={y(v)}
              stroke="var(--color-line)"
              strokeWidth={1}
              opacity={0.35}
            />
          ))}
          {[0, 15, 30, 45, 60, 75, 90].map((m) => (
            <g key={m}>
              <line
                x1={x(m)}
                y1={PAD_T}
                x2={x(m)}
                y2={h - PAD_B}
                stroke="var(--color-line)"
                strokeWidth={1}
                opacity={0.3}
              />
              <text
                x={x(m)}
                y={h - 6}
                textAnchor="middle"
                fill="var(--color-faint)"
                fontSize={9}
                fontFamily="var(--font-mono)"
              >
                {m}′
              </text>
            </g>
          ))}

          {tempoLine && (
            <polyline points={tempoLine} fill="none" stroke={COLOR_TEMPO} strokeWidth={1.5} opacity={0.88} />
          )}
          {oddsLine && (
            <polyline points={oddsLine} fill="none" stroke={COLOR_ODDS} strokeWidth={1.6} opacity={0.9} />
          )}
          {hybridLine && (
            <polyline points={hybridLine} fill="none" stroke={COLOR_HYBRID} strokeWidth={2} opacity={0.98} />
          )}

          {pathLines.map((path) =>
            path.points ? (
              <polyline
                key={path.key}
                points={path.points}
                fill="none"
                stroke={path.color}
                strokeWidth={1.35}
                strokeDasharray="3 3"
                opacity={0.55}
              />
            ) : null,
          )}

          {hybridForecastLine && (
            <polyline
              points={hybridForecastLine}
              fill="none"
              stroke={COLOR_HYBRID}
              strokeWidth={2.1}
              strokeDasharray="6 4"
              opacity={0.9}
            />
          )}

          {visibleTempo.map((spike) => {
            const active = hover?.spike?.id === spike.id;
            return (
              <g key={spike.id}>
                <line
                  x1={x(spike.minute)}
                  y1={h - PAD_B}
                  x2={x(spike.minute)}
                  y2={h - PAD_B - (active ? 14 : 9)}
                  stroke={COLOR_TEMPO}
                  strokeWidth={active ? 2.2 : 1.4}
                  opacity={active ? 1 : 0.7}
                />
                <title>{`${fmtMinute(spike.minute)} · ${spikeTitle(spike)}`}</title>
              </g>
            );
          })}

          {collapses.map((spike) => {
            const active = hover?.spike?.id === spike.id;
            const surprise = spike.severity >= 0.9 || /SURPRISE/i.test(spike.label);
            return (
              <g key={spike.id}>
                <circle
                  cx={x(spike.minute)}
                  cy={y(0.08)}
                  r={active ? 5 : surprise ? 4 : 3}
                  fill={surprise ? "var(--color-warn)" : COLOR_HYBRID}
                  stroke="var(--color-bg)"
                  strokeWidth={1.5}
                />
                <title>{`${fmtMinute(spike.minute)} · ${spikeTitle(spike)}`}</title>
              </g>
            );
          })}

          <line
            x1={x(minute)}
            y1={PAD_T}
            x2={x(minute)}
            y2={h - PAD_B}
            stroke="var(--color-ink)"
            strokeWidth={1.3}
            strokeDasharray="3 3"
            opacity={0.5}
          />
          {last && (
            <circle cx={x(last.minute)} cy={y(last.hybridProb)} r={3.2} fill={COLOR_HYBRID} />
          )}

          {hover && (
            <g pointerEvents="none">
              <line
                x1={hover.svgX}
                y1={PAD_T}
                x2={hover.svgX}
                y2={h - PAD_B}
                stroke="var(--color-ink)"
                strokeWidth={1.2}
                opacity={0.75}
              />
              {hover.mode === "observed" && hover.point && (
                <>
                  <circle
                    cx={hover.svgX}
                    cy={y(hover.point.tempoIntensity)}
                    r={3.5}
                    fill={COLOR_TEMPO}
                    stroke="var(--color-bg)"
                    strokeWidth={1.5}
                  />
                  <circle
                    cx={hover.svgX}
                    cy={y(hover.point.oddsProb)}
                    r={3.5}
                    fill={COLOR_ODDS}
                    stroke="var(--color-bg)"
                    strokeWidth={1.5}
                  />
                  <circle
                    cx={hover.svgX}
                    cy={y(hover.point.hybridProb)}
                    r={4}
                    fill={COLOR_HYBRID}
                    stroke="var(--color-bg)"
                    strokeWidth={1.5}
                  />
                </>
              )}
              {hover.mode === "forecast" && hover.forecast && (
                <circle
                  cx={hover.svgX}
                  cy={y(hover.forecast.hybrid)}
                  r={4}
                  fill={COLOR_HYBRID}
                  stroke="var(--color-bg)"
                  strokeWidth={1.5}
                />
              )}
            </g>
          )}
        </svg>
      </div>

      {hover && tipStyle && (
        <div className="strategy-hover-node" style={tipStyle} role="status">
          <div className="strategy-hover-node__head">
            <span className="font-semibold text-ink">{hoverTitle(lens.label, hover)}</span>
            <span className="tnum text-faint">{fmtMinute(hover.minute)}</span>
          </div>
          {hover.mode === "observed" && hover.point && (
            <div className="strategy-hover-node__rows">
              <HoverRow tone={COLOR_TEMPO} label="Tempo" value={pct(hover.point.tempoIntensity)} />
              <HoverRow
                tone={COLOR_ODDS}
                label="Odds"
                value={`${pct(hover.point.oddsProb)}${hover.point.label ? ` · ${hover.point.label}` : ""}`}
              />
              <HoverRow tone={COLOR_HYBRID} label="Hybrid" value={pct(hover.point.hybridProb)} />
              <HoverRow tone="var(--color-muted)" label="Pressure" value={pct(hover.point.pressure)} />
            </div>
          )}
          {hover.mode === "forecast" && hover.forecast && (
            <div className="strategy-hover-node__rows">
              <HoverRow
                tone={COLOR_HYBRID}
                label="Hybrid path"
                value={`${pct(hover.forecast.hybrid)}${hover.forecast.thesis ? ` · ${hover.forecast.thesis}` : ""}`}
              />
              {Object.entries(hover.forecast.paths).map(([key, value]) => (
                <HoverRow
                  key={key}
                  tone={
                    key in HORIZON_PATH_COLORS
                      ? HORIZON_PATH_COLORS[key as keyof typeof HORIZON_PATH_COLORS]
                      : COLOR_ODDS
                  }
                  label={HORIZON_PATH_LABELS[key as keyof typeof HORIZON_PATH_LABELS] ?? key}
                  value={pct(value)}
                />
              ))}
            </div>
          )}
          {hover.mode === "tempo_event" && hover.spike && (
            <div className="strategy-hover-node__rows">
              {hover.spike.side && (
                <HoverRow tone="var(--color-muted)" label="Side" value={hover.spike.side} />
              )}
              <HoverRow tone={COLOR_TEMPO} label="Source" value={hover.spike.source} />
              <HoverRow
                tone="var(--color-muted)"
                label="Severity"
                value={`${(hover.spike.severity * 100).toFixed(0)}%`}
              />
            </div>
          )}
          {hover.mode === "collapse" && hover.spike && (
            <div className="strategy-hover-node__rows">
              <HoverRow
                tone={
                  /SURPRISE/i.test(hover.spike.label)
                    ? "var(--color-warn)"
                    : COLOR_HYBRID
                }
                label="Horizon"
                value={
                  /SURPRISE/i.test(hover.spike.label)
                    ? "SURPRISE"
                    : /THESIS DEAD|thesis dead/i.test(hover.spike.label)
                      ? "THESIS DEAD"
                      : "settled"
                }
              />
              <HoverRow
                tone="var(--color-muted)"
                label="Severity"
                value={`${(hover.spike.severity * 100).toFixed(0)}%`}
              />
            </div>
          )}
          {hover.nearby.length > 0 && (
            <div className="strategy-hover-node__events">
              {hover.nearby.map((s) => (
                <div key={s.id} className="strategy-hover-node__event">
                  <span className="tnum">{fmtMinute(s.minute)}</span>
                  <span>{spikeTitle(s)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function hoverTitle(lensLabel: string, hover: HoverState): string {
  if (hover.mode === "forecast") return `${lensLabel} · forecast`;
  if (hover.spike) return spikeTitle(hover.spike);
  return lensLabel;
}

/** Short event title for markers — "Foul", "Goal home", not generic category names. */
function spikeTitle(spike: ShockSpike): string {
  if (spike.track === "hybrid") {
    const winner = spike.label.includes("→")
      ? spike.label.split("→").at(-1)!.trim()
      : spike.label.replace(/^Horizon\s+(SURPRISE|collapse)\s*/i, "").trim();
    const outcome = humanizeToken(winner || "collapse");
    if (/SURPRISE/i.test(spike.label)) return `${outcome} · SURPRISE`;
    return outcome;
  }
  const fromKind = humanizeToken(spike.kind);
  if (spike.label) {
    // Prefer "Foul — Home" style labels when present; fall back to kind.
    const short = spike.label.split("—")[0]?.trim() || spike.label;
    if (short.length > 0 && short.length <= 28) {
      return spike.side ? `${short} · ${spike.side}` : short;
    }
  }
  return spike.side ? `${fromKind} · ${spike.side}` : fromKind;
}

function humanizeToken(token: string): string {
  return token
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function HoverRow({ tone, label, value }: { tone: string; label: string; value: string }) {
  return (
    <div className="strategy-hover-node__row">
      <span className="strategy-hover-node__swatch" style={{ background: tone }} />
      <span className="text-faint">{label}</span>
      <span className="tnum text-ink ml-auto">{value}</span>
    </div>
  );
}

function hoverTipStyle(
  hover: HoverState | null,
  wrap: HTMLDivElement | null,
): CSSProperties | null {
  if (!hover || !wrap) return null;
  const rect = wrap.getBoundingClientRect();
  const localX = hover.clientX - rect.left;
  const localY = hover.clientY - rect.top;
  const tipW = 200;
  const tipH = 140;
  const left = Math.min(Math.max(8, localX + 14), Math.max(8, rect.width - tipW - 8));
  const top = Math.min(Math.max(8, localY - tipH - 8), Math.max(8, rect.height - tipH - 8));
  return { left, top };
}

function nearestPoint(series: StrategyLensPoint[], minute: number): StrategyLensPoint | null {
  if (series.length === 0) return null;
  let best = series[0];
  let bestDist = Math.abs(best.minute - minute);
  for (const p of series) {
    const d = Math.abs(p.minute - minute);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

function nearestForecast(series: ForecastPoint[], minute: number): ForecastPoint | null {
  if (series.length === 0) return null;
  let best = series[0];
  let bestDist = Math.abs(best.minute - minute);
  for (const p of series) {
    const d = Math.abs(p.minute - minute);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

function nearestSpike(spikes: ShockSpike[], minute: number, maxDist: number): ShockSpike | null {
  if (spikes.length === 0) return null;
  let best: ShockSpike | null = null;
  let bestDist = maxDist;
  for (const s of spikes) {
    const d = Math.abs(s.minute - minute);
    if (d <= bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

function polyline01(
  series: { minute: number; value: number }[],
  x: (m: number) => number,
  y: (v: number) => number,
): string | null {
  if (series.length < 2) return null;
  return series.map((p) => `${x(p.minute).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
}

function Legend({
  swatch,
  label,
  dotted = false,
}: {
  swatch: string;
  label: string;
  dotted?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-4 h-0.5 rounded-sm"
        style={{
          background: dotted ? "transparent" : swatch,
          borderTop: dotted ? `2px dotted ${swatch}` : undefined,
        }}
      />
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

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function pct(v: number | undefined | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(0)}%`;
}

function fmtMinute(m: number): string {
  const r = Math.round(m * 10) / 10;
  return Number.isInteger(r) ? `${r}′` : `${r.toFixed(1)}′`;
}
