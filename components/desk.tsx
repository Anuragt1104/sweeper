"use client";

import { useState } from "react";
import type { AgentView, DeskPathView, EngineState } from "@/lib/engine/state";
import { AGENT_COLOR, Arena } from "@/components/panels";
import { Sparkline } from "@/components/charts";
import { pnlColor, shortHash, signFmt } from "@/components/format";

export function DeskHero({ state }: { state: EngineState }) {
  const [focusId, setFocusId] = useState<string | null>(state.leader);
  const focus =
    state.agents.find((a) => a.id === focusId) ??
    state.agents.find((a) => a.id === state.leader) ??
    state.agents[0] ??
    null;
  const sc = state.scorecard;
  const path = state.deskPath;

  return (
    <section className="panel desk-hero" aria-label="Agent Arena Desk">
      <div className="panel-head flex items-center gap-2">
        <div className="mr-auto min-w-0">
          <span className="text-sm font-semibold">Agent Arena</span>
          <span className="ml-2 text-[11px] text-faint whitespace-nowrap">
            {state.agents.length} strategies · path ·{" "}
            {state.executionMode === "shadow" ? "SHADOW" : "SIMULATED"} PnL
          </span>
        </div>
        <div className="desk-hero__chips">
          <span className={`chip text-brand text-[11px] ${sc.leaderName ? "" : "invisible"}`}>
            ▲ {sc.leaderName ?? "Leader"} {signFmt(sc.leaderPnl)}
          </span>
          <span
            className={`chip text-[11px] ${sc.intensityEdge != null ? pnlColor(sc.intensityEdge) : "invisible"}`}
          >
            Intensity lift {signFmt(sc.intensityEdge ?? 0)}
          </span>
          <span
            className={`chip text-[11px] ${sc.kellyEdge != null ? pnlColor(sc.kellyEdge) : "invisible"}`}
          >
            Kelly lift {signFmt(sc.kellyEdge ?? 0)}
          </span>
          <span
            className={`chip text-[11px] ${sc.regimeLift != null ? pnlColor(sc.regimeLift) : "invisible"}`}
          >
            Regime lift {signFmt(sc.regimeLift ?? 0)}
          </span>
          <RegimeChip regime={sc.regime} />
          <span className={`chip text-warn text-[11px] ${sc.stoodDownCount > 0 ? "" : "invisible"}`}>
            {Math.max(sc.stoodDownCount, 0)} stand-down
          </span>
        </div>
      </div>

      <div className="px-3 pt-2 desk-hero__summary text-[11px] text-muted">
        <span className="tnum truncate">
          Hybrid · {sc.hybridThesisTrades} ·{" "}
          <span className={pnlColor(sc.hybridThesisPnl)}>{signFmt(sc.hybridThesisPnl)}</span>
        </span>
        <span className="tnum truncate">
          Fade · {sc.collapseFadeTrades} ·{" "}
          <span className={pnlColor(sc.collapseFadePnl)}>{signFmt(sc.collapseFadePnl)}</span>
        </span>
        <span className="tnum truncate">
          Horizon {sc.horizonSettled}
          {sc.horizonThesisHitRate != null
            ? ` · hit ${(sc.horizonThesisHitRate * 100).toFixed(0)}%`
            : " · hit —"}
        </span>
        <span className="text-faint truncate text-right">
          {sc.warmedTicks > 0 ? `warmed ${sc.warmedTicks} · ` : ""}
          {state.tradeReadiness.ready
            ? "Desk ready"
            : `Stand-down · ${state.tradeReadiness.reasons[0] ?? "not ready"}`}
        </span>
      </div>

      <PathStrip path={path} />

      <div className="p-3 grid lg:grid-cols-[1.4fr_1fr] gap-3">
        <div className="rounded-xl border border-line bg-panel2/40 overflow-hidden">
          <Arena agents={state.agents} leader={state.leader} onSelect={setFocusId} selectedId={focus?.id} />
        </div>
        {focus ? <AgentDetail agent={focus} path={path} /> : <div className="agent-detail rounded-xl border border-line bg-panel2/40" />}
      </div>
    </section>
  );
}

function RegimeChip({ regime }: { regime: string }) {
  const tone =
    regime === "chaotic" ? "text-down" : regime === "calm" ? "text-up" : "text-muted";
  return <span className={`chip text-[11px] ${tone}`}>regime {regime || "—"}</span>;
}

function PathStrip({ path }: { path: DeskPathView | null }) {
  return (
    <div className="px-3 pb-2 grid sm:grid-cols-3 gap-2 desk-hero__path">
      <PathCard
        label="1X2 home path"
        series={path?.homeProbSeries ?? []}
        color="var(--color-info)"
        stats={[
          path?.homeRet1 != null ? `1′ ${pp(path.homeRet1)}` : "1′ —",
          path?.homeRet5 != null ? `5′ ${pp(path.homeRet5)}` : "5′ —",
          path?.homePathVol != null ? `vol ${(path.homePathVol * 100).toFixed(2)}` : "vol —",
        ]}
      />
      <PathCard
        label="Hybrid slope"
        series={path?.hybridSeries ?? []}
        color="var(--color-brand)"
        stats={[
          path?.hybridSlope5 != null ? `5′ ${pp(path.hybridSlope5)}/′` : "5′ —",
          path?.pressureDelta5 != null ? `ΔP ${pp(path.pressureDelta5)}` : "ΔP —",
          path?.tempoOddsDivergence ? "DIV" : "aligned",
        ]}
      />
      <PathCard
        label="Tempo intensity"
        series={path?.tempoSeries ?? []}
        color="var(--color-cyan)"
        stats={[
          path?.tempoAccel3 != null ? `accel ${pp(path.tempoAccel3)}` : "accel —",
          path?.minutesSinceCollapse != null
            ? `${path.minutesSinceCollapse.toFixed(1)}′ ago`
            : "no collapse",
          path?.lastCollapseWinner ?? "—",
        ]}
      />
    </div>
  );
}

function PathCard({
  label,
  series,
  color,
  stats,
}: {
  label: string;
  series: number[];
  color: string;
  stats: string[];
}) {
  return (
    <div className="rounded-lg border border-line/80 bg-panel2/30 px-2.5 py-2 desk-hero__path-card">
      <div className="text-[10px] uppercase tracking-wider text-faint mb-1">{label}</div>
      <div className="h-7">
        <Sparkline values={series.length ? series : [0, 0]} color={color} />
      </div>
      <div className="mt-1.5 flex gap-x-2 text-[10px] tnum text-muted desk-hero__path-stats overflow-hidden">
        {stats.map((s) => (
          <span key={s} className="truncate">
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function pp(x: number): string {
  const v = x * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}pp`;
}

export function AgentDetail({ agent, path }: { agent: AgentView; path: DeskPathView | null }) {
  const color = AGENT_COLOR[agent.id] ?? "var(--color-muted)";
  return (
    <div className="rounded-xl border border-line bg-panel2/40 p-3 space-y-3 agent-detail">
      <div className="flex items-start gap-2 min-h-[52px]">
        <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{agent.name}</div>
          <div className="text-[11px] text-faint line-clamp-2">{agent.blurb}</div>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1 shrink-0 min-w-[72px]">
          <span className="chip text-[10px] py-0">{agent.mode}</span>
          <span className={`chip text-warn text-[10px] py-0 ${agent.stoodDown ? "" : "invisible"}`}>
            stand-down
          </span>
          <span className="chip text-[10px] py-0">
            {(agent.lastDecisionKind ?? "hold").replaceAll("_", " ")}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="PnL" value={signFmt(agent.metrics.pnl)} tone={pnlColor(agent.metrics.pnl)} />
        <Metric label="Trades" value={String(agent.metrics.trades)} />
        <Metric label="Hit" value={`${(agent.metrics.hitRate * 100).toFixed(0)}%`} />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-faint mb-1">Equity</div>
        <div className="h-7">
          <Sparkline values={agent.curve.length ? agent.curve : [1000, 1000]} color={color} />
        </div>
      </div>

      <div className="min-h-[72px]">
        <div className="text-[10px] uppercase tracking-wider text-faint mb-1">Desk path</div>
        <div className="grid grid-cols-2 gap-1.5 text-[10px] tnum">
          <span className="text-faint">regime</span>
          <span className="text-ink text-right">{path?.regime ?? "—"}</span>
          <span className="text-faint">home 5′</span>
          <span className="text-ink text-right">{path?.homeRet5 != null ? pp(path.homeRet5) : "—"}</span>
          <span className="text-faint">hybrid slope</span>
          <span className="text-ink text-right">
            {path?.hybridSlope5 != null ? `${pp(path.hybridSlope5)}/′` : "—"}
          </span>
          <span className="text-faint">path vol</span>
          <span className="text-ink text-right">
            {path?.homePathVol != null ? `${(path.homePathVol * 100).toFixed(2)}pp` : "—"}
          </span>
        </div>
      </div>

      <div className="agent-detail__why">
        <div className="text-[10px] uppercase tracking-wider text-faint mb-1">Why</div>
        <p className="text-xs text-muted leading-snug line-clamp-3">{agent.lastRationale || "—"}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-faint agent-detail__inputs overflow-hidden">
          <span className={`chip py-0 ${agent.drivingInputs?.horizonThesis ? "" : "invisible"}`}>
            thesis {agent.drivingInputs?.horizonThesis ?? "—"}
          </span>
          <span className={`chip py-0 ${agent.drivingInputs?.hybridProb != null ? "" : "invisible"}`}>
            hybrid {((agent.drivingInputs?.hybridProb ?? 0) * 100).toFixed(0)}%
          </span>
          <span className={`chip py-0 ${agent.drivingInputs?.sentinelKind ? "" : "invisible"}`}>
            sentinel {agent.drivingInputs?.sentinelKind ?? "—"}
          </span>
        </div>
      </div>

      <div className="agent-detail__positions">
        <div className="text-[10px] uppercase tracking-wider text-faint mb-1">Positions</div>
        <ul className="space-y-1">
          {agent.positions.length === 0 ? (
            <li className="flex justify-between text-[11px] tnum text-faint">
              <span>flat</span>
              <span>0 · +0.00</span>
            </li>
          ) : (
            agent.positions.slice(0, 3).map((p) => (
              <li key={p.selId} className="flex justify-between text-[11px] tnum">
                <span className="text-muted truncate mr-2">{p.label}</span>
                <span className={pnlColor(p.unrealized)}>
                  {p.net > 0 ? "+" : ""}
                  {p.net} · {signFmt(p.unrealized)}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line/80 px-2 py-1.5">
      <div className={`text-sm font-semibold tnum ${tone ?? "text-ink"}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-faint">{label}</div>
    </div>
  );
}

export function CausalRail({ state }: { state: EngineState }) {
  const ordered = [...state.ledger.recent].reverse();
  const latestFill = [...ordered].reverse().find((record) => record.kind === "fill");
  const latestDecision = latestFill
    ? [...ordered]
        .reverse()
        .find((record) => record.kind === "decision" && latestFill.reactedToHash === record.hash)
    : [...ordered].reverse().find((record) => record.kind === "decision");
  const latestSignal = [...ordered].reverse().find((record) => record.kind === "signal");
  const latestTick = [...ordered].reverse().find((record) => record.kind === "tick");
  const horizonCollapse = [...ordered]
    .reverse()
    .find((record) => record.kind === "horizon_collapse");
  const leader = state.agents.find((agent) => agent.id === state.leader);

  const steps = [
    {
      label: "TxLINE tick",
      value: latestTick ? shortHash(latestTick.hash, 8) : "awaiting observation",
      hot: Boolean(latestTick),
    },
    {
      label: "Sentinel",
      value: latestSignal?.summary ?? "no anomaly signal",
      hot: Boolean(latestSignal),
    },
    {
      label: "Decision",
      value: latestDecision?.summary ?? (state.tradeReadiness.reasons.join("; ") || "standing by"),
      hot: Boolean(latestDecision),
    },
    {
      label: "Shadow fill",
      value: latestFill?.summary ?? "no fill this window",
      hot: Boolean(latestFill),
    },
    {
      label: "Horizon",
      value: horizonCollapse?.summary
        ? horizonCollapse.summary
        : state.horizon.current
          ? `open · ${state.horizon.current.thesis}`
          : "no window",
      hot: Boolean(horizonCollapse),
    },
    {
      label: "Leader PnL",
      value: leader ? `${leader.name} ${signFmt(leader.metrics.pnl)}` : "no positions",
      hot: Boolean(leader && leader.metrics.trades > 0),
    },
  ];

  return (
    <section className="panel causal-slot" aria-label="Causal rail">
      <div className="panel-head flex items-center gap-2">
        <span className="text-sm font-semibold">Causal rail</span>
        <span className="text-[11px] text-faint truncate">tick → signal → decision → fill</span>
        <span className={`chip text-[10px] py-0 ${state.deskPath ? "" : "invisible"}`}>
          path {state.deskPath?.regime ?? "—"}
        </span>
        <span className="ml-auto text-[10px] tnum text-faint shrink-0">
          root {shortHash(state.ledger.root, 10)}
        </span>
      </div>
      <div className="p-3">
        <div className="causal-grid">
          {steps.map((step, index) => (
            <div key={step.label} className={`causal-step ${step.hot ? "causal-step--hot" : ""}`}>
              <div className="eyebrow">
                {String(index + 1).padStart(2, "0")} · {step.label}
              </div>
              <div className="text-xs text-muted mt-1 line-clamp-3">{step.value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
