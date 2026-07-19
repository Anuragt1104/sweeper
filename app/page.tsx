"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LabCommandBar, SessionMasthead, ContractNavigator } from "@/components/lab-chrome";
import { ObservationRail } from "@/components/observation-rail";
import { AnalysisRail } from "@/components/analysis-rail";
import { StrategyRail } from "@/components/strategy-rail";
import { AdvancedDrawer, type AdvancedTab } from "@/components/advanced-drawer";
import { GuidedTour } from "@/components/guided-tour";
import { useEngineStreamController, type EngineSource } from "@/components/use-engine-stream-controller";
import { StrategyLabProjection } from "@/lib/strategy-lab/projection";
import type { OddsViewId } from "@/lib/tempo/types";
import type { FixtureLite } from "@/components/panels";

const CONTRACTS: OddsViewId[] = ["match_1x2", "ou_25", "next_score", "corners_ou", "swing"];
const ADVANCED_TABS: AdvancedTab[] = ["causal", "markets", "sentinel", "horizon", "proofs", "operator", "research"];

export default function StrategyLabPage() {
  return (
    <Suspense fallback={<LabLoading />}>
      <StrategyLab />
    </Suspense>
  );
}

function StrategyLab() {
  const searchParams = useSearchParams();
  const initialSource: EngineSource = searchParams.get("demo") === "act2" ? "demo" : "live";
  const requestedContract = searchParams.get("contract") as OddsViewId | null;
  const requestedAdvanced = searchParams.get("advanced") as AdvancedTab | null;
  const [selectedContract, setSelectedContract] = useState<OddsViewId>(
    requestedContract && CONTRACTS.includes(requestedContract) ? requestedContract : "match_1x2",
  );
  const [advancedTab, setAdvancedTab] = useState<AdvancedTab>(
    requestedAdvanced && ADVANCED_TABS.includes(requestedAdvanced) ? requestedAdvanced : "causal",
  );
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(requestedAdvanced && ADVANCED_TABS.includes(requestedAdvanced)));
  const [fixtures, setFixtures] = useState<FixtureLite[]>([]);
  const [controlKey, setControlKey] = useState("");
  const [tourToken, setTourToken] = useState(0);
  const controller = useEngineStreamController(initialSource);
  const view = useMemo(
    () => controller.state ? StrategyLabProjection.project(controller.state, selectedContract) : null,
    [controller.state, selectedContract],
  );

  useEffect(() => {
    setControlKey(window.sessionStorage.getItem("sweeper-control-key") ?? "");
    fetch("/api/fixtures", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: FixtureLite[]) => setFixtures(Array.isArray(body) ? body : []))
      .catch(() => undefined);
  }, []);

  const persistUrl = useCallback((key: string, value: string | null) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, []);

  const chooseContract = useCallback((contract: OddsViewId) => {
    setSelectedContract(contract);
    persistUrl("contract", contract);
  }, [persistUrl]);

  const openAdvanced = useCallback((tab: AdvancedTab = advancedTab) => {
    setAdvancedTab(tab);
    setAdvancedOpen(true);
    persistUrl("advanced", tab);
  }, [advancedTab, persistUrl]);

  const closeAdvanced = useCallback(() => {
    setAdvancedOpen(false);
    persistUrl("advanced", null);
  }, [persistUrl]);

  const chooseAdvanced = useCallback((tab: AdvancedTab) => {
    setAdvancedTab(tab);
    persistUrl("advanced", tab);
  }, [persistUrl]);

  function storeControlKey(value: string) {
    setControlKey(value);
    if (value) window.sessionStorage.setItem("sweeper-control-key", value);
    else window.sessionStorage.removeItem("sweeper-control-key");
  }

  return (
    <div className="strategy-lab-shell">
      <LabCommandBar
        state={controller.state}
        source={controller.source}
        connection={controller.connection}
        onSource={controller.switchSource}
        onAdvanced={() => openAdvanced()}
        hasControlKey={Boolean(controlKey)}
      />

      <main className="strategy-lab-main">
        {controller.state && view ? (
          <>
            <SessionMasthead state={controller.state} source={controller.source} />
            <ContractNavigator contracts={view.contracts} selected={selectedContract} onSelect={chooseContract} />
            <div className="lab-rails">
              <ObservationRail state={controller.state} view={view} />
              <AnalysisRail state={controller.state} view={view} />
              <StrategyRail state={controller.state} view={view} />
            </div>
          </>
        ) : (
          <SessionLoading source={controller.source} connection={controller.connection} />
        )}
      </main>

      <AdvancedDrawer
        open={advancedOpen}
        tab={advancedTab}
        state={controller.state}
        fixtures={fixtures}
        controlKey={controlKey}
        selectedContract={selectedContract}
        onTab={chooseAdvanced}
        onClose={closeAdvanced}
        onControlKey={storeControlKey}
        onSelectContract={chooseContract}
        onReplayTour={() => { setTourToken((token) => token + 1); closeAdvanced(); }}
      />
      <GuidedTour replayToken={tourToken} />
    </div>
  );
}

function SessionLoading({ source, connection }: { source: EngineSource; connection: string }) {
  return (
    <section className="lab-loading" aria-live="polite">
      <div className="lab-loading__scan" />
      <span>{source === "demo" ? "ACT II · DETERMINISTIC REPLAY" : "LIVE SESSION"}</span>
      <h1>{source === "demo" ? "Preparing Argentina · Poland" : "Waiting for the next watched fixture"}</h1>
      <p>{source === "demo" ? "The session starts before the 41′ goal so the full Observation → Analysis → Strategy transition remains visible." : "No simulation will silently replace the upstream feed. The Strategy Lab opens when a truthful engine snapshot arrives."}</p>
      <strong>{connection}</strong>
    </section>
  );
}

function LabLoading() {
  return <main className="lab-bootstrap">Loading Strategy Lab…</main>;
}
