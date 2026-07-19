"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LabCommandBar, SessionMasthead, ContractNavigator } from "@/components/lab-chrome";
import { ObservationRail } from "@/components/observation-rail";
import { AnalysisRail } from "@/components/analysis-rail";
import { StrategyRail } from "@/components/strategy-rail";
import { AdvancedDrawer, type AdvancedTab } from "@/components/advanced-drawer";
import { RailDetailDrawer, type RailId } from "@/components/rail-detail-drawer";
import { GuidedTour } from "@/components/guided-tour";
import { useEngineStreamController, type EngineSource } from "@/components/use-engine-stream-controller";
import { StrategyLabProjection } from "@/lib/strategy-lab/projection";
import type { OddsViewId } from "@/lib/tempo/types";
import type { FixtureLite } from "@/components/panels";
import type { Act2Scene } from "@/lib/demo/director";
import { projectWatchtower } from "@/lib/health/public-health";
import { LandingPage } from "@/components/landing-page";
import { ensureLabSurface } from "@/components/lab-url";

const CONTRACTS: OddsViewId[] = ["match_1x2", "ou_25", "next_score", "corners_ou", "swing"];
const ADVANCED_TABS: AdvancedTab[] = ["evidence", "markets", "sentinel", "horizon", "proofs", "operator", "research"];
const DIRECTOR_SCENES: Act2Scene[] = ["overview", "pre_goal", "post_goal", "full_time"];
const RAIL_IDS: RailId[] = ["observe", "interpret", "act"];

export default function StrategyLabPage() {
  return (
    <Suspense fallback={<LabLoading />}>
      <SweeperPage />
    </Suspense>
  );
}

function SweeperPage() {
  const searchParams = useSearchParams();
  const opensLab = ["lab", "demo", "contract", "advanced", "rail"].some((key) => searchParams.has(key));
  return opensLab ? <StrategyLab /> : <LandingPage />;
}

function StrategyLab() {
  const searchParams = useSearchParams();
  const initialSource: EngineSource = searchParams.get("demo") === "act2" ? "demo" : "live";
  const requestedContract = searchParams.get("contract") as OddsViewId | null;
  const requestedAdvanced = searchParams.get("advanced") as AdvancedTab | null;
  const requestedScene = searchParams.get("scene") as Act2Scene | null;
  const presenterMode = searchParams.get("present") === "judge";
  const requestedRail = searchParams.get("rail") as RailId | null;
  const initialRail = requestedRail && RAIL_IDS.includes(requestedRail) ? requestedRail : null;
  const [selectedContract, setSelectedContract] = useState<OddsViewId>(
    requestedContract && CONTRACTS.includes(requestedContract) ? requestedContract : "match_1x2",
  );
  const [advancedTab, setAdvancedTab] = useState<AdvancedTab>(
    requestedAdvanced && ADVANCED_TABS.includes(requestedAdvanced) ? requestedAdvanced : "evidence",
  );
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(!initialRail && requestedAdvanced && ADVANCED_TABS.includes(requestedAdvanced)),
  );
  const [railDetail, setRailDetail] = useState<RailId | null>(initialRail);
  const [fixtures, setFixtures] = useState<FixtureLite[]>([]);
  const [controlKey, setControlKey] = useState("");
  const [tourToken, setTourToken] = useState(0);
  const [demoScene, setDemoScene] = useState<Act2Scene | null>(
    requestedScene && DIRECTOR_SCENES.includes(requestedScene) ? requestedScene : presenterMode ? "overview" : null,
  );
  const [directorPaused, setDirectorPaused] = useState(false);
  const [evidenceStrategy, setEvidenceStrategy] = useState(searchParams.get("strategy") ?? "collapse_fade");
  const controller = useEngineStreamController(initialSource, { demoScene, paused: directorPaused });
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
    ensureLabSurface(url);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, []);

  const persistOverlay = useCallback((rail: RailId | null, advanced: AdvancedTab | null) => {
    const url = new URL(window.location.href);
    if (rail) url.searchParams.set("rail", rail);
    else url.searchParams.delete("rail");
    if (advanced) url.searchParams.set("advanced", advanced);
    else url.searchParams.delete("advanced");
    ensureLabSurface(url);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, []);

  useEffect(() => {
    if (initialRail && requestedAdvanced && ADVANCED_TABS.includes(requestedAdvanced)) {
      persistOverlay(initialRail, null);
    }
  }, [initialRail, persistOverlay, requestedAdvanced]);

  const chooseContract = useCallback((contract: OddsViewId) => {
    setSelectedContract(contract);
    persistUrl("contract", contract);
  }, [persistUrl]);

  const openAdvanced = useCallback((tab: AdvancedTab = advancedTab) => {
    setAdvancedTab(tab);
    setAdvancedOpen(true);
    setRailDetail(null);
    persistOverlay(null, tab);
  }, [advancedTab, persistOverlay]);

  const openEvidence = useCallback((strategyId: string) => {
    setEvidenceStrategy(strategyId);
    persistUrl("strategy", strategyId);
    persistUrl("receipt", "latest_fill");
    openAdvanced("evidence");
  }, [openAdvanced, persistUrl]);

  const chooseScene = useCallback((scene: Act2Scene) => {
    setDirectorPaused(false);
    setDemoScene(scene);
    persistUrl("scene", scene);
  }, [persistUrl]);

  useEffect(() => {
    if (!presenterMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName)) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < DIRECTOR_SCENES.length) chooseScene(DIRECTOR_SCENES[index]);
      if (event.code === "Space") { event.preventDefault(); setDirectorPaused((paused) => !paused); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chooseScene, presenterMode]);

  const closeAdvanced = useCallback(() => {
    setAdvancedOpen(false);
    persistOverlay(null, null);
  }, [persistOverlay]);

  const chooseAdvanced = useCallback((tab: AdvancedTab) => {
    setAdvancedTab(tab);
    persistOverlay(null, tab);
  }, [persistOverlay]);

  const openRailDetail = useCallback((rail: RailId) => {
    setAdvancedOpen(false);
    setRailDetail(rail);
    persistOverlay(rail, null);
  }, [persistOverlay]);

  const closeRailDetail = useCallback(() => {
    setRailDetail(null);
    persistOverlay(null, null);
  }, [persistOverlay]);

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
              <ObservationRail state={controller.state} view={view} onExpand={() => openRailDetail("observe")} />
              <AnalysisRail state={controller.state} view={view} onExpand={() => openRailDetail("interpret")} />
              <StrategyRail
                state={controller.state}
                view={view}
                onExpand={() => openRailDetail("act")}
                onEvidence={openEvidence}
              />
            </div>
          </>
        ) : (
          <SessionWatchtower source={controller.source} connection={controller.connection} health={controller.health} />
        )}
      </main>

      <AdvancedDrawer
        open={advancedOpen}
        tab={advancedTab}
        state={controller.state}
        fixtures={fixtures}
        controlKey={controlKey}
        selectedContract={selectedContract}
        source={controller.source}
        evidenceStrategy={evidenceStrategy}
        onTab={chooseAdvanced}
        onClose={closeAdvanced}
        onControlKey={storeControlKey}
        onReplayTour={() => { setTourToken((token) => token + 1); closeAdvanced(); }}
      />
      <RailDetailDrawer rail={railDetail} state={controller.state} view={view} onClose={closeRailDetail} />
      {controller.state && !presenterMode ? <GuidedTour replayToken={tourToken} /> : null}
      {presenterMode ? (
        <PresenterBar scene={demoScene ?? "overview"} paused={directorPaused} onScene={chooseScene} onPause={() => setDirectorPaused((paused) => !paused)} />
      ) : null}
    </div>
  );
}

function SessionWatchtower({ source, connection, health }: { source: EngineSource; connection: "connecting" | "open" | "stale" | "offline"; health: ReturnType<typeof useEngineStreamController>["health"] }) {
  const truth = projectWatchtower(health, connection);
  if (source === "demo") return <SessionLoading connection={connection} />;
  return (
    <section className="watchtower" aria-live="polite">
      <div className="lab-loading__scan" />
      <span>TXLINE MAINNET WATCHTOWER</span>
      <h1>{truth.noActiveFixture ? "Waiting for the next covered fixture" : `Preparing fixture ${health?.activeFixtureId}`}</h1>
      <p>No simulation will silently replace an unavailable upstream. Browser connectivity and TxLINE fixture flow are reported separately.</p>
      <div className="watchtower__truth"><strong>{truth.viewerStream}</strong><strong>{truth.upstream}</strong></div>
      <div className="watchtower__grid">
        <HealthFact label="Process" value={health?.process.ok ? "READY" : "CHECKING"} detail={health ? `${health.process.uptimeSeconds}s uptime${health.process.rssMb ? ` · ${health.process.rssMb} MB RSS` : ""}` : "Awaiting health"} />
        <HealthFact label="Database" value={health?.database.ready ? "READY" : "CHECKING"} detail="Postgres recovery store" />
        <HealthFact label="Supervisor" value={health?.supervisor.enabled ? health.supervisor.state.toUpperCase() : "PAUSED"} detail={health?.supervisor.detail ?? "Awaiting health"} />
        <HealthFact label="Credentials" value={health?.credentials.txlineConfigured ? "PRESENT" : "MISSING"} detail="Values are never exposed" />
        <HealthFact label="Score upstream" value={health?.upstream?.scoreStreamAccepted ? "ACCEPTED" : "WAITING"} detail={health?.upstream?.hydratedScore ? "Snapshot hydrated" : "No active snapshot"} />
        <HealthFact label="Odds upstream" value={health?.upstream?.oddsStreamAccepted ? "ACCEPTED" : "WAITING"} detail={health?.upstream?.hydratedOdds ? "Snapshot hydrated" : "No active snapshot"} />
      </div>
      <div className="watchtower__next"><span>Next watched fixture</span><strong>{health?.supervisor.nextFixtureId ?? "No active covered fixture"}</strong></div>
    </section>
  );
}

function SessionLoading({ connection }: { connection: string }) {
  return <section className="lab-loading" aria-live="polite"><div className="lab-loading__scan" /><span>ACT II · DETERMINISTIC SIMULATION</span><h1>Preparing Argentina · Poland</h1><p>The session remains labelled REPLAY and SIMULATED. It starts before the 41′ goal so the complete causal transition is visible.</p><strong>{connection}</strong></section>;
}

function HealthFact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="watchtower__fact"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function PresenterBar({ scene, paused, onScene, onPause }: { scene: Act2Scene; paused: boolean; onScene: (scene: Act2Scene) => void; onPause: () => void }) {
  return <div className="presenter-bar" aria-label="Judge demo director"><span>DEMO DIRECTOR</span>{DIRECTOR_SCENES.map((item, index) => <button type="button" key={item} className={scene === item ? "is-active" : ""} onClick={() => onScene(item)}><kbd>{index + 1}</kbd>{item.replaceAll("_", " ")}</button>)}<button type="button" onClick={onPause}><kbd>Space</kbd>{paused ? "Resume" : "Freeze"}</button></div>;
}

function LabLoading() {
  return <main className="lab-bootstrap">Loading Strategy Lab…</main>;
}
