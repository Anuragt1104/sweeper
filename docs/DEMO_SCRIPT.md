# Tonight demo script

## Before sharing

1. Rotate the token pasted in chat and store only its replacement in `.env.local`.
2. Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run preflight:live`.
3. Start `npm run dev:live`, then `npm run share:live` in a second terminal.
4. Open `/api/health` and the public URL from a second device. Confirm both score/odds streams are accepted and the UI says LIVE. A healthy feed with no 1X2 must say agents are standing down.

## Act I — live Agent Desk

Open the public console. Lead with **Agent Arena**: seven strategies, path sparklines / regime chip, leader chip, Sentinel edge (Guarded − Naive), selected agent rationale / driving inputs (Horizon thesis, Hybrid, path returns, Sentinel).

Point at the **Causal rail**: tick → Sentinel → decision → shadow fill → Horizon → leader PnL, with Merkle root.

Then show compact Horizon (THESIS/ACTION) and Shared signals (Tempo · Odds · Hybrid) as the inputs agents read.

Open Advanced for Odds board, Sentinel feed, click-to-verify audit proofs, and settlement.

## Act II — guaranteed money shot

Open:

```text
/?demo=act2
```

No operator key required. Stream runs the **full match** (kickoff → FT) with adaptive pacing — brisk until the known goal window, slower around ~41′, then steady to full time. Tiny warm-start seeds path features only. Watch:

1. Arena PnL / sparklines move  
2. Causal rail lights fills and decisions  
3. At ~41′ Argentina goal → Horizon collapse (SURPRISE / THESIS DEAD as applicable)  
4. Hybrid Thesis cooldown / stand-down rationale after collapse  

Header remains DEMO, never LIVE. Optional: Advanced → audit ledger → click `horizon_collapse` for inclusion proof. `GET /api/horizon?demo=act2` mirrors the stream.

## Outage story

If TxLINE is unavailable, leave the live state visibly OFFLINE/DEGRADED. Switch deliberately to `/?demo=act2`; do not claim it is live and do not let the server substitute it automatically.
