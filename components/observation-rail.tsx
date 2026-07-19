"use client";

import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Database, RadioTower } from "lucide-react";
import type { EngineState } from "@/lib/engine/state";
import type { StrategyLabView } from "@/lib/strategy-lab/projection";

export function ObservationRail({ state, view }: { state: EngineState; view: StrategyLabView }) {
  const current = state.current;
  return (
    <section className="lab-rail lab-rail--observation" aria-labelledby="observation-title">
      <RailHeading number="1" verb="OBSERVE" title="What happened?" description="Facts received from TxLINE." id="observation-title" />

      <div className="observation-score">
        <div>
          <span>Score</span>
          <strong>{current ? `${current.homeGoals}–${current.awayGoals}` : "—"}</strong>
        </div>
        <div>
          <span>Clock</span>
          <strong className="tnum">{current?.clock ?? "—"}</strong>
        </div>
        <div>
          <span>Latest fact</span>
          <strong>{view.observation.events[0]?.label ?? "No material event yet"}</strong>
        </div>
      </div>

      <div className="rail-section rail-section--book">
        <div className="rail-section__head"><span>Observed book</span><small>{view.observation.bookMessage}</small></div>
        {view.observation.bookAvailable ? (
          <div className="book-lines">
            {view.observation.book.slice(0, 3).map((line) => (
              <div className={`book-line book-line--${line.movement}`} key={line.key}>
                <div><strong>{line.label}</strong><span>{line.stale ? "STALE" : line.movement}</span></div>
                <strong className="tnum">{Math.round(line.probability * 100)}<small>%</small></strong>
                <span className="tnum">{line.decimal.toFixed(2)} <MovementIcon movement={line.movement} /></span>
              </div>
            ))}
          </div>
        ) : (
          <div className="truth-empty"><Database size={17} aria-hidden="true" /><span>Not returned by TxLINE</span></div>
        )}
      </div>

      <div className="rail-section rail-section--tempo">
        <div className="rail-section__head"><span>Tempo enrichment</span><small>Raw counts · {state.shockStrip.tempo.source}</small></div>
        <div className="tempo-table" role="table" aria-label="Raw match tempo counts">
          <div role="row" className="tempo-row tempo-row--head"><span>Count</span><b>{state.fixture.homeCode}</b><b>{state.fixture.awayCode}</b></div>
          {view.observation.tempo.map((stat) => (
            <div role="row" className="tempo-row" key={stat.key}>
              <span>{stat.label}</span>
              <b className="tnum">{stat.home}{stat.suffix}<Delta value={stat.homeDelta} /></b>
              <b className="tnum">{stat.away}{stat.suffix}<Delta value={stat.awayDelta} /></b>
            </div>
          ))}
        </div>
      </div>

      <div className="observation-bottom">
        <div className="event-tape" aria-label="Latest meaningful observations">
          {view.observation.events.length ? view.observation.events.map((event) => (
            <div className="event-pulse" key={event.id}>
              <i aria-hidden="true" />
              <time className="tnum">{event.minute.toFixed(0)}′</time>
              <span><strong>{event.label}</strong><small>{event.source}</small></span>
            </div>
          )) : <div className="event-tape__empty">Event tape is quiet</div>}
        </div>
        <FeedTruth state={state} scoreAge={view.observation.scoreAgeMs} oddsAge={view.observation.oddsAgeMs} />
      </div>
    </section>
  );
}

function RailHeading({ number, verb, title, description, id }: { number: string; verb: string; title: string; description: string; id: string }) {
  return (
    <header className="rail-heading">
      <span className="rail-number">{number}</span>
      <div><span>{verb}</span><h2 id={id}>{title}</h2><p>{description}</p></div>
    </header>
  );
}

function MovementIcon({ movement }: { movement: "up" | "down" | "flat" }) {
  if (movement === "up") return <ArrowUpRight size={12} aria-label="moving up" />;
  if (movement === "down") return <ArrowDownRight size={12} aria-label="moving down" />;
  return <ArrowRight size={12} aria-label="flat" />;
}

function Delta({ value }: { value: number }) {
  if (!value) return null;
  return <small className="tempo-delta">+{value}</small>;
}

function FeedTruth({ state, scoreAge, oddsAge }: { state: EngineState; scoreAge: number | null; oddsAge: number | null }) {
  return (
    <div className="feed-truth">
      <div className="rail-section__head"><span>Feed truth</span><small>{state.feedHealth.status}</small></div>
      <div className="feed-truth__grid">
        <TruthItem icon={<RadioTower size={13} />} label="Score SSE" value={accepted(state.feedHealth.scoreStreamAccepted, state.provenance)} />
        <TruthItem icon={<Activity size={13} />} label="Odds SSE" value={accepted(state.feedHealth.oddsStreamAccepted, state.provenance)} />
        <TruthItem label="Score age" value={age(scoreAge)} />
        <TruthItem label="Odds age" value={age(oddsAge)} />
        <TruthItem label="Sequence" value={state.feedHealth.sequenceGap ? `Gap ${state.feedHealth.sequenceGap.expected}→${state.feedHealth.sequenceGap.received}` : "Continuous"} />
        <TruthItem label="Reconnects" value={String(state.feedHealth.reconnectCount)} />
      </div>
    </div>
  );
}

function TruthItem({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return <div>{icon}<span>{label}</span><strong>{value}</strong></div>;
}

function accepted(value: boolean, provenance: EngineState["provenance"]): string {
  if (provenance !== "live") return "N/A · replay";
  return value ? "Accepted" : "Waiting";
}

function age(value: number | null): string {
  if (value == null) return "—";
  if (value < 1000) return "now";
  return `${Math.round(value / 1000)}s`;
}

