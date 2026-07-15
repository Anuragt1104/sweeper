"use client";

import { useEffect, useRef, useState } from "react";
import type { EngineState } from "@/lib/engine/state";
import {
  Arena,
  AuditTrail,
  Controls,
  OddsBoard,
  ProofModal,
  ScoreHeader,
  SentinelFeed,
  SettlementCard,
  type FixtureLite,
} from "@/components/panels";
import { ReplayLab } from "@/components/replay";
import { HorizonExperience } from "@/components/horizon";

interface QueryLaunch {
  fixtureId: string;
  startMinute: number;
  seed: number;
  label: "demo" | "replay";
}

export default function Console() {
  const [state, setState] = useState<EngineState | null>(null);
  const [fixtures, setFixtures] = useState<FixtureLite[]>([]);
  const [connected, setConnected] = useState(false);
  const [proofSeq, setProofSeq] = useState<number | null>(null);
  const [tab, setTab] = useState<"live" | "replay">("live");
  const [controlKey, setControlKey] = useState("");
  const [queryLaunch, setQueryLaunch] = useState<QueryLaunch | null>(null);
  const [queryNotice, setQueryNotice] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const launchedRef = useRef(false);

  useEffect(() => {
    const storedKey = window.sessionStorage.getItem("sweeper-control-key") ?? "";
    setControlKey(storedKey);
    const query = new URLSearchParams(window.location.search);
    if (query.get("demo") === "act2") {
      setQueryLaunch({ fixtureId: "wc26-a-md2-arg-pol", startMinute: 39.5, seed: 7, label: "demo" });
      setQueryNotice("ACT II ready · Argentina–Poland at 39.5′ · goal lands at 41′");
    } else if (query.get("replay")) {
      setQueryLaunch({
        fixtureId: query.get("replay")!,
        startMinute: Number(query.get("t") ?? 0),
        seed: Number(query.get("seed") ?? 7),
        label: "replay",
      });
      setQueryNotice("Replay link ready · enter the operator key to start deterministic playback");
    }
    fetch("/api/fixtures").then((r) => r.json()).then(setFixtures).catch(() => {});
    fetch("/api/session").then((r) => r.json()).then((s) => s?.sessionId && setState(s)).catch(() => {});

    const es = new EventSource("/api/stream");
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
  }, []);

  useEffect(() => {
    if (!queryLaunch || !controlKey || launchedRef.current) return;
    launchedRef.current = true;
    fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Control-Key": controlKey },
      body: JSON.stringify({
        action: "start",
        options: {
          fixtureId: queryLaunch.fixtureId,
          mode: "simulation",
          startMinute: queryLaunch.startMinute,
          config: { seed: queryLaunch.seed, tickIntervalMs: 900 },
        },
      }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json())?.error?.message ?? "Replay launch failed");
        setQueryNotice(queryLaunch.label === "demo" ? "ACT II playing · watch the 41′ collapse" : "Deterministic replay playing");
      })
      .catch((error) => {
        launchedRef.current = false;
        setQueryNotice(error instanceof Error ? error.message : "Replay launch failed");
      });
  }, [controlKey, queryLaunch]);

  function storeControlKey(value: string) {
    setControlKey(value);
    if (value) window.sessionStorage.setItem("sweeper-control-key", value);
    else window.sessionStorage.removeItem("sweeper-control-key");
  }

  const status = state?.status ?? "idle";

  return (
    <main className="max-w-[1320px] mx-auto px-4 py-5 space-y-4">
      {/* brand header */}
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-black tracking-tight">
            <span className="text-brand">◆</span> Sweeper <span className="text-faint font-medium">×</span> N+1 Machine
          </div>
          <div className="hidden sm:block text-xs text-muted border-l border-line pl-3 leading-tight">
            Live Horizon forecasting · autonomous market-quality sentinel
            <br />
            <span className="text-faint">TxLINE World Cup feeds · TxODDS Trading Tools &amp; Agents track</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip ${connected ? "text-up" : "text-faint"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-up pulse-dot" : "bg-faint"}`} /> viewer stream
          </span>
          <div className="flex rounded-lg border border-line2 overflow-hidden text-sm">
            <button className={`px-3 py-1.5 ${tab === "live" ? "bg-panel2 text-ink" : "text-muted"}`} onClick={() => setTab("live")}>
              Live
            </button>
            <button className={`px-3 py-1.5 ${tab === "replay" ? "bg-panel2 text-ink" : "text-muted"}`} onClick={() => setTab("replay")}>
              Replay Lab
            </button>
          </div>
        </div>
      </header>

      {queryNotice && <div className="query-notice"><span>REPLAY</span>{queryNotice}</div>}

      <HorizonExperience state={state} replayLabel={Boolean(queryLaunch)} />

      <Controls
        fixtures={fixtures}
        status={status}
        anchorReady={state?.anchorAvailable ?? false}
        controlKey={controlKey}
        onControlKey={storeControlKey}
        defaultMode={queryLaunch ? "simulation" : "live"}
      />

      {tab === "live" ? (
        <>
          {state?.current ? (
            <ScoreHeader state={state} />
          ) : (
            <div className="panel p-10 text-center">
              <div className="text-lg font-semibold mb-1">No session running</div>
              <div className="text-sm text-muted max-w-md mx-auto">
                Press <span className="text-brand font-semibold">Start</span> to launch an autonomous session. Sweeper ingests
                the TxLINE-shaped odds &amp; scores stream, runs the sentinel, lets five agents trade, and writes a
                proof-backed audit ledger — with zero manual input.
              </div>
            </div>
          )}

          {state && (
            <>
              <div className="grid lg:grid-cols-3 gap-4">
                <Section title="Ingestion · TxLINE feed" sub={state.current ? `${state.current.clock} · ${state.current.phaseLabel}` : ""}>
                  <OddsBoard tick={state.current} />
                </Section>
                <Section title="Sentinel" sub="market-quality signals">
                  <SentinelFeed signals={state.signals} counts={state.signalCounts} />
                </Section>
                <Section title="Audit ledger" sub="click any record to verify its proof">
                  <AuditTrail ledger={state.ledger} status={status} onProof={setProofSeq} />
                </Section>
              </div>

              <Section title="Agent arena" sub="five strategies · same feed · paper PnL">
                <Arena agents={state.agents} leader={state.leader} />
              </Section>

              {state.settlement && <SettlementCard settlement={state.settlement} />}
            </>
          )}
        </>
      ) : (
        <ReplayLab fixtures={fixtures} controlKey={controlKey} />
      )}

      <footer className="text-[11px] text-faint pt-2 border-t border-line flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>TxLINE endpoints:</span>
        <code className="tnum">/api/fixtures/snapshot</code>
        <code className="tnum">/api/odds/stream</code>
        <code className="tnum">/api/scores/stream</code>
        <code className="tnum">/api/scores/stat-validation</code>
        <span className="ml-auto">mode: {state?.mode ?? "idle"} · viewers read, operators mutate · proofs verify offline</span>
      </footer>

      {proofSeq != null && <ProofModal seq={proofSeq} onClose={() => setProofSeq(null)} />}
    </main>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="text-sm font-semibold">{title}</span>
        {sub && <span className="text-[11px] text-faint">{sub}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
