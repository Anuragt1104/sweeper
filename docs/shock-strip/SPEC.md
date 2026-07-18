# Shock Strip — Product Spec

**Status:** shipped three-track contract; ideation formulas remain tunable  
**Project:** Sweeper × N+1 Machine  
**Feature slug:** `shock-strip`  
**Primary test seam:** `ShockStripAssembler` → serializable `ShockStripState`  
**Related plan:** ideation baseline in this folder (`IDEATION.md`); Horizon settlement rules remain governed by existing Horizon ADRs / `HORIZON_RULES.md`

---

## Problem Statement

Operators watching a live Sweeper session see a Horizon Deck (what happens next) and odds boards, but lack a **spatial memory of the match minute**: what just happened on the pitch, how the book is repricing short-term vs long-term markets, and how the machine’s thesis confidence is tracking those two realities together.

TxLINE alone only verifies goals, cards, corners, phase, and odds. Richer tempo (shots, fouls, attacks, etc.) may come from optional enrichment, but must never pretend to settle Horizon. The desk needs one strip that makes those three information strategies visible without collapsing them into a single confused chart.

## Solution

Add a **Shock Strip** under the Horizon Deck with exactly **three named strategy tracks** (never referred to as top/middle/bottom):

1. **Tempo** — match facts and stats (spikes + cumulative curves)
2. **Odds** — TxLINE prices only, with switchable short- and long-horizon market views
3. **Hybrid** — prediction visualization that blends Tempo intensity, Odds velocity, and Horizon thesis probability / collapses

Baseline formulas and severity weights in ideation docs are a **starting point**, not frozen product law. Implementers may improve Tempo markers, Odds views, and Hybrid blending freely **without inventing a fourth strategy type**.

## User Stories

1. As a desk operator, I want a minute-aligned strip under the Horizon Deck, so that I can see what happened and what the machine believed without leaving the console.
2. As a desk operator, I want tracks labeled Tempo, Odds, and Hybrid, so that I know which strategy produced each visual.
3. As a desk operator, I want Tempo to show goals, cards, and corners from TxLINE scores, so that verified match facts are always present.
4. As a desk operator, I want Tempo to show shots and shots on target when enrichment is available, so that attacking pressure is visible.
5. As a desk operator, I want additional Tempo markers such as fouls, offsides, attacks, dangerous attacks, and possession shifts when data exists, so that the strip feels alive between goals.
6. As a desk operator, I want cumulative Tempo curves (shots, SOT, corners, cards, fouls), so that I can read match shape at a glance.
7. As a desk operator, I want Tempo never to plot odds prices, so that pitch facts stay cleanly separated from the book.
8. As a trading operator, I want an Odds track fed only by TxLINE odds, so that market movement is trustworthy and undiluted by enrichment.
9. As a trading operator, I want a default Odds view of next-team-to-score implied probabilities, so that I can watch a short-term market aligned with Horizon thinking.
10. As a trading operator, I want to switch Odds views to over/under 2.5, match 1X2, corners over/under, and a derived swing view, so that I can change time horizon without leaving the strip.
11. As a trading operator, I want missing Odds markets to show as unavailable rather than inventing prices, so that I do not trade on fake data.
12. As a trading operator, I want the swing view to show favorite implied probability and recent delta, so that I can see short-term market heat.
13. As a desk operator, I want Hybrid to plot Machine Thesis probability over the match minute, so that I can see how confident the agent is in its call.
14. As a desk operator, I want Hybrid to plot a pressure series blending recent Tempo intensity and short-term Odds velocity, so that I can see when pitch and book agree or diverge.
15. As a desk operator, I want Horizon collapse markers on Hybrid only, so that prediction outcomes are not confused with raw Tempo spikes.
16. As a desk operator, I want surprise collapses to render taller than routine collapses, so that machine misses are visually obvious.
17. As a product owner, I want enrichment never to collapse or settle Horizon, so that every Horizon branch remains falsifiable from TxLINE.
18. As a demo operator, I want simulation/replay to synthesize dense Tempo enrichment deterministically, so that demos work without an API-Football key.
19. As a live operator, I want optional API-Football polling for Tempo enrichment when a key is configured, so that live sessions can show shots and related stats.
20. As a live operator, I want clear Tempo status (ready / polling / unavailable / error), so that I know whether enrichment is live.
21. As a live operator, I want fixture matching from TxLINE teams/kickoff to API-Football to fail soft, so that a miss does not break the session.
22. As a viewer, I want the strip to update from the existing SSE engine state, so that I do not need a second feed subscription.
23. As a viewer, I want a shared match-minute axis and playhead, so that Tempo, Odds, and Hybrid stay comparable.
24. As an implementer, I want severity weights and blend coefficients to remain tunable, so that I can improve strategies without a schema rewrite.
25. As an implementer, I want exactly three strategy types forever in this feature, so that scope does not sprawl into new named tracks.
26. As an implementer, I want the primary test seam to be ShockStripAssembler → ShockStripState, so that UI and HTTP adapters stay out of unit tests.
27. As a judge, I want the strip to reinforce the N+1 story (futures that die when reality arrives), so that Hybrid collapses connect visually to the Horizon Deck.
28. As a security-conscious operator, I want API keys and TxLINE tokens never in the browser or committed docs, so that secrets stay server-side.
29. As a replay operator, I want deterministic Tempo synthesis from fixture seed, so that scrubbing a replay reproduces the same strip.
30. As a desk operator, I want Odds view chips that only enable markets present on the tick, so that I am not offered empty views.
31. As a desk operator, I want legend/status copy that names strategies and active Odds view, so that screenshots remain self-explanatory.
32. As an implementer, I want existing Horizon settlement tests to remain green without modification for enrichment, so that the proof story stays intact.
33. As a product owner, I want free-kick location and continuous XY tracking out of scope, so that we do not block on data we do not have.
34. As a desk operator, I want phase markers (kick-off, half-time, full-time) on Tempo at low severity, so that structure of the match is visible.
35. As an implementer, I want documentation that treats Tempo · Odds · Hybrid as the shipped strip contract, so that further work improves strategies inside that frame.
36. As a product owner, I want the strip to feed AgentContext desk signals (Horizon + Hybrid + tempo intensity) so Hybrid Thesis and peers can trade on the same minute axis — without inventing a fourth strip track.

## Implementation Decisions

1. **Three named strategies only:** `tempo` | `odds` | `hybrid`. UI, docs, and types use these names. Do not invent a fourth strategy. Do not call them top/middle/bottom. **Hybrid Thesis is an agent**, not a fourth strip track.
2. **Primary module:** a Shock Strip assembler that ingests market ticks (and Horizon side-state) and emits serializable strip state on the engine snapshot consumed by SSE/UI.
3. **Engine order:** Horizon processes the tick first; the strip assembles after, reading thesis/collapse/odds-swing. Strip output never feeds Horizon settlement. Agents may read Horizon + strip Hybrid/Tempo via `AgentContext.desk`.
4. **Tempo inputs:** TxLINE score-derived events (goal, yellow, red, corner, phase) plus optional enrichment snapshot (shots, SOT, fouls, offsides, attacks, dangerous attacks, possession). Enrichment source is sim in simulation/replay; API-Football when configured in live.
5. **Odds inputs:** TxLINE odds markets only. Multi-view switcher over at least: next_score (default), ou_25, match_1x2, corners_ou, swing (derived). All views that have data are recorded each tick; UI selects which to plot.
6. **Hybrid inputs:** Horizon thesis probability, Tempo intensity over a short window, Odds velocity from short-term favorite (prefer next_score, else 1X2), collapse markers from Horizon.
7. **Baseline formulas are ideation, not law:** example pressure blend `0.55 * tempoIntensity + 0.45 * oddsVelocity` and severity tables may be improved. Keep coefficients configurable or clearly isolated so strategy iteration does not require rewriting the strip contract.
8. **Serializable state shape (prototype decision):** tracks expose series + markers + status; Odds exposes a map of views; Hybrid exposes thesisProb/pressure series plus collapse markers. Exact field names may evolve if tests and SSE payload stay coherent.
9. **UI:** Agent Arena Desk is the console hero; strip sits as shared signals under Horizon. Shared minute axis; Odds view chips; Hybrid thesis + pressure + collapses.
10. **Secrets:** `API_FOOTBALL_KEY` / TxLINE tokens server-only via env; never sent to clients.
11. **Respect existing Horizon ADRs:** material settlement remains goals/cards (and Quiet at window end); enrichment and corners do not become Horizon settlement events in v1.
12. **Current codebase note:** Tempo · Odds · Hybrid is the shipped strip contract under `lib/tempo/` and `components/shock-strip.tsx`. Hybrid Thesis is an agent that consumes desk signals — not a fourth strip track.

## Testing Decisions

**What makes a good test here:** assert external behavior of the assembler seam only—given ticks and Horizon side-inputs, the emitted `ShockStripState` contains the expected track series/markers/status. Do not lock tests to SVG coordinates, color tokens, or specific numeric weights unless testing a pure helper with explicit fixtures.

**Primary seam:** ShockStripAssembler (or successor) → ShockStripState.

**Also covered lightly:** enrichment diff helpers (cumulative → discrete events); soft team-name matching for API-Football; engine still exposes strip on `getState()` without Horizon reading enrichment events.

**Prior art:** existing `test/tempo.test.ts`, `test/horizon.test.ts`, `test/txline.test.ts` patterns (node:test + deterministic fixtures).

**Do not regress:** Horizon first-material-event settlement, quiet-at-close, surprise/thesis-dead semantics.

## Out of Scope

- A fourth named strategy track
- Free-kick / set-piece XY location or continuous player/ball tracking
- Using enrichment (shots, fouls, etc.) to settle or falsify Horizon branches
- Replacing the Horizon Deck UI
- Committing API keys or live tokens
- FIFA branding / who-wins escrow products

## Further Notes

- Ideation baseline (marker tables, Odds views, example weights): see `docs/shock-strip/IDEATION.md`.
- Handoff for the next agent: see `docs/shock-strip/HANDOFF.md`.
- TxLINE field coverage: `docs/TXLINE_ENDPOINTS.md`.
- Horizon rules: `docs/HORIZON_RULES.md`.
- Product vocabulary for N+1 (Horizon, thesis, collapse, Quiet): align with Sweeper README and Horizon docs; do not redefine settlement in this feature.
- Improving Tempo density, Odds short-term views, and Hybrid blending is explicitly encouraged within the three-strategy frame.
