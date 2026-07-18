"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { EngineState, SupervisorStatus } from "@/lib/engine/state";
import {
  AuditTrail,
  Controls,
  OddsBoard,
  ProofModal,
  ScoreHeader,
  SentinelFeed,
  SettlementCard,
  type FixtureLite,
} from "@/components/panels";
import { CausalRail, DeskHero } from "@/components/desk";
import { HorizonAdvanced, StrategyContext } from "@/components/horizon";
import { ShockStrip } from "@/components/shock-strip";
import { ContractOutcomeDeck } from "@/components/contract-deck";
import { StrategyAnalysis } from "@/components/strategy-analysis";
import type { OddsViewId } from "@/lib/tempo/types";

const LIVE_STREAM = "/api/stream";
const DEMO_STREAM = "/api/demo/act2/stream";
const DEMO_NOTICE =
  "ACT II · ARG–POL sim · agents trade the goal shock ~41′ · Tempo recorded WC2022 · Causal rail + Arena";

export default function ConsolePage() {
  return (
    <Suspense fallback={<main className="max-w-[1320px] mx-auto px-4 py-5 text-muted text-sm">Loading console…</main>}>
      <Console />
    </Suspense>
  );
}

function Console() {
  const searchParams = useSearchParams();
  const demoRequested = searchParams.get("demo") === "act2";

  const [state, setState] = useState<EngineState | null>(null);
  const [fixtures, setFixtures] = useState<FixtureLite[]>([]);
  const [connected, setConnected] = useState(false);
  const [proofSeq, setProofSeq] = useState<number | null>(null);
  const [controlKey, setControlKey] = useState("");
  const [queryNotice, setQueryNotice] = useState<string | null>(demoRequested ? DEMO_NOTICE : null);
  const [streamUrl, setStreamUrl] = useState(demoRequested ? DEMO_STREAM : LIVE_STREAM);
  const [supervisorStatus, setSupervisorStatus] = useState<SupervisorStatus | null>(null);
  const [selectedContract, setSelectedContract] = useState<OddsViewId>("match_1x2");
  const esRef = useRef<EventSource | null>(null);

  const isDemo = streamUrl === DEMO_STREAM;

  useEffect(() => {
    if (demoRequested) {
      setStreamUrl(DEMO_STREAM);
      setQueryNotice(DEMO_NOTICE);
    }
  }, [demoRequested]);

  useEffect(() => {
    const storedKey = window.sessionStorage.getItem("sweeper-control-key") ?? "";
    setControlKey(storedKey);
    fetch("/api/fixtures").then((r) => r.json()).then(setFixtures).catch(() => {});
    // Live session hydrate only — never overwrite the Act II demo SSE with /api/session.
    if (!demoRequested) {
      fetch("/api/session").then((r) => r.json()).then((s) => s?.sessionId && setState(s)).catch(() => {});
    }
    const loadHealth = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then((body) => setSupervisorStatus(body.supervisor ?? null))
        .catch(() => {});
    void loadHealth();
    const healthTimer = window.setInterval(loadHealth, 15_000);
    return () => window.clearInterval(healthTimer);
  }, [demoRequested]);

  useEffect(() => {
    setConnected(false);
    const es = new EventSource(streamUrl);
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        setState(JSON.parse(e.data) as EngineState);
      } catch {
        /* heartbeat / malformed */
      }
    };
    return () => es.close();
  }, [streamUrl]);

  function storeControlKey(value: string) {
    setControlKey(value);
    if (value) window.sessionStorage.setItem("sweeper-control-key", value);
    else window.sessionStorage.removeItem("sweeper-control-key");
  }

  function switchLive() {
    setState(null);
    setStreamUrl(LIVE_STREAM);
    setQueryNotice(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    window.history.replaceState({}, "", url.pathname + url.search);
  }

  function switchDemo() {
    setState(null);
    setStreamUrl(DEMO_STREAM);
    setQueryNotice(DEMO_NOTICE);
    const url = new URL(window.location.href);
    url.searchParams.set("demo", "act2");
    window.history.replaceState({}, "", url.pathname + url.search);
  }

  const status = state?.status ?? "idle";

  return (
    <main className="max-w-[1320px] mx-auto px-4 py-5 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-black tracking-tight">
            <span className="text-brand">◆</span> Sweeper{" "}
            <span className="text-faint font-medium">×</span> N+1 Machine
          </div>
          <div className="hidden sm:block text-xs text-muted border-l border-line pl-3 leading-tight">
            Autonomous multi-agent desk on TxLINE · shadow PnL
            <br />
            <span className="text-faint">
              Sentinel · desk signals · contract lenses · Trading Tools &amp; Agents
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip ${connected ? "text-up" : "text-faint"}`}>
            <span
              className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-up pulse-dot" : "bg-faint"}`}
            />{" "}
            viewer stream
          </span>
          <div className="flex rounded-lg border border-line2 overflow-hidden text-sm">
            <button
              className={`px-3 py-1.5 ${!isDemo ? "bg-panel2 text-ink" : "text-muted"}`}
              onClick={switchLive}
            >
              Live
            </button>
            <button
              className={`px-3 py-1.5 ${isDemo ? "bg-panel2 text-ink" : "text-muted"}`}
              onClick={switchDemo}
            >
              Demo
            </button>
          </div>
        </div>
      </header>

      <div className={`query-notice ${queryNotice ? "" : "opacity-0 pointer-events-none border-transparent bg-transparent"}`}>
        <span>DEMO</span>
        {queryNotice ?? "\u00a0"}
      </div>

      <div className="supervisor-line text-[11px] text-faint px-1 truncate">
        {!isDemo ? state?.supervisor?.detail ?? supervisorStatus?.detail ?? "\u00a0" : "\u00a0"}
      </div>

      {state?.current ? (
        <ScoreHeader state={state} />
      ) : (
        <div className="panel p-4 score-header-slot flex items-center justify-center text-center">
          <div>
            <div className="text-sm font-semibold mb-1">
              {isDemo ? "Connecting to Act II demo…" : "No session running"}
            </div>
            <div className="text-xs text-muted max-w-md mx-auto">
              {isDemo
                ? "Immutable Argentina–Poland simulation stream is starting — watch the Arena react to the goal."
                : "Switch to Demo for the Act II agent money-shot, or wait for the supervisor to open the next watched fixture on Live."}
            </div>
          </div>
        </div>
      )}

      {state?.agents && state.scorecard ? (
        <DeskHero state={state} />
      ) : (
        <div className="panel desk-hero flex items-center justify-center text-sm text-muted">
          Agent Arena loading…
        </div>
      )}

      {state ? (
        <CausalRail state={state} />
      ) : (
        <div className="panel causal-slot flex items-center justify-center text-sm text-muted">
          Causal rail waiting for first tick…
        </div>
      )}

      <ContractOutcomeDeck state={state} selectedContract={selectedContract} demoLabel={isDemo} />

      <StrategyAnalysis state={state} selectedContract={selectedContract} />

      {state?.shockStrip ? (
        <ShockStrip
          state={state}
          selectedContract={selectedContract}
          onSelectContract={setSelectedContract}
        />
      ) : (
        <div className="panel strategies-chart shock-slot flex items-center justify-center text-sm text-muted">
          Contract lenses loading…
        </div>
      )}

      <details className="panel advanced-panel">
        <summary className="advanced-summary">
          <span className="text-sm font-semibold">Advanced</span>
          <span className="text-[11px] text-faint">
            controls · odds · sentinel · audit proofs · settlement · Horizon JSON
          </span>
        </summary>
        <div className="p-4 space-y-4 border-t border-line">
          <Section title="Desk pressure" sub="Shared tempo · odds velocity · hybrid readouts">
            <StrategyContext state={state} />
          </Section>

          <Controls
            fixtures={fixtures}
            status={status}
            anchorReady={state?.anchorAvailable ?? false}
            controlKey={controlKey}
            onControlKey={storeControlKey}
            defaultMode="live"
          />

          {state && (
            <>
              <div className="grid lg:grid-cols-3 gap-4">
                <Section
                  title="Ingestion · TxLINE feed"
                  sub={state.current ? `${state.current.clock} · ${state.current.phaseLabel}` : ""}
                >
                  <OddsBoard tick={state.current} />
                </Section>
                <Section title="Sentinel" sub="market-quality signals">
                  <SentinelFeed signals={state.signals} counts={state.signalCounts} />
                </Section>
                <Section title="Audit ledger" sub="click any record to verify its proof">
                  <AuditTrail ledger={state.ledger} status={status} onProof={setProofSeq} />
                </Section>
              </div>

              {state.settlement && <SettlementCard settlement={state.settlement} />}

              <Section title="Horizon detail" sub="ledger · collapses · JSON">
                <HorizonAdvanced state={state} />
              </Section>
            </>
          )}
        </div>
      </details>

      <footer className="text-[11px] text-faint pt-2 border-t border-line flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>TxLINE endpoints:</span>
        <code className="tnum">/api/fixtures/snapshot</code>
        <code className="tnum">/api/stream</code>
        <code className="tnum">/api/health</code>
        <code className="tnum">/api/proof/{"{seq}"}</code>
      </footer>

      {proofSeq != null && <ProofModal seq={proofSeq} onClose={() => setProofSeq(null)} />}
    </main>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {sub && <span className="text-[11px] text-faint">{sub}</span>}
      </div>
      {children}
    </section>
  );
}
