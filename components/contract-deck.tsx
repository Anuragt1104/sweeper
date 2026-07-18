"use client";

import { useEffect, useState } from "react";
import type { EngineState } from "@/lib/engine/state";
import type { OddsViewId } from "@/lib/tempo/types";
import {
  projectContractDeck,
  type ContractDeck,
  type ContractOut,
  type ContractOutTone,
} from "@/lib/desk/contract-deck";

const TONE_CLASS: Record<ContractOutTone, string> = {
  home: "horizon-home",
  away: "horizon-away",
  draw: "horizon-quiet",
  over: "horizon-home",
  under: "horizon-away",
  card: "horizon-booking",
  quiet: "horizon-quiet",
  neutral: "horizon-quiet",
};

export function ContractOutcomeDeck({
  state,
  selectedContract,
  demoLabel = false,
}: {
  state: EngineState | null;
  selectedContract: OddsViewId;
  demoLabel?: boolean;
}) {
  const deck = projectContractDeck(state, selectedContract);
  const [shattering, setShattering] = useState(false);
  const collapseId = state?.horizon?.lastCollapse?.id;

  useEffect(() => {
    if (!collapseId || selectedContract !== "next_score") return;
    setShattering(true);
    const timer = window.setTimeout(() => setShattering(false), 400);
    return () => window.clearTimeout(timer);
  }, [collapseId, selectedContract]);

  const live =
    state?.mode === "live" &&
    state.feedHealth.status === "live" &&
    state.feedHealth.hydratedScore &&
    state.feedHealth.hydratedOdds &&
    state.feedHealth.scoreStreamAccepted &&
    state.feedHealth.oddsStreamAccepted;
  const badge =
    state?.provenance === "recorded_live"
      ? "RECORDED LIVE"
      : live
        ? "LIVE"
        : state?.mode === "simulation" || demoLabel
          ? "DEMO"
          : "NOT LIVE";

  const outs = padOuts(deck);

  return (
    <section
      className={`horizon-shell horizon-compact ${shattering ? "is-shattering" : ""}`}
      aria-label="Contract outcome deck"
    >
      <div className="horizon-topline horizon-topline-compact">
        <div className="min-w-0">
          <div className="eyebrow">{deck.subtitle}</div>
          <div className="text-xs text-muted mt-0.5 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{deck.title}</span>
            <TradeChip deck={deck} />
            <span className="text-faint truncate">{deck.detail}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 flex-nowrap min-w-0">
          <span className={`mode-badge shrink-0 ${live ? "is-live" : demoLabel ? "is-replay" : ""}`}>
            {badge}
          </span>
          <span className={`health-pill health-${state?.feedHealth.status ?? "offline"} shrink-0`}>
            <span className="health-dot" /> {state?.feedHealth.status ?? "offline"}
          </span>
          <span className="horizon-clock tnum whitespace-nowrap shrink-0 min-w-[11rem] text-right">
            {deck.source === "horizon" && deck.closesMinute != null && deck.remainingMinutes != null
              ? `${deck.remainingMinutes.toFixed(1)}′ left · closes ${deck.closesMinute.toFixed(1)}′`
              : selectedContract === "match_1x2"
                ? "desk fair · book"
                : "contract outs"}
          </span>
        </div>
      </div>

      <div className="horizon-strip" data-testid="horizon-deck">
        {outs.map((outcome) => (
          <OutCard key={outcome.key} out={outcome} showBook={deck.source === "desk_1x2" || deck.source === "book_lens"} />
        ))}
      </div>
    </section>
  );
}

function TradeChip({ deck }: { deck: ContractDeck }) {
  if (deck.traded) {
    return <span className="chip text-[10px] text-up">TRADED</span>;
  }
  if (deck.source === "horizon") {
    return <span className="chip text-[10px] text-warn">SIGNAL</span>;
  }
  return <span className="chip text-[10px] text-faint">LENS</span>;
}

function OutCard({ out, showBook }: { out: ContractOut; showBook: boolean }) {
  const pct = out.displayProb * 100;
  const has = out.bookProb != null || out.modelProb != null;
  return (
    <article className={`horizon-strip-card ${TONE_CLASS[out.tone]}`}>
      <div className="horizon-strip-label">{out.label}</div>
      <div className="horizon-strip-prob tnum">
        {has ? pct.toFixed(1) : "—"}
        <small>%</small>
      </div>
      <div className="horizon-bar">
        <span style={{ width: `${has ? pct : 0}%` }} />
      </div>
      {showBook && out.bookProb != null && out.modelProb != null && (
        <div className="text-[10px] text-faint tnum mt-0.5">
          book {(out.bookProb * 100).toFixed(0)} · model {(out.modelProb * 100).toFixed(0)}
        </div>
      )}
      <div className="horizon-badges">
        {out.thesis && <span className="prediction-badge thesis">THESIS</span>}
        {out.action && <span className="prediction-badge action">ACTION</span>}
        {!out.thesis && !out.action && <span className="prediction-placeholder">—</span>}
      </div>
    </article>
  );
}

function padOuts(deck: ContractDeck): ContractOut[] {
  const outs = [...deck.outs];
  while (outs.length < 4) {
    outs.push({
      key: `pad-${outs.length}`,
      label: "—",
      bookProb: null,
      modelProb: null,
      displayProb: 0,
      tone: "neutral",
    });
  }
  return outs.slice(0, Math.max(4, outs.length));
}
