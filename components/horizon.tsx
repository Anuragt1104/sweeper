"use client";

import { useEffect, useState } from "react";
import type { EngineState } from "@/lib/engine/state";
import type { HorizonOutcome } from "@/lib/horizon/probability";

const OUTCOMES: HorizonOutcome[] = ["goal_home", "goal_away", "card", "quiet"];
const OUTCOME_TONE: Record<HorizonOutcome, string> = {
  goal_home: "horizon-home",
  goal_away: "horizon-away",
  card: "horizon-booking",
  quiet: "horizon-quiet",
};

export function HorizonExperience({
  state,
  demoLabel = false,
}: {
  state: EngineState | null;
  demoLabel?: boolean;
}) {
  const horizon = state?.horizon;
  const current = horizon?.current;
  const [shattering, setShattering] = useState(false);
  const collapseId = horizon?.lastCollapse?.id;

  useEffect(() => {
    if (!collapseId) return;
    setShattering(true);
    const timer = window.setTimeout(() => setShattering(false), 400);
    return () => window.clearTimeout(timer);
  }, [collapseId]);

  const live =
    state?.mode === "live" &&
    state.feedHealth.status === "live" &&
    state.feedHealth.hydratedScore &&
    state.feedHealth.hydratedOdds &&
    state.feedHealth.scoreStreamAccepted &&
    state.feedHealth.oddsStreamAccepted;
  const badge =
    state?.provenance === "recorded_live"
      ? "RECORDED LIVE"
      : live
        ? "LIVE"
        : state?.mode === "simulation" || demoLabel
          ? "DEMO"
          : "NOT LIVE";
  const remaining =
    current && state?.current ? Math.max(0, current.closesMinute - state.current.minute) : 0;

  return (
    <section
      className={`horizon-shell horizon-compact ${shattering ? "is-shattering" : ""}`}
      aria-label="Horizon probabilities"
    >
      <div className="horizon-topline horizon-topline-compact">
        <div>
          <div className="eyebrow">Next material event · 10′ window</div>
        </div>
        <div className="flex items-center justify-end gap-2 flex-nowrap min-w-0">
          <span className={`mode-badge shrink-0 ${live ? "is-live" : demoLabel ? "is-replay" : ""}`}>
            {badge}
          </span>
          <span className={`health-pill health-${state?.feedHealth.status ?? "offline"} shrink-0`}>
            <span className="health-dot" /> {state?.feedHealth.status ?? "offline"}
          </span>
          <span className="horizon-clock tnum whitespace-nowrap shrink-0 min-w-[11rem] text-right">
            {current
              ? `${remaining.toFixed(1)}′ left · closes ${current.closesMinute.toFixed(1)}′`
              : "awaiting first tick"}
          </span>
        </div>
      </div>

      {current ? (
        <div className="horizon-strip" data-testid="horizon-deck">
          {OUTCOMES.map((outcome) => {
            const probability = current.probabilities[outcome];
            const thesis = current.thesis === outcome;
            const action = current.action === outcome;
            return (
              <article key={outcome} className={`horizon-strip-card ${OUTCOME_TONE[outcome]}`}>
                <div className="horizon-strip-label">{outcomeLabel(outcome, state)}</div>
                <div className="horizon-strip-prob tnum">
                  {(probability * 100).toFixed(1)}
                  <small>%</small>
                </div>
                <div className="horizon-bar">
                  <span style={{ width: `${probability * 100}%` }} />
                </div>
                <div className="horizon-badges">
                  {thesis && <span className="prediction-badge thesis">THESIS</span>}
                  {action && <span className="prediction-badge action">ACTION</span>}
                  {!thesis && !action && <span className="prediction-placeholder">—</span>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="horizon-strip" data-testid="horizon-deck">
          {OUTCOMES.map((outcome) => (
            <article key={outcome} className={`horizon-strip-card ${OUTCOME_TONE[outcome]}`}>
              <div className="horizon-strip-label">{outcomeLabel(outcome, state)}</div>
              <div className="horizon-strip-prob tnum">
                —<small>%</small>
              </div>
              <div className="horizon-bar">
                <span style={{ width: "0%" }} />
              </div>
              <div className="horizon-badges">
                <span className="prediction-placeholder">—</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function HorizonAdvanced({ state }: { state: EngineState | null }) {
  const horizon = state?.horizon;
  const current = horizon?.current;

  return (
    <div className="space-y-4">
      {current && (
        <div className="horizon-meta-grid">
          <div className="horizon-meta">
            <span className="eyebrow">Publication</span>
            <strong className="tnum">#{current.refreshNumber}</strong>
            <span>
              {current.openedMinute.toFixed(1)}′ → {current.closesMinute.toFixed(1)}′ · fixed close
            </span>
          </div>
          <div className="horizon-meta">
            <span className="eyebrow">Evidence</span>
            <strong className={current.lowData ? "text-warn" : "text-up"}>
              {current.lowData ? "LOW DATA" : `N=${current.support}`}
            </strong>
            <span>
              {current.bucket} · {current.fallback.replaceAll("_", " ")}
            </span>
          </div>
          <div className={`horizon-meta ${horizon?.oddsSwing.active ? "swing-active" : ""}`}>
            <span className="eyebrow">180s odds swing</span>
            <strong>{horizon?.oddsSwing.active ? "ACTIVE" : "CLEAR"}</strong>
            <span>
              {horizon?.oddsSwing.favorite
                ? `${horizon.oddsSwing.favorite} favourite · ${((horizon.oddsSwing.delta ?? 0) * 100).toFixed(1)}pp`
                : (horizon?.oddsSwing.reason ?? "").replaceAll("_", " ")}
            </span>
          </div>
          <div className="horizon-meta">
            <span className="eyebrow">Feed truth</span>
            <strong>{state?.feedHealth.watching ?? 0} watching</strong>
            <span>{state?.feedHealth.detail}</span>
          </div>
        </div>
      )}

      <div className="machine-row">
        <CollapseTicker state={state} />
        <MachineLedger state={state} />
      </div>

      {horizon && (
        <details className="json-inspector">
          <summary>JSON inspector · public endpoint parity</summary>
          <pre>
            {JSON.stringify(
              { fixture: state?.fixture, mode: state?.mode, feedHealth: state?.feedHealth, horizon },
              null,
              2,
            )}
          </pre>
        </details>
      )}
    </div>
  );
}

export function StrategyContext({ state }: { state: EngineState | null }) {
  const last = state?.shockStrip?.hybrid.series.at(-1) ?? null;
  const collapses = state?.shockStrip?.hybrid.markers ?? [];
  const diverged =
    last != null && Math.abs(last.tempoIntensity - last.oddsVelocity) >= 0.35;

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-4 gap-2">
        <Metric label="Tempo intensity" value={pct(last?.tempoIntensity)} />
        <Metric label="Odds velocity" value={pct(last?.oddsVelocity)} />
        <Metric label="Hybrid pressure" value={pct(last?.pressure)} />
        <Metric label="Thesis" value={last?.thesis?.replaceAll("_", " ") ?? "—"} />
      </div>
      {diverged && (
        <div className="text-xs text-warn border border-[rgba(245,185,66,.35)] rounded-lg px-3 py-2 bg-[rgba(245,185,66,.06)]">
          Divergence · Tempo and Odds disagree (
          {((last!.tempoIntensity - last!.oddsVelocity) * 100).toFixed(0)}pp gap). Hybrid pressure
          blends both.
        </div>
      )}
      <div>
        <div className="eyebrow mb-2">Recent Hybrid collapses</div>
        {collapses.length === 0 ? (
          <div className="text-xs text-faint">No collapses yet</div>
        ) : (
          <div className="flex flex-col gap-1">
            {collapses
              .slice(-6)
              .reverse()
              .map((m) => (
                <div key={m.id} className="text-xs text-muted flex gap-3 tnum">
                  <span>{m.minute.toFixed(1)}′</span>
                  <span className="text-ink">{m.label}</span>
                  <span className="text-faint ml-auto">sev {(m.severity * 100).toFixed(0)}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2 bg-panel2">
      <div className="eyebrow">{label}</div>
      <div className="text-sm font-semibold mt-1 tnum">{value}</div>
    </div>
  );
}

function pct(v: number | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(0)}%`;
}

function CollapseTicker({ state }: { state: EngineState | null }) {
  const ticker = state?.horizon.collapseTicker ?? [];
  return (
    <div className="machine-panel collapse-panel">
      <div className="machine-head">
        <span>Collapse ticker</span>
        <span>{ticker.length} transitions</span>
      </div>
      <div className="collapse-list">
        {ticker.length === 0 && <span className="machine-empty">No settled Horizon yet</span>}
        {ticker.slice(0, 7).map((collapse) => (
          <div key={collapse.id} className="collapse-item">
            <span className={`collapse-winner ${OUTCOME_TONE[collapse.winner]}`}>
              {shortOutcome(collapse.winner)}
            </span>
            <span className="tnum">{collapse.minute.toFixed(1)}′</span>
            <span>{(collapse.settlingProbability * 100).toFixed(1)}%</span>
            {collapse.surprise && <b className="text-warn">SURPRISE</b>}
            {collapse.thesisDead && <b className="text-down">THESIS DEAD</b>}
          </div>
        ))}
      </div>
    </div>
  );
}

function MachineLedger({ state }: { state: EngineState | null }) {
  const metrics = state?.horizon.metrics;
  const values = [
    ["Opened", metrics?.horizonsOpened ?? 0],
    ["Settled", metrics?.horizonsSettled ?? 0],
    ["Thesis hit", `${((metrics?.thesisHitRate ?? 0) * 100).toFixed(0)}%`],
    ["Action hit", `${((metrics?.actionHitRate ?? 0) * 100).toFixed(0)}%`],
    ["Surprises", metrics?.surprises ?? 0],
    ["Thesis dead", metrics?.thesisDeadCount ?? 0],
    ["Mean Brier", (metrics?.meanBrierScore ?? 0).toFixed(3)],
    ["Latency", `${metrics?.liveCollapseLatencyMs ?? 0}ms`],
  ];
  return (
    <div className="machine-panel">
      <div className="machine-head">
        <span>Machine Ledger</span>
        <span>four-class scorecard</span>
      </div>
      <div className="machine-metrics">
        {values.map(([label, value]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <strong className="tnum">{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function outcomeLabel(outcome: HorizonOutcome, state: EngineState | null): string {
  if (outcome === "goal_home") return `Goal · ${state?.fixture.homeCode ?? "home"}`;
  if (outcome === "goal_away") return `Goal · ${state?.fixture.awayCode ?? "away"}`;
  if (outcome === "card") return "Card";
  return "Quiet";
}

function shortOutcome(outcome: HorizonOutcome): string {
  return outcome === "goal_home"
    ? "HOME GOAL"
    : outcome === "goal_away"
      ? "AWAY GOAL"
      : outcome.toUpperCase();
}
