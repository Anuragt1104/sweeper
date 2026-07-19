# Sweeper winning demo — 4:45 recording script

Aligned to the current Strategy Lab (landing → Observe / Interpret / Act, **11** strategies, Act II director).

## Recording contract

- Capture at 1440×900, export 1080p/30fps, and edit eight short segments.
- Speak at 135–145 words per minute. Keep music absent or nearly inaudible.
- Use a fresh spectator browser. Never expose the operator key or TxLINE credential.
- Start at bare `/` (landing). Strategy Lab opens only when a lab key is present: `lab`, `demo`, `contract`, `advanced`, or `rail`.
- Live means hydrated score and odds snapshots plus both accepted upstream streams. An open browser EventSource is only `VIEWER STREAM OPEN`.
- Act II is a deterministic simulation. Keep it labelled `DEMO · deterministic`, `REPLAY`, and `SIMULATED` (not `SHADOW` — that badge is for live shadow execution).

## Judge deep links (keep bookmarked)

```text
/?lab=live
/?demo=act2&contract=match_1x2
/?demo=act2&present=judge&scene=overview&contract=match_1x2
/?demo=act2&present=judge&scene=pre_goal&contract=match_1x2
/?demo=act2&present=judge&scene=post_goal&contract=match_1x2
/?demo=act2&present=judge&scene=full_time&contract=match_1x2
/?demo=act2&present=judge&scene=post_goal&contract=match_1x2&advanced=evidence&strategy=collapse_fade
```

Director hotkeys (only when `present=judge`): `1` overview · `2` pre_goal · `3` post_goal · `4` full_time · `Space` freeze/resume.

## 0:00–0:18 — Landing cold open

**Visual:** Bare `/` landing for 8–12 seconds (brand, Observe → Interpret → Act strip, 11 named strategies), then click **Enter live desk** (`/?lab=live`).

> “Most sports agents show you a pick. They do not show what they saw, why they trusted it, why they traded, or whether the decision can be audited. Sweeper solves that trust problem.”

Overlay: `VERIFIABLE DATA → VERIFIABLE DECISIONS`

## 0:18–0:45 — TxLINE autonomous Watchtower

**Visual:** Live Strategy Lab with no engine snapshot (Watchtower waiting state).

> “TxLINE streams normalized World Cup scores and consensus odds from mainnet. Sweeper watches the schedule autonomously, hydrates both snapshots, accepts the score and odds streams, and only then declares a fixture live. There is no active fixture now, so it says waiting. It never replaces a failed live feed with a simulation.”

Point to process, database, supervisor, credentials-present, next fixture, viewer stream, and upstream state.

Click **Demo** (or open `/?demo=act2&contract=match_1x2`):

> “Because judging happens outside the match window, I’m switching explicitly to our deterministic Act II simulation. It remains labelled REPLAY and SIMULATED everywhere.”

## 0:45–1:25 — The ten-second mental model

Open `/?demo=act2&present=judge&scene=overview&contract=match_1x2`.

> “Sweeper keeps three rails separate. Observe is only what arrived: score, book, events, timestamps, and raw enrichment. Interpret is what our desk computes: fair value, regime, quality, and Horizon. Act is the session scoreboard plus what each of eleven policies will do on this contract.”

Sweep left → right once. Optionally expand a rail (**Expand**) to show the deeper drawer, then Escape back.

Select **Corners O/U**:

> “This line can appear as SIGNAL ONLY. Sweeper has no defensible pricing model for it, so Interpret says NO PRICING MODEL and strategies stay observe-only — no fill authority. Knowing when not to claim an edge is part of the product.”

Return to **Match 1X2** (MODEL / fillable when desk fair is ready).

## 1:25–2:45 — Act II money shot

Press `2` or open `/?demo=act2&present=judge&scene=pre_goal&contract=match_1x2`. Do not move the cursor while the scene plays from 39.5′ to 42′.

> “Before the goal, Horizon asks a narrower N-plus-one question: what is the first material event in the next ten match minutes—home goal, away goal, card, or quiet? The window has a fixed close; probabilities refresh without moving the target.”

> “Now Argentina score. Observe records the sequence-ordered goal and the book reprices. Interpret collapses the active Horizon as a surprise because its settling probability was below fifteen percent. The regime becomes chaotic.”

> “Every strategy reacts independently on the same tick. Collapse Fade trades the Horizon surprise. Guarded Momentum can stand down when Sentinel or the chaotic-regime gate rejects the chase. Value, Intensity Burst, and Kelly often gate on path volatility while Regime Switcher flattens in chaos. Simulated fills and PnL update without a human decision.”

> “This is a controlled comparison: same tick, same exchange, different policy. The session scoreboard shows Intensity, Kelly, and Regime lifts versus Value — whether the quality and meta layers added value on this replay.”

## 2:45–3:25 — Decision Receipt

Select **Collapse Fade**, choose **Open Decision Receipt** (or open the evidence deep link above). Prefer **Latest fill** when a fill exists; otherwise **Latest decision**. Click **Verify decision proof**.

> “A PnL number is not an explanation. This Decision Receipt reconstructs one complete chain: the observation sequence and tick hash, the desk state, the strategy rule and active gates, the simulated fill, and the resulting ledger record.”

> “The decision record produces an inclusion proof against the Sweeper session root. It verifies offline as VERIFIED OFFLINE PATH. This proves what the system observed and decided was not altered afterward.”

Keep `SWEEPER DECISION PROOF` and `TXLINE SETTLEMENT GUARD` visible together. On Act II the settlement lane stays **SIMULATED** / not final — deliberately separate from the decision proof.

## 3:25–3:55 — Scientific evidence

Show Advanced → **Horizon** metrics, then the compact Act **Session scoreboard** (family filters All / Core / Event / Meta; timeframe 15m is fine).

> “Sweeper evaluates more than profit. Horizon tracks hit rates, surprises, thesis deaths, Brier score, and collapse latency. The scoreboard tracks equity, trades, and drawdown for all eleven strategies. That turns a single demo moment into a repeatable strategy experiment.”

Do not claim simulated PnL predicts future performance.

## 3:55–4:25 — Architecture and production evidence

Stay on Evidence system flow (or Advanced → Proofs briefly).

> “The implementation has one deterministic seam: every live, recorded, or simulated adapter produces the same normalized MarketTick for SweeperEngine.ingest. From there, Horizon, Sentinel, strategies, shadow execution, portfolios, and the ledger run without UI involvement.”

> “Production handles JWT renewal, 403 configuration failures, Last-Event-ID reconnects, sequence gaps, bounded recovery, spectator access, and operator-key protection.”

## 4:25–4:45 — Settlement guardrail and close

Press `4` for the clearly simulated full-time scene.

> “Decision proof and outcome proof are different. This simulation has a simulated settlement receipt. In live mode, Sweeper holds settlement until a real game_finalised sequence is validated through TxLINE’s mainnet validateStatV2 path. No final proof means no release.”

> “TxLINE supplies verifiable sports truth. Sweeper turns it into autonomous, defensible action.”

End card: production URL, repository, and `SHADOW EXECUTION · MAINNET DATA · PROOF-GATED SETTLEMENT`.

## What not to say on camera

- Do not name **Naive Momentum** or **Market Maker** — removed from the live roster.
- Do not say “seven strategies” or “Guarded-minus-Naive.”
- Do not open Operator or type the control key.
- Do not call Act II `SHADOW` or claim it is recorded TxLINE live (tempo enrichment is recorded WC2022 counts; score/odds remain deterministic sim).

## Final pre-record gate

Run lint, typecheck, tests, build, security audit, migration, the 6,000-tick rehearsal, and production checks. Rotate any TxLINE credential ever shared in chat before re-enabling live supervision.
