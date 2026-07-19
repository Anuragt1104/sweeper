# Sweeper Domain Language

Sweeper is an autonomous multi-agent desk that shadows TxLINE football markets and proves its own decisions.

## Layers

**Observation**:
A fixture fact the desk ingests before any desk computation — TxLINE score, book, and events, plus optional non-TxLINE enrichment such as tempo counts.
_Avoid_: information, data, signal (alone), “tempo metric”

**Tempo enrichment**:
Non-TxLINE match-state enrichment (shots, SOT, attacks, fouls, possession, …) used only as Observation. It never settles Horizon and is never a single scalar “tempo score” in the product language.
_Avoid_: Tempo strategy, tempo intensity (as a product noun), “shared tempo signal”

**Analysis**:
A desk-computed view derived from Observations — desk fair, Horizon probabilities, MatchIntensity, regime, strategy lenses, Sentinel assessments.
_Avoid_: signal (alone), shared signals, prediction (unless tied to a Strategy)

**Contract**:
A tradeable selection market the desk may act on (e.g. Match 1X2, O/U). Shadow fills settle against these selections.
_Avoid_: bet, odd, market (alone)

**Strategy**:
A named agent policy that reads Analysis and may place shadow fills on Contracts. Which Contracts it may act on is part of the Strategy’s design, not a global desk lockout.
_Avoid_: agent (when you mean the policy), bot

**Strategy stance**:
A Strategy’s actionable read on one Contract at a tick — trade, quote, stand-down, or flat — with edge vs book when it prices that Contract.
_Avoid_: prediction (unless the Strategy publishes an explicit probability vector)

**Strategy design**:
A written and coded declaration of what a Strategy reads (Observation sources and Analysis metrics), which Contracts it is eligible for, and how it forms a stance. Phase A retunes the existing roster onto this seam; new fill policies beyond current 1X2/O/U paths are Phase B candidates only.
_Avoid_: inventing fills without a model, treating Tempo·Odds·Hybrid as Strategies

**Strategy Lab**:
The primary product surface — compose and compare Strategies over shared Observation sources and Analysis metrics on one live or demo Session. Main page is three rails (Observation → Analysis → Strategy); Arena is the Session scoreboard under Strategy; Causal rail is Advanced. Phase A includes a full visual redesign of the Lab (not a deferred polish pass).
_Avoid_: Money desk (as the only framing), Arena-as-only-hero, inventing Strategy edges where no model exists, incremental restyle of the old stacked IA

**Signal** (narrow):
A Sentinel market-quality alert bound to an observation tick (e.g. sharp_move, outlier_print). Not a synonym for Observation or Analysis.
_Avoid_: using “signal” for Tempo·Odds·Hybrid charts or desk fair

## Run provenance

- **LIVE** — normalized observations received directly from TxLINE mainnet level 12 during the active fixture.
- **RECORDED LIVE** — an immutable replay of persisted observations originally received from TxLINE. It is never represented as a current live connection.
- **SIMULATION** — deterministic generated match and market data. It is never represented as TxLINE data.

## Execution

- **SHADOW** — hypothetical positions generated from real TxLINE observations. No wager or external order is submitted.
- **SIMULATED** — hypothetical positions generated from deterministic simulation data.
- **Stand-down** — an explicit agent decision not to quote or trade because one or more readiness conditions are false.
- **Robust reference** — a filtered, smoothed reference probability derived only from recent TxLINE consensus observations.

## Proofs

- **TxLINE settlement proof** — validation of an observed final TxLINE score record against the TxLINE mainnet daily score root.
- **Agent ledger anchor** — Sweeper's independent timestamp of its deterministic ledger root using a Solana devnet memo transaction.
- **Proof receipt** — the persisted outcome and evidence for one verification attempt.

## Sessions and recordings

- **Session** — one fixture run with fixed configuration, artifact, provenance, and deterministic ledger.
- **Recording** — the immutable persisted observations and proof receipts of a session that can be replayed publicly.
