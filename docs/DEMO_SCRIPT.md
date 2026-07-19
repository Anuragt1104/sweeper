# Strategy Lab demo script

## Before sharing

1. Rotate any token shared outside the password manager and store only its replacement in `.env.local` or the deployment secret store.
2. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run preflight:live`.
3. Open `/api/health` and the public URL from a second device. Confirm both upstream streams are accepted before calling the session LIVE.
4. Use 1440×900 for the judge walkthrough. Keep Advanced closed at the start.

## Act I — the ten-second mental model

Open the Strategy Lab on Match 1X2 and say:

> “Sweeper keeps three things separate. The left rail is what arrived. The middle is what our desk inferred. The right is what every strategy will actually do on this contract.”

Point in this order:

1. **Observation** — score/book/events, raw enrichment counts, and exact feed acceptance. No desk prediction is mixed into this rail.
2. **Analysis** — observed 1X2 against desk-v1 fair. The two markers and signed gap make the claimed edge auditable.
3. **Strategy** — all seven stances are visible at once. Every trade, quote, stand-down, ineligible contract, and absent model has a reason.
4. **Provenance** — Live/Replay plus SHADOW/SIMULATED remain visible in the command bar and masthead.

Select Corners O/U to show the `NO PRICING MODEL` boundary, then return to Match 1X2. Explain that eligibility never grants fill authority.

## Act II — deterministic money shot

Open:

```text
/?demo=act2&contract=match_1x2
```

No operator key is required. The masthead says REPLAY and the command bar says SIMULATED. Watch the three rails in order around the known 41′ Argentina goal:

1. Observation records the score/event shock and the observed book reprices.
2. Analysis moves the desk-versus-book gap and manifests the 400ms Horizon collapse.
3. Strategy stances/quotes change; the compact Arena updates fills and PnL.

Then select Next score. Horizon becomes the Analysis model while Strategy rows honestly say `NO MODEL` or `INELIGIBLE` where no direct fill path exists.

Open `?advanced=proofs` to show the Merkle ledger, click a Horizon collapse for its inclusion proof, then close the drawer with Escape. The full Causal trace and legacy Shock Strip remain available in Advanced without competing with the primary story.

## Outage story

If TxLINE is unavailable, leave Live visibly OFFLINE or DEGRADED. Switch deliberately to Demo; never claim replay is current live data and never let the server silently substitute simulation.
