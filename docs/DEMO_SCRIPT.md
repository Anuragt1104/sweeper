# Tonight demo script

## Before sharing

1. Rotate the token pasted in chat and store only its replacement in `.env.local`.
2. Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run preflight:live`.
3. Start `npm run dev:live`, then `npm run share:live` in a second terminal.
4. Open `/api/health` and the public URL from a second device. Confirm both score/odds streams are accepted and the UI says LIVE. A healthy feed with no 1X2 must say agents are standing down.

## Act I — real live truth

Open the public console. Lead with the four-card Horizon Deck. Explain the fixed ten-match-minute close, THESIS versus ACTION, visible kill criteria, empirical support, and why the odds-swing chip is separate from settlement. Point at the real fixture ID and feed-health details.

Scroll below to show the retained Sentinel, odds board, audit proofs, five-agent arena, paper PnL, and proof-gated settlement.

## Act II — guaranteed money shot

Open:

```text
/?demo=act2
```

With the operator key already in session storage, this fast-forwards deterministic Argentina–Poland to 39.5′. At 41′ the Argentina goal shatters/manifests the publication, appears in the Collapse Ticker, updates Brier/hit metrics, and opens the next Horizon. The header remains REPLAY, never LIVE.

Open the JSON inspector and `GET /api/horizon` to show parity. Click a `horizon_collapse` ledger row to verify its Merkle inclusion proof and triggering tick link.

## Outage story

If TxLINE is unavailable, leave the live state visibly OFFLINE/DEGRADED. Switch deliberately to the replay URL; do not claim it is live and do not let the server substitute it automatically.
