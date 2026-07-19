# Sweeper winning demo — 4:45 recording script

## Recording contract

- Capture at 1440×900, export 1080p/30fps, and edit eight short segments.
- Speak at 135–145 words per minute. Keep music absent or nearly inaudible.
- Use a fresh spectator browser. Never expose the operator key or TxLINE credential.
- Live means hydrated score and odds snapshots plus both accepted upstream streams. An open browser EventSource is only `VIEWER STREAM OPEN`.
- Act II is a deterministic simulation. It must remain labelled `DEMO`, `REPLAY`, and `SIMULATED`.

## 0:00–0:18 — Human cold open

**Visual:** Presenter for 8–12 seconds, then Strategy Lab.

> “Most sports agents show you a pick. They do not show what they saw, why they trusted it, why they traded, or whether the decision can be audited. Sweeper solves that trust problem.”

Overlay: `VERIFIABLE DATA → VERIFIABLE DECISIONS`

## 0:18–0:45 — TxLINE autonomous Watchtower

**Visual:** Production Live with no engine snapshot.

> “TxLINE streams normalized World Cup scores and consensus odds from mainnet. Sweeper watches the schedule autonomously, hydrates both snapshots, accepts the score and odds streams, and only then declares a fixture live. There is no active fixture now, so it says waiting. It never replaces a failed live feed with a simulation.”

Point to process, database, supervisor, credentials-present, next fixture, viewer stream, and upstream state.

Switch deliberately to Demo:

> “Because judging happens outside the match window, I’m switching explicitly to our deterministic Act II simulation. It remains labelled REPLAY and SIMULATED everywhere.”

## 0:45–1:25 — The ten-second mental model

Open `/?demo=act2&present=judge&scene=overview&contract=match_1x2`.

> “Sweeper keeps three layers separate. Observation is only what arrived: score, book, events, timestamps, and raw enrichment. Analysis is what our desk computes: fair value, regime, quality, and Horizon. Strategy is what each of seven policies will actually do on this contract.”

Move left to right once. Select Corners O/U:

> “This line exists, but Sweeper has no defensible pricing model for it, so it says NO PRICING MODEL and grants no fill authority. Knowing when not to claim an edge is part of the product.”

Return to Match 1X2.

## 1:25–2:45 — Act II money shot

Press `2` or open `/?demo=act2&present=judge&scene=pre_goal&contract=match_1x2`. Do not move the cursor while the scene plays from 39.5′ to 42′.

> “Before the goal, Horizon asks a narrower N-plus-one question: what is the first material event in the next ten match minutes—home goal, away goal, card, or quiet? The window has a fixed close; probabilities refresh without moving the target.”

> “Now Argentina score. Observation records the sequence-ordered goal and the book reprices. Analysis collapses the active Horizon as a surprise because its settling probability was below fifteen percent. The regime becomes chaotic.”

> “Every strategy reacts independently. Naive Momentum follows the move. Guarded Momentum can stand down because Sentinel and the regime gate reject the same market state. The Market Maker requotes. Collapse Fade responds to the Horizon transition. Shadow fills and PnL update without a human decision.”

> “This is a controlled comparison: same tick, same exchange, different policy. The Guarded-minus-Naive delta measures whether the quality layer added value.”

## 2:45–3:25 — Decision Receipt

Open Collapse Fade, choose **Open Decision Receipt**, then verify the proof.

> “A PnL number is not an explanation. This Decision Receipt reconstructs one complete chain: the observation sequence and tick hash, the desk state, the strategy rule and active gates, the shadow fill, and the resulting ledger record.”

> “The decision record produces an inclusion proof against the Sweeper session root. It verifies offline. This proves what the system observed and decided was not altered afterward.”

Keep `SWEEPER DECISION PROOF` and `TXLINE SETTLEMENT GUARD` visible together.

## 3:25–3:55 — Scientific evidence

Show Horizon metrics and compact Arena.

> “Sweeper evaluates more than profit. Horizon tracks hit rates, surprises, thesis deaths, Brier score, and collapse latency. The Arena tracks equity, trades, and drawdown for all seven strategies. That turns a single demo moment into a repeatable strategy experiment.”

Do not claim simulated PnL predicts future performance.

## 3:55–4:25 — Architecture and production evidence

Show the Evidence system flow.

> “The implementation has one deterministic seam: every live, recorded, or simulated adapter produces the same normalized MarketTick for SweeperEngine.ingest. From there, Horizon, Sentinel, strategies, shadow execution, portfolios, and the ledger run without UI involvement.”

> “Production handles JWT renewal, 403 configuration failures, Last-Event-ID reconnects, sequence gaps, bounded recovery, spectator access, and operator-key protection.”

## 4:25–4:45 — Settlement guardrail and close

Press `4` for the clearly simulated final scene.

> “Decision proof and outcome proof are different. This simulation has a simulated settlement receipt. In live mode, Sweeper holds settlement until a real game_finalised sequence is validated through TxLINE’s mainnet validateStatV2 path. No final proof means no release.”

> “TxLINE supplies verifiable sports truth. Sweeper turns it into autonomous, defensible action.”

End card: production URL, repository, and `SHADOW EXECUTION · MAINNET DATA · PROOF-GATED SETTLEMENT`.

## Final pre-record gate

Run lint, typecheck, tests, build, security audit, migration, the 6,000-tick rehearsal, and production checks. Rotate any TxLINE credential ever shared in chat before re-enabling live supervision.
