"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Database, FileCheck2, GitBranch, ShieldAlert } from "lucide-react";
import type { EngineState } from "@/lib/engine/state";
import type { DecisionReceipt } from "@/lib/evidence/decision-evidence";
import type { OddsViewId } from "@/lib/tempo/types";
import type { EngineSource } from "@/components/use-engine-stream-controller";

export function EvidenceWorkspace({ state, source, strategyId, contract }: { state: EngineState; source: EngineSource; strategyId: string; contract: OddsViewId }) {
  const [selector, setSelector] = useState<"latest_fill" | "latest_decision">("latest_fill");
  const [receipt, setReceipt] = useState<DecisionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    setReceipt(null);
    setError(null);
    setVerified(null);
    const params = new URLSearchParams({ source, sessionId: state.sessionId, strategy: strategyId, contract, selector });
    fetch(`/api/evidence/decision?${params}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? "Evidence unavailable");
        return body as DecisionReceipt;
      })
      .then((body) => { if (alive) setReceipt(body); })
      .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : "Evidence unavailable"); });
    return () => { alive = false; };
  }, [contract, selector, source, state.sessionId, strategyId]);

  async function verifyProof() {
    if (!receipt) return;
    const params = new URLSearchParams({ source, sessionId: state.sessionId });
    const response = await fetch(`/api/proof/${receipt.strategy.decision.seq}?${params}`, { cache: "no-store" });
    const body = await response.json();
    setVerified(Boolean(response.ok && body.verified && body.root === receipt.decisionProof.root));
  }

  return (
    <div className="evidence-workspace">
      <header className="evidence-hero"><div><span>AUTONOMOUS DECISION RECEIPT</span><h2>{receipt?.strategy.design.name ?? strategyId.replaceAll("_", " ")}</h2><p>One reconstructable chain from observed market state to shadow execution.</p></div><div className="evidence-selector"><button type="button" aria-pressed={selector === "latest_fill"} onClick={() => setSelector("latest_fill")}>Latest fill</button><button type="button" aria-pressed={selector === "latest_decision"} onClick={() => setSelector("latest_decision")}>Latest decision</button></div></header>

      <div className="system-flow" aria-label="Autonomous system flow">
        <FlowNode icon={<Database size={16} />} label="TxLINE snapshot / SSE" />
        <span>→</span><FlowNode icon={<GitBranch size={16} />} label="Normalized MarketTick" />
        <span>→</span><FlowNode icon={<ShieldAlert size={16} />} label="Desk + Sentinel" />
        <span>→</span><FlowNode icon={<FileCheck2 size={16} />} label="Stance + shadow fill" />
        <span>→</span><FlowNode icon={<CheckCircle2 size={16} />} label="Postgres + ledger" />
      </div>

      {!receipt && !error ? <div className="drawer-empty">Reconstructing the evidence chain…</div> : null}
      {error ? <div className="drawer-empty"><strong>Receipt unavailable</strong><p>{error}</p><p>Choose Latest decision when this strategy has not filled the selected contract.</p></div> : null}
      {receipt ? (
        <>
          <div className="receipt-chain">
            <ReceiptStep number="01" title="Observation"><KV label="Sequence" value={String(receipt.observation.sequence)} /><KV label="Tick hash" value={receipt.observation.tickHash} mono /><pre>{JSON.stringify(receipt.observation.excerpt, null, 2)}</pre></ReceiptStep>
            <ReceiptStep number="02" title="Analysis"><KV label="Model" value={receipt.analysis.modelVersion ?? "No pricing model"} /><KV label="Regime" value={receipt.analysis.regime ?? "—"} /><KV label="Quality" value={receipt.analysis.quality == null ? "—" : String(receipt.analysis.quality)} /><pre>{JSON.stringify({ fair1x2: receipt.analysis.fair1x2, edgeVsBook: receipt.analysis.edgeVsBook, horizonTransition: receipt.analysis.horizonTransition }, null, 2)}</pre></ReceiptStep>
            <ReceiptStep number="03" title="Strategy"><KV label="Rule" value={receipt.strategy.design.stanceRule} /><KV label="Rationale" value={receipt.strategy.rationale} /><KV label="Decision hash" value={receipt.strategy.decision.hash} mono /></ReceiptStep>
            <ReceiptStep number="04" title="Execution boundary"><KV label="Mode" value={receipt.provenance.executionMode.toUpperCase()} /><KV label="Fill" value={receipt.execution ? `${receipt.execution.details.side} ${receipt.execution.details.size} @ ${receipt.execution.details.price}` : "No fill for this decision"} /><KV label="PnL after" value={receipt.execution?.pnlSnapshot ? String(receipt.execution.pnlSnapshot.pnl) : "—"} /></ReceiptStep>
          </div>
          <div className="proof-lanes">
            <section className="proof-lane proof-lane--decision"><span>{receipt.decisionProof.label}</span><h3>{receipt.decisionProof.verified ? "Inclusion proof ready" : "Proof failed"}</h3><p>This proves the decision record belongs to this Sweeper session root. It does not prove model accuracy.</p><KV label="Session root" value={receipt.decisionProof.root} mono /><button className="btn" type="button" onClick={verifyProof}>Verify decision proof</button>{verified != null ? <strong className={verified ? "is-positive" : "is-negative"}>{verified ? "VERIFIED OFFLINE PATH" : "VERIFICATION FAILED"}</strong> : null}</section>
            <section className="proof-lane proof-lane--settlement"><span>{receipt.settlementGuard.label}</span><h3>{receipt.settlementGuard.state.replaceAll("_", " ").toUpperCase()}</h3><p>{receipt.settlementGuard.detail}</p><small>Decision integrity and outcome validity are deliberately separate proof lanes.</small></section>
          </div>
          <details className="receipt-json"><summary>Decision Receipt JSON</summary><pre>{JSON.stringify(receipt, null, 2)}</pre></details>
        </>
      ) : null}
    </div>
  );
}

function FlowNode({ icon, label }: { icon: React.ReactNode; label: string }) { return <div>{icon}<span>{label}</span></div>; }
function ReceiptStep({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <section><header><span>{number}</span><h3>{title}</h3></header>{children}</section>; }
function KV({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="receipt-kv"><span>{label}</span><strong className={mono ? "tnum" : ""}>{value}</strong></div>; }
