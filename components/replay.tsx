"use client";

import { useState } from "react";
import type { EngineState } from "@/lib/engine/state";
import { EquityChart } from "@/components/charts";
import { AGENT_COLOR, type FixtureLite } from "@/components/panels";
import { pnlColor, signFmt } from "@/components/format";

interface ReplayResult {
  state: EngineState;
  series: { agentId: string; name: string; kind: string; equity: number[] }[];
  windows: { kind: string; startMinute: number; endMinute: number }[];
}

const SCENARIOS = [
  { id: "stale", label: "Stale line @33′ (4m)", ev: { kind: "stale" as const, atMinute: 33, durationMinutes: 4 } },
  { id: "outlier", label: "Outlier print @58′", ev: { kind: "outlier" as const, atMinute: 58, marketType: "match_result" as const } },
  { id: "suspend", label: "Suspension @71′ (3m)", ev: { kind: "suspend" as const, atMinute: 71, durationMinutes: 3 } },
];

const WINDOW_COLOR: Record<string, string> = {
  stale: "text-warn",
  outlier: "text-crit",
  suspend: "text-down",
};

export function ReplayLab({ fixtures, controlKey }: { fixtures: FixtureLite[]; controlKey: string }) {
  const [fixtureId, setFixtureId] = useState("");
  const [seed, setSeed] = useState(7);
  const [picked, setPicked] = useState<Record<string, boolean>>({ stale: true, outlier: true, suspend: true });
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const scenario = SCENARIOS.filter((s) => picked[s.id]).map((s) => s.ev);
      const res = await fetch("/api/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Control-Key": controlKey },
        body: JSON.stringify({ fixtureId: fixtureId || undefined, config: { seed }, scenario }),
      });
      const json = await res.json();
      if (json && Array.isArray(json.series)) setResult(json as ReplayResult);
    } catch {
      /* network/parse error — leave the previous result in place */
    } finally {
      setBusy(false);
    }
  }

  const series = (result?.series ?? []).map((s) => ({ name: s.name, color: AGENT_COLOR[s.agentId] ?? "var(--color-muted)", equity: s.equity }));
  const ranked = result ? [...result.state.agents].sort((a, b) => b.metrics.equity - a.metrics.equity) : [];

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="eyebrow">Replay Lab · deterministic re-simulation</div>
        <span className="chip">re-runs offline, identical every time</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
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
        {SCENARIOS.map((s) => (
          <label key={s.id} className={`chip cursor-pointer ${picked[s.id] ? WINDOW_COLOR[s.id] : "text-faint"}`}>
            <input
              type="checkbox"
              className="accent-current"
              checked={!!picked[s.id]}
              onChange={(e) => setPicked((p) => ({ ...p, [s.id]: e.target.checked }))}
            />
            {s.label}
          </label>
        ))}
        <button className="btn btn-primary" disabled={busy || !controlKey} onClick={run}>
          {busy ? "Running…" : "▶ Run replay"}
        </button>
        {!controlKey && <span className="chip text-warn">spectator · operator key required</span>}
      </div>

      {!result && <div className="text-center text-faint text-xs py-10">Run a replay to compare strategies over an identical, seeded match.</div>}

      {result && (
        <div className="grid md:grid-cols-[1fr_260px] gap-4">
          <div>
            <div className="text-xs text-muted mb-1">
              {result.state.fixture.home} {result.state.settlement?.finalScore.home}–{result.state.settlement?.finalScore.away}{" "}
              {result.state.fixture.away} · equity curves (bankroll 1000)
            </div>
            <EquityChart series={series} baseline={1000} width={620} height={240} />
            <div className="flex flex-wrap gap-3 mt-1">
              {series.map((s) => (
                <span key={s.name} className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="w-2.5 h-0.5 rounded" style={{ background: s.color }} /> {s.name}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="eyebrow mb-2">Final standings</div>
            <div className="space-y-1 mb-4">
              {ranked.map((a, i) => (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-faint tnum text-xs">{i + 1}</span>
                    <span className="w-2 h-2 rounded-full" style={{ background: AGENT_COLOR[a.id] }} />
                    {a.name}
                  </span>
                  <span className={`tnum ${pnlColor(a.metrics.pnl)}`}>{signFmt(a.metrics.pnl)}</span>
                </div>
              ))}
            </div>
            <div className="eyebrow mb-2">Injected anomalies</div>
            <div className="space-y-1">
              {result.windows.length === 0 && <div className="text-faint text-xs">none (clean run)</div>}
              {result.windows.map((w, i) => (
                <div key={i} className={`text-xs ${WINDOW_COLOR[w.kind] ?? "text-muted"}`}>
                  {w.kind} · {w.startMinute}′{w.endMinute > w.startMinute ? `–${w.endMinute}′` : ""}
                </div>
              ))}
            </div>
            <div className="text-[10px] text-faint mt-3 border-t border-line pt-2">
              Ground-truth injections (left) vs what the sentinel flagged live: sharp {result.state.signalCounts.sharp_move} ·
              stale {result.state.signalCounts.stale_line} · outlier {result.state.signalCounts.outlier_print} · susp{" "}
              {result.state.signalCounts.suspended}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
