# Sweeper — Hackathon Submission

## Links

| Asset | URL |
| --- | --- |
| Repository | https://github.com/Anuragt1104/sweeper |
| Production (Railway) | https://sweeper-production-0ef9.up.railway.app |
| Vercel preview (not judge target) | https://sweeper-rose.vercel.app |

Access must remain reachable through **July 19, 2026 23:59 UTC**.

## What judges see (no operator key)

1. Open the Railway URL.
2. Confirm command-bar provenance (`LIVE`/`DEMO`) and **SHADOW**/`SIMULATED` execution.
3. Read the complete contract story above the fold: **Observation → Analysis → Strategy**. All seven stances explain trades, quotes, flat positions, stand-downs, ineligibility, and absent models.
4. Optional deep links:
   - `/?demo=act2` — full-match Act II demo (kickoff→FT · goal ~41′ · agents + Horizon collapse)
   - Recorded-live replay from `/api/recordings` when a session exists

## Live truthfulness

- Feed: TxLINE **mainnet level 12** only
- Fixture queue: France–England `18257865` → Spain–Argentina `18257739`
- Execution: **shadow / paper only** (no live venue orders)
- Pricing: robust TxLINE consensus reference (never silent simulation fallback on live)
- Settlement: official on-chain `validateStatV2` against program `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` (IDL v1.5.6)
- Optional Merkle audit-root anchor: Solana **devnet** only

## Operator notes (not required for judging)

Mutations use `SWEEPER_CONTROL_KEY` via `X-Control-Key`. Rate limit: 10/min/IP.

## Video script (60–90s)

1. **0–10s** — Open production; show fixture, provenance, upstream acceptance, and execution mode.
2. **10–30s** — Point left-to-right: received facts, desk fair versus book, then seven contract-specific stances.
3. **30–45s** — Select Corners to show the honest `NO PRICING MODEL` boundary; return to Match 1X2.
4. **45–65s** — Cut to `/?demo=act2&contract=match_1x2`; Argentina goal ~41′ → Observation shock → Horizon collapse → Strategy/Arena response.
5. **65–90s** — Open `?advanced=proofs`, verify a ledger record, then close with Escape.

Upload the recording to the hackathon portal; leave the public link here when available:

```text
VIDEO_URL=
```

## Screenshots checklist

Place under `submission/` (committed) once captured from Railway or local Demo:

- `submission/01-desk-arena.png` — complete three-rail Strategy Lab
- `submission/02-causal-fill.png` — Next score Analysis with explicit Strategy model boundaries
- `submission/03-horizon-collapse.png` — 41′ goal shock, collapse, stances, and PnL
- `submission/04-settlement-proof.png` — URL-linked Advanced proof workspace

## Release gates

- [x] Schema v2 + live/simulation seams
- [x] Postgres EventStore + fixture supervisor
- [x] Shadow live trading + readiness stand-downs
- [x] Official `validateStatV2` settlement verifier
- [x] Public SSE / health / rate limits / spectator UI
- [x] Docker + Railway config + CI
- [x] Railway one-replica deploy with managed Postgres (`https://sweeper-production-0ef9.up.railway.app`)
- [x] Strategy Lab hero + canonical seven-strategy stance registry + compact Arena scoreboard
- [x] Keyboard/mobile/accessibility pass + Advanced workspace + regenerated screenshots
- [ ] Rotated TxLINE token provisioned on Railway only (current deploy uses local token — rotate ASAP)
- [ ] Preflight + soak against production URL
- [ ] Video uploaded
- [x] Desk-first screenshots committed under `submission/`

## External blockers

1. **TxLINE token rotation** — treat any previously shared token as compromised; mint a fresh level-12 token and set `TXLINE_API_TOKEN` on Railway only.
2. **Funded Solana devnet key** — optional for audit-root anchoring (`SOLANA_ANCHOR_SECRET_KEY`).
3. **Video file upload** — record after production URL is live.
4. **Railway project naming** — free-plan project create was blocked; `sweeper` + Postgres were added under the existing `final-whistle-markets` Railway project as a separate service (does not overwrite `web`).
