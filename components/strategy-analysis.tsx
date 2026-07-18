"use client";

import type { EngineState } from "@/lib/engine/state";
import type { OddsViewId } from "@/lib/tempo/types";
import { ODDS_VIEW_LABELS } from "@/lib/tempo/types";
import { bindingsForContract, type StrategyContractRole } from "@/lib/desk/strategy-contracts";
import { AGENT_COLOR } from "@/components/panels";
import { pnlColor, signFmt } from "@/components/format";

export function StrategyAnalysis({
  state,
  selectedContract,
}: {
  state: EngineState | null;
  selectedContract: OddsViewId;
}) {
  const bindings = bindingsForContract(selectedContract);
  const edge = state?.deskModel?.edgeVsObs;
  const modelReady = state?.deskModel?.ready;

  return (
    <section className="panel strategy-analysis-slot" aria-label="Strategy analysis by contract">
      <div className="panel-head flex items-center gap-2">
        <div className="mr-auto min-w-0">
          <span className="text-sm font-semibold">Strategy analysis</span>
          <span className="ml-2 text-[11px] text-faint">
            {ODDS_VIEW_LABELS[selectedContract]} · signals → decision → fill → PnL
          </span>
        </div>
        {selectedContract === "match_1x2" && modelReady && edge && (
          <span className="text-[11px] tnum text-muted shrink-0">
            desk edge H {signFmt(edge.home * 100, 1)}pp · D {signFmt(edge.draw * 100, 1)}pp · A{" "}
            {signFmt(edge.away * 100, 1)}pp
          </span>
        )}
      </div>

      {bindings.length === 0 ? (
        <div className="px-3 py-4 text-xs text-faint">
          No agents trade or read this contract yet — lens / book only.
        </div>
      ) : (
        <div className="px-3 pb-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {bindings.map((b) => {
            const agent = state?.agents.find((a) => a.id === b.agentId);
            return (
              <article
                key={b.agentId}
                className="rounded-lg border border-line px-3 py-2 bg-panel2/50 min-h-[88px]"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: AGENT_COLOR[b.agentId] ?? "var(--color-faint)" }}
                  />
                  <span className="font-semibold text-ink truncate">{b.name}</span>
                  <RoleBadge role={b.role} />
                  <span className={`ml-auto tnum shrink-0 ${pnlColor(agent?.metrics.equity ?? 0)}`}>
                    {agent ? signFmt(agent.metrics.equity) : "—"}
                  </span>
                </div>
                <div className="text-[11px] text-muted mt-1 line-clamp-2">{b.blurb}</div>
                <div className="text-[10px] text-faint mt-1 truncate">
                  {b.signals.slice(0, 4).join(" · ")}
                </div>
                {agent && (
                  <div className="text-[10px] text-muted mt-1.5 line-clamp-2 tnum">
                    {agent.stoodDown ? (
                      <span className="text-warn">Stand-down · {agent.lastRationale}</span>
                    ) : (
                      agent.lastRationale
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RoleBadge({ role }: { role: StrategyContractRole }) {
  if (role === "trades") {
    return <span className="text-[10px] px-1.5 py-0.5 rounded border border-up/40 text-up">trades</span>;
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded border border-warn/40 text-warn">signal</span>
  );
}
