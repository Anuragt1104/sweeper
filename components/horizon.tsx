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

export function HorizonExperience({ state, replayLabel = false }: { state: EngineState | null; replayLabel?: boolean }) {
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

  const live = state?.mode === "live" && state.feedHealth.status === "live" && state.feedHealth.hydratedScore &&
    state.feedHealth.hydratedOdds && state.feedHealth.scoreStreamAccepted && state.feedHealth.oddsStreamAccepted;
  const badge = state?.provenance === "recorded_live"
    ? "RECORDED LIVE"
    : live
      ? "LIVE"
      : state?.mode === "simulation"
        ? "SIMULATION"
        : replayLabel
          ? "REPLAY"
          : "NOT LIVE";
  const remaining = current && state?.current ? Math.max(0, current.closesMinute - state.current.minute) : 0;

  return (
    <section className={`horizon-shell ${shattering ? "is-shattering" : ""}`} aria-label="N+1 Horizon Deck">
      <div className="horizon-topline">
        <div>
          <div className="eyebrow">N+1 Machine · next material event</div>
          <h1 className="horizon-title">The next ten match-minutes</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={`mode-badge ${live ? "is-live" : replayLabel ? "is-replay" : ""}`}>{badge}</span>
          <span className={`health-pill health-${state?.feedHealth.status ?? "offline"}`}>
            <span className="health-dot" /> {state?.feedHealth.status ?? "offline"}
          </span>
          <span className="horizon-clock tnum">
            {current ? `${remaining.toFixed(1)}′ left · closes ${current.closesMinute.toFixed(1)}′` : "awaiting first tick"}
          </span>
        </div>
      </div>

      {current ? (
        <>
          <div className="horizon-grid" data-testid="horizon-deck">
            {OUTCOMES.map((outcome) => {
              const probability = current.probabilities[outcome];
              const thesis = current.thesis === outcome;
              const action = current.action === outcome;
              return (
                <article key={outcome} className={`horizon-card ${OUTCOME_TONE[outcome]}`}>
                  <div className="horizon-card-top">
                    <span className="horizon-outcome">{outcomeLabel(outcome, state)}</span>
                    <span className="horizon-rank">{OUTCOMES.indexOf(outcome) + 1}</span>
                  </div>
                  <div className="horizon-prob tnum">{(probability * 100).toFixed(1)}<small>%</small></div>
                  <div className="horizon-bar"><span style={{ width: `${probability * 100}%` }} /></div>
                  <div className="horizon-badges">
                    {thesis && <span className="prediction-badge thesis">THESIS</span>}
                    {action && <span className="prediction-badge action">ACTION</span>}
                    {!thesis && !action && <span className="prediction-placeholder">observing</span>}
                  </div>
                  <div className="kill-criteria"><span>Kill</span> {killCriteria(outcome, state)}</div>
                </article>
              );
            })}
          </div>

          <div className="horizon-meta-grid">
            <div className="horizon-meta">
              <span className="eyebrow">Publication</span>
              <strong className="tnum">#{current.refreshNumber}</strong>
              <span>{current.openedMinute.toFixed(1)}′ → {current.closesMinute.toFixed(1)}′ · fixed close</span>
            </div>
            <div className="horizon-meta">
              <span className="eyebrow">Evidence</span>
              <strong className={current.lowData ? "text-warn" : "text-up"}>{current.lowData ? "LOW DATA" : `N=${current.support}`}</strong>
              <span>{current.bucket} · {current.fallback.replaceAll("_", " ")}</span>
            </div>
            <div className={`horizon-meta ${horizon.oddsSwing.active ? "swing-active" : ""}`}>
              <span className="eyebrow">180s odds swing</span>
              <strong>{horizon.oddsSwing.active ? "ACTIVE" : "CLEAR"}</strong>
              <span>
                {horizon.oddsSwing.favorite
                  ? `${horizon.oddsSwing.favorite} favourite · ${(horizon.oddsSwing.delta * 100).toFixed(1)}pp`
                  : horizon.oddsSwing.reason.replaceAll("_", " ")}
              </span>
            </div>
            <div className="horizon-meta">
              <span className="eyebrow">Feed truth</span>
              <strong>{state?.feedHealth.watching ?? 0} watching</strong>
              <span>{state?.feedHealth.detail}</span>
            </div>
          </div>
          <div className="horizon-provenance">{current.provenance}</div>
        </>
      ) : (
        <div className="horizon-empty">
          <span className="horizon-empty-mark">N+1</span>
          <div>
            <strong>No active Horizon</strong>
            <p>Start a live or deterministic replay session. Live failure is shown here and never replaced by simulation.</p>
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
          <pre>{JSON.stringify({ fixture: state?.fixture, mode: state?.mode, feedHealth: state?.feedHealth, horizon }, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}

function CollapseTicker({ state }: { state: EngineState | null }) {
  const ticker = state?.horizon.collapseTicker ?? [];
  return (
    <div className="machine-panel collapse-panel">
      <div className="machine-head"><span>Collapse ticker</span><span>{ticker.length} transitions</span></div>
      <div className="collapse-list">
        {ticker.length === 0 && <span className="machine-empty">No settled Horizon yet</span>}
        {ticker.slice(0, 7).map((collapse) => (
          <div key={collapse.id} className="collapse-item">
            <span className={`collapse-winner ${OUTCOME_TONE[collapse.winner]}`}>{shortOutcome(collapse.winner)}</span>
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
      <div className="machine-head"><span>Machine Ledger</span><span>four-class scorecard</span></div>
      <div className="machine-metrics">
        {values.map(([label, value]) => (
          <div key={String(label)}><span>{label}</span><strong className="tnum">{value}</strong></div>
        ))}
      </div>
    </div>
  );
}

function outcomeLabel(outcome: HorizonOutcome, state: EngineState | null): string {
  if (outcome === "goal_home") return `Goal · ${state?.fixture.homeCode ?? "home"}`;
  if (outcome === "goal_away") return `Goal · ${state?.fixture.awayCode ?? "away"}`;
  if (outcome === "card") return "Yellow / red card";
  return "Quiet window";
}

function killCriteria(outcome: HorizonOutcome, state: EngineState | null): string {
  if (outcome === "goal_home") return `${state?.fixture.awayCode ?? "Away"} goal, any card, or close`;
  if (outcome === "goal_away") return `${state?.fixture.homeCode ?? "Home"} goal, any card, or close`;
  if (outcome === "card") return "Either goal or Horizon close";
  return "Any goal or yellow/red card";
}

function shortOutcome(outcome: HorizonOutcome): string {
  return outcome === "goal_home" ? "HOME GOAL" : outcome === "goal_away" ? "AWAY GOAL" : outcome.toUpperCase();
}
