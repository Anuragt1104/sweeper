"use client";

import {
  Activity,
  ChevronRight,
  CircleDot,
  FlaskConical,
  LockKeyhole,
  Radio,
  Settings2,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import type { EngineState } from "@/lib/engine/state";
import type { ContractNavItem } from "@/lib/strategy-lab/projection";
import type { OddsViewId } from "@/lib/tempo/types";
import type { EngineSource, ViewerConnection } from "@/components/use-engine-stream-controller";

export function LabCommandBar({
  state,
  source,
  connection,
  onSource,
  onAdvanced,
  hasControlKey,
}: {
  state: EngineState | null;
  source: EngineSource;
  connection: ViewerConnection;
  onSource: (source: EngineSource) => void;
  onAdvanced: () => void;
  hasControlKey: boolean;
}) {
  return (
    <header className="lab-command" aria-label="Strategy Lab command bar">
      <div className="lab-brand">
        <span className="lab-mark" aria-hidden="true"><span /></span>
        <div>
          <strong>Sweeper</strong>
          <span>Strategy Lab</span>
        </div>
        <div className="lab-command__fixture">
          <ChevronRight size={14} aria-hidden="true" />
          {state ? `${state.fixture.homeCode} · ${state.fixture.awayCode}` : "Awaiting session"}
        </div>
      </div>

      <div className="source-switch" aria-label="Data source">
        <button type="button" aria-pressed={source === "live"} onClick={() => onSource("live")}>
          <Radio size={14} aria-hidden="true" /> Live
        </button>
        <button type="button" aria-pressed={source === "demo"} onClick={() => onSource("demo")}>
          <FlaskConical size={14} aria-hidden="true" /> Demo
        </button>
      </div>

      <div className="lab-command__right">
        <ConnectionBadge connection={connection} />
        <span className="mode-badge">{state ? (state.executionMode === "shadow" ? "SHADOW" : "SIMULATED") : source === "live" ? "NO EXECUTION" : "SIMULATED"}</span>
        <button type="button" className="lab-icon-button" onClick={onAdvanced}>
          <Settings2 size={16} aria-hidden="true" />
          <span>Advanced</span>
        </button>
        <span className="operator-badge" title={hasControlKey ? "Operator controls unlocked" : "Spectator mode"}>
          {hasControlKey ? <ShieldCheck size={16} aria-hidden="true" /> : <LockKeyhole size={16} aria-hidden="true" />}
          <span>{hasControlKey ? "Operator" : "Spectator"}</span>
        </span>
      </div>
    </header>
  );
}

function ConnectionBadge({ connection }: { connection: ViewerConnection }) {
  const Icon = connection === "offline" ? WifiOff : Activity;
  const label = connection === "open" ? "Viewer stream open" : connection === "stale" ? "Viewer stream stale" : `Viewer ${connection}`;
  return (
    <span className={`connection-badge connection-badge--${connection}`}>
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function SessionMasthead({ state, source }: { state: EngineState; source: EngineSource }) {
  const current = state.current;
  const liveAccepted = state.feedHealth.scoreStreamAccepted && state.feedHealth.oddsStreamAccepted;
  const displayedHealth = source === "demo" ? "replay" : state.feedHealth.status;
  const healthLabel = source === "demo"
    ? "Recorded scenario"
    : liveAccepted && state.feedHealth.status === "live"
      ? "Both upstream streams accepted"
      : state.feedHealth.detail;

  return (
    <section className="session-masthead" aria-label="Active match session">
      <div className="session-team session-team--home">
        <span className="team-code">{state.fixture.homeCode}</span>
        <span className="team-name">{state.fixture.home}</span>
      </div>
      <div className="session-score">
        <div className="scoreline" aria-label={`${current?.homeGoals ?? 0} to ${current?.awayGoals ?? 0}`}>
          <strong>{current?.homeGoals ?? 0}</strong>
          <span>–</span>
          <strong>{current?.awayGoals ?? 0}</strong>
        </div>
        <div className="match-clock"><CircleDot size={10} aria-hidden="true" /> {current?.clock ?? "—"} · {current?.phaseLabel ?? "Waiting"}</div>
      </div>
      <div className="session-team session-team--away">
        <span className="team-code">{state.fixture.awayCode}</span>
        <span className="team-name">{state.fixture.away}</span>
      </div>
      <div className="session-meta">
        <div><span>Competition</span><strong>{state.fixture.competition || state.fixture.stage}</strong></div>
        <div><span>Fixture</span><strong className="tnum">{state.fixture.id}</strong></div>
        <div><span>Provenance</span><strong>{source === "demo" ? "DEMO · deterministic" : state.provenance.replaceAll("_", " ").toUpperCase()}</strong></div>
      </div>
      <div className="session-health">
        <div className="quality-ring" style={{ "--quality": `${state.quality * 3.6}deg` } as React.CSSProperties}>
          <span>{state.quality}</span>
          <small>quality</small>
        </div>
        <div>
          <strong className={`health-state health-state--${displayedHealth}`}>{displayedHealth.toUpperCase()}</strong>
          <span>{healthLabel}</span>
          <small>{state.tradeReadiness.ready ? "Desk ready" : `Stand down · ${state.tradeReadiness.reasons[0] ?? "not ready"}`}</small>
        </div>
      </div>
    </section>
  );
}

const COVERAGE_LABEL: Record<ContractNavItem["coverage"], string> = {
  model: "MODEL",
  book_only: "BOOK ONLY",
  no_market: "NO MARKET",
  signal_only: "SIGNAL ONLY",
};

export function ContractNavigator({
  contracts,
  selected,
  onSelect,
}: {
  contracts: ContractNavItem[];
  selected: OddsViewId;
  onSelect: (contract: OddsViewId) => void;
}) {
  function moveFocus(index: number) {
    const bounded = (index + contracts.length) % contracts.length;
    const next = contracts[bounded];
    onSelect(next.id);
    window.requestAnimationFrame(() => document.getElementById(`contract-tab-${next.id}`)?.focus());
  }

  return (
    <nav className="contract-nav" aria-label="Contract focus">
      <div className="contract-nav__title"><span>Contract</span><strong>Choose the decision surface</strong></div>
      <div role="tablist" aria-label="Available contracts" className="contract-tabs">
        {contracts.map((contract, index) => (
          <button
            type="button"
            role="tab"
            id={`contract-tab-${contract.id}`}
            key={contract.id}
            aria-selected={selected === contract.id}
            tabIndex={selected === contract.id ? 0 : -1}
            onClick={() => onSelect(contract.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") { event.preventDefault(); moveFocus(index + 1); }
              if (event.key === "ArrowLeft") { event.preventDefault(); moveFocus(index - 1); }
              if (event.key === "Home") { event.preventDefault(); moveFocus(0); }
              if (event.key === "End") { event.preventDefault(); moveFocus(contracts.length - 1); }
            }}
          >
            <span className="contract-tab__top"><strong>{contract.label}</strong><em>{COVERAGE_LABEL[contract.coverage]}</em></span>
            <span className="contract-tab__bottom">{contract.summary}<i className={contract.fillable ? "is-fillable" : ""}>{contract.fillable ? "fillable" : "observe"}</i></span>
          </button>
        ))}
      </div>
    </nav>
  );
}
