"use client";

import { useEffect, useState } from "react";
import type { AgentView, EngineState, LedgerView, TickView } from "@/lib/engine/state";
import type { ProofBundle } from "@/lib/proof/ledger";
import type { Signal } from "@/lib/sentinel/types";
import {
  pnlColor,
  qualityColor,
  SEVERITY_COLOR,
  SEVERITY_DOT,
  shortHash,
  signFmt,
  SIGNAL_LABEL,
} from "@/components/format";
import { EquityChart, QualityGauge, Sparkline } from "@/components/charts";

export const AGENT_COLOR: Record<string, string> = {
  value: "var(--color-cyan)",
  momentum_naive: "var(--color-down)",
  momentum_guarded: "var(--color-brand)",
  reversion: "var(--color-info)",
  maker: "var(--color-warn)",
};

export interface FixtureLite {
  id: string;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  stage: string;
  status: string;
}

// ── Score header ──────────────────────────────────────────────────────────────

export function ScoreHeader({ state }: { state: EngineState }) {
  const c = state.current;
  return (
    <div className="panel p-4 flex items-center gap-5 flex-wrap">
      <QualityGauge value={state.quality} />
      <div className="flex-1 min-w-[220px]">
        <div className="eyebrow mb-1">{state.fixture.competition} · {state.fixture.stage}</div>
        <div className="flex items-center gap-3 text-2xl font-bold tracking-tight">
          <span>{state.fixture.home}</span>
          <span className="tnum text-brand">
            {c ? `${c.homeGoals}–${c.awayGoals}` : "–"}
          </span>
          <span>{state.fixture.away}</span>
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-muted">
          <span className="chip">{c ? c.clock : "—"} · {c ? c.phaseLabel : "idle"}</span>
          {c?.suspended && <span className="chip text-crit border-crit/40">● SUSPENDED</span>}
          <span className="chip tnum">tick {state.progress.tick}/{state.progress.total}</span>
          <span className="chip font-semibold">
            {state.provenance === "recorded_live" ? "RECORDED LIVE" : state.provenance.toUpperCase()}
          </span>
          <span className="chip text-cyan">{state.executionMode === "shadow" ? "SHADOW EXECUTION" : "SIMULATED EXECUTION"}</span>
          {!state.tradeReadiness.ready && (
            <span className="chip text-warn" title={state.tradeReadiness.reasons.join("; ")}>STAND DOWN</span>
          )}
          {c?.anomaly && <span className="chip text-warn">inject: {c.anomaly}</span>}
        </div>
      </div>
      <div className="text-right">
        <div className="eyebrow">Market quality</div>
        <div className={`text-3xl font-bold tnum ${qualityColor(state.quality)}`}>{state.quality}</div>
        <div className="w-40 h-1.5 bg-line rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-brand transition-all" style={{ width: `${state.progress.pct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────────

export function Controls({
  fixtures,
  status,
  anchorReady,
  controlKey,
  onControlKey,
  defaultMode,
}: {
  fixtures: FixtureLite[];
  status: EngineState["status"];
  anchorReady: boolean;
  controlKey: string;
  onControlKey: (key: string) => void;
  defaultMode: "simulation" | "live";
}) {
  const [fixtureId, setFixtureId] = useState("");
  const [mode, setMode] = useState<"simulation" | "live">(defaultMode);
  const [seed, setSeed] = useState(7);
  const [speed, setSpeed] = useState(300);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setMode(defaultMode), [defaultMode]);
  useEffect(() => {
    if (!fixtureId && fixtures[0]) setFixtureId(fixtures[0].id);
  }, [fixtureId, fixtures]);

  async function post(body: object) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Control-Key": controlKey },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error((await response.json())?.error?.message ?? "Control action failed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Control action failed");
    } finally {
      setBusy(false);
    }
  }

  const start = () =>
    post({ action: "start", options: { fixtureId: fixtureId || undefined, mode, config: { seed, tickIntervalMs: speed } } });

  return (
    <div className="panel p-3 flex items-center gap-2 flex-wrap">
      <div className={`chip ${status === "running" ? "text-up" : status === "finished" ? "text-info" : "text-muted"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${status === "running" ? "bg-up pulse-dot" : status === "finished" ? "bg-info" : "bg-faint"}`} />
        {status}
      </div>
      <select className="field" value={mode} onChange={(event) => setMode(event.target.value as "simulation" | "live")}>
        <option value="live">TxLINE live</option>
        <option value="simulation">Simulation</option>
      </select>
      <select className="field" value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
        <option value="">Featured fixture</option>
        {fixtures.map((f) => (
          <option key={f.id} value={f.id}>
            {f.homeCode}–{f.awayCode} · {f.stage}
          </option>
        ))}
      </select>
      <label className="chip">
        seed
        <input className="field w-16 ml-1 py-0.5" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
      </label>
      <select className="field" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
        <option value={600}>0.5×</option>
        <option value={300}>1×</option>
        <option value={120}>2.5×</option>
        <option value={40}>fast</option>
      </select>
      <button className="btn btn-primary" disabled={busy || !controlKey} onClick={start}>
        ▶ {status === "idle" ? "Start" : "Restart"}
      </button>
      <button className="btn btn-danger" disabled={busy || !controlKey || status !== "running"} onClick={() => post({ action: "stop" })}>
        ■ Stop
      </button>
      <button
        className="btn"
        disabled={busy || !controlKey || !anchorReady || status === "idle"}
        title={anchorReady ? "Anchor ledger root on Solana devnet" : "Set SOLANA_ANCHOR_SECRET_KEY to enable"}
        onClick={() => post({ action: "anchor" })}
      >
        ⛓ Anchor root
      </button>
      <label className="control-key-wrap">
        <span>{controlKey ? "OPERATOR" : "SPECTATOR"}</span>
        <input
          className="field w-40"
          type="password"
          autoComplete="off"
          placeholder="shared control key"
          value={controlKey}
          onChange={(event) => onControlKey(event.target.value)}
        />
      </label>
      {error && <span className="control-error">{error}</span>}
    </div>
  );
}

// ── Odds board (ingestion) ─────────────────────────────────────────────────────

function ProbArrow({ prob, prevPrice }: { prob: number; prevPrice: number }) {
  const prevProb = prevPrice > 0 ? 1.05 / prevPrice : prob;
  const d = prob - prevProb;
  if (Math.abs(d) < 0.002) return <span className="text-faint">·</span>;
  return d > 0 ? <span className="text-up">▲</span> : <span className="text-down">▼</span>;
}

export function OddsBoard({ tick }: { tick: TickView | null }) {
  if (!tick) return <Empty label="Awaiting feed…" />;
  return (
    <div className="space-y-3">
      {tick.markets.map((m) => (
        <div key={m.type}>
          <div className="eyebrow mb-1">{m.label}{m.line != null ? ` · ${m.line}` : ""}</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-faint text-[10px] uppercase tracking-wider">
                <th className="text-left font-medium pb-1">Sel</th>
                <th className="text-right font-medium pb-1">Prob</th>
                <th className="text-right font-medium pb-1">Dec</th>
                <th className="text-right font-medium pb-1">Robust ref.</th>
                <th className="text-right font-medium pb-1">z</th>
                <th className="text-right font-medium pb-1"></th>
              </tr>
            </thead>
            <tbody className="tnum">
              {m.selections.map((s) => {
                const off = Math.abs(s.prob - s.referenceProb) > 0.04;
                return (
                  <tr key={s.key} className="row-hover border-t border-line/60">
                    <td className="py-1 text-left font-sans text-ink">{s.label}</td>
                    <td className={`py-1 text-right ${off ? "text-warn" : ""}`}>{(s.prob * 100).toFixed(1)}</td>
                    <td className="py-1 text-right text-muted">{s.decimal.toFixed(2)}</td>
                    <td className="py-1 text-right text-faint">{(s.referenceProb * 100).toFixed(1)}</td>
                    <td className={`py-1 text-right ${Math.abs(s.z) >= 3 ? "text-cyan" : "text-faint"}`}>{s.z.toFixed(1)}</td>
                    <td className="py-1 text-right pl-2">
                      {s.stale ? <span className="text-warn text-[10px]">STALE</span> : <ProbArrow prob={s.prob} prevPrice={s.prevPrice} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      {tick.events.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {tick.events.map((e, i) => (
            <span key={i} className="chip text-brand">{e.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sentinel feed ───────────────────────────────────────────────────────────────

export function SentinelFeed({ signals, counts }: { signals: Signal[]; counts: EngineState["signalCounts"] }) {
  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-5 gap-1.5 mb-3 text-center">
        <Count label="sharp" v={counts.sharp_move} c="text-cyan" />
        <Count label="stale" v={counts.stale_line} c="text-warn" />
        <Count label="outlier" v={counts.outlier_print} c="text-crit" />
        <Count label="susp" v={counts.suspended} c="text-down" />
        <Count label="hold" v={counts.settlement_hold} c="text-crit" />
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[360px]">
        {signals.length === 0 && <Empty label="No signals yet" />}
        {signals.map((s) => (
          <div key={s.id} className="flex items-start gap-2 py-1.5 px-2 rounded-lg row-hover border border-line/40">
            <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_DOT[s.severity]}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${SEVERITY_COLOR[s.severity]}`}>{SIGNAL_LABEL[s.kind]}</span>
                <span className="chip text-[10px] py-0">{s.action}</span>
                <span className="text-[10px] text-faint tnum ml-auto">conf {(s.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="text-[11px] text-muted truncate">{s.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Arena ───────────────────────────────────────────────────────────────────────

export function Arena({ agents, leader }: { agents: AgentView[]; leader: string | null }) {
  const ranked = [...agents].sort((a, b) => b.metrics.equity - a.metrics.equity);
  const naive = agents.find((a) => a.id === "momentum_naive");
  const guarded = agents.find((a) => a.id === "momentum_guarded");
  const edge = naive && guarded ? guarded.metrics.pnl - naive.metrics.pnl : null;

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-faint text-[10px] uppercase tracking-wider">
            <th className="text-left font-medium pb-2">Agent</th>
            <th className="text-right font-medium pb-2">PnL</th>
            <th className="text-right font-medium pb-2">ROI</th>
            <th className="text-center font-medium pb-2">Equity</th>
            <th className="text-right font-medium pb-2">Trades</th>
            <th className="text-right font-medium pb-2">Hit</th>
            <th className="text-right font-medium pb-2">maxDD</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((a) => (
            <tr key={a.id} className="border-t border-line/60 row-hover">
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: AGENT_COLOR[a.id] }} />
                  <span className="font-medium">{a.name}</span>
                  {a.id === leader && <span className="chip text-brand text-[10px] py-0">▲ leader</span>}
                  <span className="chip text-[10px] py-0">{a.mode}</span>
                  {a.stoodDown && <span className="chip text-warn text-[10px] py-0">stand-down</span>}
                </div>
                <div className="text-[10px] text-faint mt-0.5 max-w-[260px] truncate">{a.lastRationale}</div>
              </td>
              <td className={`py-2 text-right tnum font-semibold ${pnlColor(a.metrics.pnl)}`}>{signFmt(a.metrics.pnl)}</td>
              <td className={`py-2 text-right tnum ${pnlColor(a.metrics.roi)}`}>{signFmt(a.metrics.roi * 100, 1)}%</td>
              <td className="py-2">
                <div className="flex justify-center">
                  <Sparkline values={a.curve} color={AGENT_COLOR[a.id]} />
                </div>
              </td>
              <td className="py-2 text-right tnum text-muted">{a.metrics.trades}</td>
              <td className="py-2 text-right tnum text-muted">{(a.metrics.hitRate * 100).toFixed(0)}%</td>
              <td className="py-2 text-right tnum text-faint">{a.metrics.maxDrawdown.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {edge != null && (
        <div className="mt-3 text-xs text-muted border-t border-line/60 pt-3">
          <span className="text-faint">Sentinel value · </span>
          Guarded Momentum is{" "}
          <span className={pnlColor(edge)}>{signFmt(edge)} units</span>{" "}
          {edge >= 0 ? "ahead of" : "behind"} Naive Momentum — same feed, same params, the difference is listening to the sentinel.
        </div>
      )}
    </div>
  );
}

// ── Audit trail + proof ─────────────────────────────────────────────────────────

const KIND_COLOR: Record<string, string> = {
  tick: "text-faint",
  signal: "text-warn",
  decision: "text-cyan",
  fill: "text-up",
  settlement: "text-brand",
};

export function AuditTrail({
  ledger,
  status,
  onProof,
}: {
  ledger: EngineState["ledger"];
  status: EngineState["status"];
  onProof: (seq: number) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 text-xs">
        <span className="text-muted">
          <span className="text-faint">root</span> <span className="tnum text-ink">{shortHash(ledger.root, 10)}</span>
        </span>
        <span className="chip tnum">{ledger.size} records</span>
      </div>
      {ledger.anchor && (
        <a className="chip text-brand mb-2 w-fit" href={ledger.anchor.url} target="_blank" rel="noreferrer">
          ⛓ anchored · {shortHash(ledger.anchor.sig, 8)} ↗
        </a>
      )}
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-1 max-h-[320px]">
        {ledger.recent.map((r: LedgerView) => (
          <button
            key={r.seq}
            onClick={() => onProof(r.seq)}
            className="w-full flex items-center gap-2 py-1 px-2 rounded-md row-hover text-left"
          >
            <span className="tnum text-[10px] text-faint w-8 shrink-0">#{r.seq}</span>
            <span className={`text-[10px] uppercase w-16 shrink-0 ${KIND_COLOR[r.kind] ?? "text-muted"}`}>{r.kind}</span>
            <span className="text-[11px] text-muted truncate flex-1">{r.summary}</span>
            <span className="tnum text-[10px] text-faint shrink-0">{shortHash(r.hash, 6)}</span>
          </button>
        ))}
        {ledger.recent.length === 0 && <Empty label={status === "idle" ? "Start a session" : "No records"} />}
      </div>
    </div>
  );
}

export function ProofModal({ seq, onClose }: { seq: number; onClose: () => void }) {
  const [bundle, setBundle] = useState<ProofBundle | { error: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/proof/${seq}`)
      .then((r) => r.json())
      .then((b) => alive && setBundle(b));
    return () => {
      alive = false;
    };
  }, [seq]);

  const ok = bundle && "verified" in bundle;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="panel max-w-lg w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="eyebrow">Proof · ledger record #{seq}</div>
          <button className="text-muted hover:text-ink" onClick={onClose}>✕</button>
        </div>
        {!bundle && <Empty label="Building inclusion proof…" />}
        {bundle && "error" in bundle && <div className="text-crit text-sm">{bundle.error}</div>}
        {ok && (
          <div className="space-y-3 text-sm">
            <div className={`chip ${bundle.verified ? "text-up border-up/40" : "text-crit"}`}>
              {bundle.verified ? "✓ inclusion proof verifies against root" : "✗ verification failed"}
            </div>
            <KV k="kind" v={bundle.record.kind} />
            <KV k="summary" v={bundle.record.summary} />
            <KV k="leaf hash" v={bundle.leafHash} mono />
            {bundle.record.reactedToHash && <KV k="reacted to (tick)" v={bundle.record.reactedToHash} mono />}
            <KV k="merkle root" v={bundle.root} mono />
            <KV k="proof length" v={`${bundle.proof.length} sibling hashes`} />
            <div className="text-[11px] text-faint border-t border-line pt-2">
              The record hashes to the leaf above; combining it with {bundle.proof.length} sibling hashes reproduces the
              session root — the same Merkle model TxLINE uses to anchor data on Solana. Verifies offline, no wallet.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Settlement ────────────────────────────────────────────────────────────────

export function SettlementCard({ settlement }: { settlement: EngineState["settlement"] }) {
  if (!settlement) return null;
  const held = settlement.status === "hold";
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="eyebrow">Settlement</div>
        <span className={`chip ${held ? "text-crit border-crit/40" : "text-up border-up/40"}`}>
          {held ? "SETTLEMENT HELD" : settlement.txlineSettlementProof ? "PROOF VERIFIED" : "SETTLED"}
        </span>
      </div>
      <div className="text-lg font-bold tnum mb-1">
        {settlement.match} · {settlement.finalScore.home}–{settlement.finalScore.away}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {settlement.resolved.map((r) => (
          <span key={r.marketType} className="chip">
            {r.marketType}: <span className="text-ink">{r.resolvedKey}</span> ({r.detail})
          </span>
        ))}
      </div>
      <div className="text-[11px] text-muted space-y-1 border-t border-line pt-2">
        <div>
          <span className="text-faint">proof source</span> {settlement.proof.source}
          {settlement.proof.verified ? <span className="text-up"> · verified</span> : <span className="text-crit"> · unverified</span>}
        </div>
        {settlement.proof.endpoint && <div className="tnum text-faint truncate">{settlement.proof.endpoint}</div>}
        {settlement.reason && <div className="text-crit">{settlement.reason}</div>}
        <div className="text-faint">stat keys [{settlement.proof.statKeys.join(", ")}] · root {shortHash(settlement.proof.root, 8)}</div>
        {settlement.txlineSettlementProof && (
          <div className="text-up">
            TxLINE mainnet · seq {settlement.txlineSettlementProof.finalSequence} · daily root {shortHash(settlement.txlineSettlementProof.dailyRootPda, 8)}
          </div>
        )}
      </div>
    </div>
  );
}

export function CausalTrace({ state }: { state: EngineState }) {
  const ordered = [...state.ledger.recent].reverse();
  const latestFill = [...ordered].reverse().find((record) => record.kind === "fill");
  const latestDecision = latestFill
    ? [...ordered].reverse().find((record) => record.kind === "decision" && latestFill.reactedToHash === record.hash)
    : [...ordered].reverse().find((record) => record.kind === "decision");
  const latestSignal = [...ordered].reverse().find((record) => record.kind === "signal");
  const latestTick = [...ordered].reverse().find((record) => record.kind === "tick");
  const leader = state.agents.find((agent) => agent.id === state.leader);
  const steps = [
    { label: "TxLINE tick", value: latestTick ? shortHash(latestTick.hash, 8) : "awaiting observation" },
    { label: "Sentinel", value: latestSignal?.summary ?? "no anomaly signal" },
    { label: "Agent decision", value: latestDecision?.summary ?? (state.tradeReadiness.reasons.join("; ") || "standing by") },
    { label: "Shadow fill", value: latestFill?.summary ?? "no fill" },
    { label: "Current PnL", value: leader ? `${leader.name} ${signFmt(leader.metrics.pnl)}` : "no positions" },
    {
      label: "Proof",
      value: state.settlement?.txlineSettlementProof
        ? `mainnet verified · seq ${state.settlement.txlineSettlementProof.finalSequence}`
        : state.settlement?.status === "hold"
          ? "settlement held"
          : `ledger ${shortHash(state.ledger.root, 8)}`,
    },
  ];
  return (
    <div className="causal-grid">
      {steps.map((step, index) => (
        <div key={step.label} className="causal-step">
          <div className="eyebrow">{String(index + 1).padStart(2, "0")} · {step.label}</div>
          <div className="text-xs text-muted mt-1 line-clamp-2">{step.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── small bits ──────────────────────────────────────────────────────────────────

function Count({ label, v, c }: { label: string; v: number; c: string }) {
  return (
    <div className="panel py-2">
      <div className={`text-xl font-bold tnum ${c}`}>{v}</div>
      <div className="text-[9px] uppercase tracking-wider text-faint">{label}</div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="text-center text-faint text-xs py-8">{label}</div>;
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="text-faint w-32 shrink-0 text-xs">{k}</span>
      <span className={`text-ink break-all text-xs ${mono ? "tnum" : ""}`}>{v}</span>
    </div>
  );
}

export { Empty };
export { EquityChart };
