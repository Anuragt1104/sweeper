"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { EngineState } from "@/lib/engine/state";
import type { OddsViewId } from "@/lib/tempo/types";
import { CausalRail } from "@/components/desk";
import { HorizonAdvanced } from "@/components/horizon";
import { ShockStrip } from "@/components/shock-strip";
import {
  AuditTrail,
  Controls,
  OddsBoard,
  ProofModal,
  SentinelFeed,
  SettlementCard,
  type FixtureLite,
} from "@/components/panels";

export type AdvancedTab = "causal" | "markets" | "sentinel" | "horizon" | "proofs" | "operator" | "research";

const TABS: Array<{ id: AdvancedTab; label: string }> = [
  { id: "causal", label: "Causal" },
  { id: "markets", label: "Markets" },
  { id: "sentinel", label: "Sentinel" },
  { id: "horizon", label: "Horizon" },
  { id: "proofs", label: "Proofs" },
  { id: "operator", label: "Operator" },
  { id: "research", label: "Research" },
];

export function AdvancedDrawer({
  open,
  tab,
  state,
  fixtures,
  controlKey,
  selectedContract,
  onTab,
  onClose,
  onControlKey,
  onSelectContract,
  onReplayTour,
}: {
  open: boolean;
  tab: AdvancedTab;
  state: EngineState | null;
  fixtures: FixtureLite[];
  controlKey: string;
  selectedContract: OddsViewId;
  onTab: (tab: AdvancedTab) => void;
  onClose: () => void;
  onControlKey: (key: string) => void;
  onSelectContract: (contract: OddsViewId) => void;
  onReplayTour: () => void;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [proofSeq, setProofSeq] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const focusable = Array.from(
          drawerRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div className={`drawer-scrim ${open ? "is-open" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside ref={drawerRef} role="dialog" aria-modal="true" className={`advanced-drawer ${open ? "is-open" : ""}`} aria-hidden={!open} aria-label="Advanced workspace">
        <header className="advanced-drawer__head">
          <div><span>Advanced workspace</span><strong>Research, proofs &amp; operations</strong></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close advanced workspace"><X size={19} /></button>
        </header>
        <div className="advanced-tabs" role="tablist" aria-label="Advanced workspace tabs">
          {TABS.map((item) => <button type="button" role="tab" aria-selected={tab === item.id} key={item.id} onClick={() => onTab(item.id)}>{item.label}</button>)}
        </div>
        <div className="advanced-drawer__body" role="tabpanel">
          {!state && tab !== "operator" ? <div className="drawer-empty">Waiting for an engine session…</div> : tab === "operator" ? (
            <OperatorWorkspace
              state={state}
              fixtures={fixtures}
              controlKey={controlKey}
              onControlKey={onControlKey}
              onReplayTour={onReplayTour}
            />
          ) : state ? (
            <AdvancedContent
              tab={tab}
              state={state}
              fixtures={fixtures}
              controlKey={controlKey}
              selectedContract={selectedContract}
              onControlKey={onControlKey}
              onSelectContract={onSelectContract}
              onProof={setProofSeq}
              onReplayTour={onReplayTour}
            />
          ) : null}
        </div>
      </aside>
      {proofSeq != null ? <ProofModal seq={proofSeq} onClose={() => setProofSeq(null)} /> : null}
    </>
  );
}

function AdvancedContent({
  tab,
  state,
  fixtures,
  controlKey,
  selectedContract,
  onControlKey,
  onSelectContract,
  onProof,
  onReplayTour,
}: {
  tab: AdvancedTab;
  state: EngineState;
  fixtures: FixtureLite[];
  controlKey: string;
  selectedContract: OddsViewId;
  onControlKey: (key: string) => void;
  onSelectContract: (contract: OddsViewId) => void;
  onProof: (seq: number) => void;
  onReplayTour: () => void;
}) {
  if (tab === "causal") return <CausalRail state={state} />;
  if (tab === "markets") return <OddsBoard tick={state.current} />;
  if (tab === "sentinel") return <SentinelFeed signals={state.signals} counts={state.signalCounts} />;
  if (tab === "horizon") return <HorizonAdvanced state={state} />;
  if (tab === "proofs") return <div className="drawer-stack"><AuditTrail ledger={state.ledger} status={state.status} onProof={onProof} />{state.settlement ? <SettlementCard settlement={state.settlement} /> : <div className="drawer-empty">Settlement proof is not available before full-time finalisation.</div>}</div>;
  if (tab === "research") return <ShockStrip state={state} selectedContract={selectedContract} onSelectContract={onSelectContract} />;
  return <OperatorWorkspace state={state} fixtures={fixtures} controlKey={controlKey} onControlKey={onControlKey} onReplayTour={onReplayTour} />;
}

function OperatorWorkspace({ state, fixtures, controlKey, onControlKey, onReplayTour }: { state: EngineState | null; fixtures: FixtureLite[]; controlKey: string; onControlKey: (key: string) => void; onReplayTour: () => void }) {
  return (
    <div className="drawer-stack">
      <Controls fixtures={fixtures} status={state?.status ?? "idle"} anchorReady={state?.anchorAvailable ?? false} controlKey={controlKey} onControlKey={onControlKey} defaultMode="live" />
      <button className="btn" type="button" onClick={onReplayTour}>Replay first-use tour</button>
      <div className="drawer-note"><strong>Execution boundary</strong><p>Operator actions require the shared control key. Viewer streams, the Strategy Lab, and deterministic Demo remain public and read-only.</p></div>
    </div>
  );
}
