# Sweeper × N+1 Machine

Sweeper is an **autonomous seven-strategy trading lab** on TxLINE. It makes the complete decision chain visible: source facts become desk analysis, analysis becomes a contract-specific Strategy stance, and every shadow fill remains Merkle-auditable.

**Hero surface:** one contract-focused Strategy Lab with three rails: **Observation → Analysis → Strategy**. Arena is the compact session scoreboard inside Strategy; Causal, full markets, Sentinel, Horizon internals, proofs, operator controls, and the legacy research strip live in Advanced. Live means TxLINE mainnet level 12 only. Replay/simulation are always labelled, and all execution is shadow/simulated—never a real venue order.

## Production

- **GitHub:** https://github.com/Anuragt1104/sweeper
- **Railway (judge target):** https://sweeper-production-0ef9.up.railway.app
- **Access deadline:** July 19, 2026 23:59 UTC

## Strategy Lab

The five shareable contract views are Match 1X2, O/U 2.5, Next score, Corners O/U, and Swing. Selecting one updates all three rails atomically and persists as `?contract=<id>`.

- **Observation** shows only received score/book/events, raw tempo enrichment counts, and feed truth.
- **Analysis** shows desk fair, Horizon, quality/regime/readiness, and an explicit `NO PRICING MODEL` boundary where appropriate.
- **Strategy** shows seven live stances with exact `TRADE`, `QUOTE`, `FLAT`, `STAND DOWN`, `INELIGIBLE`, or `NO MODEL` language, followed by the compact Arena scoreboard.

Strategy names, colors, display order, design metadata, eligibility, and fill authority come from one registry: `lib/strategy-lab/designs.ts`.

### Strategy roster

Roster (same tick, competing PnL):

1. Value — desk fair versus observed 1X2
2. Naive Momentum — chases every large move  
3. Guarded Momentum — Sentinel-confirmed sharp moves only (A/B vs naive)  
4. Mean Reversion — fades outlier prints  
5. Market Maker — quotes around reference  
6. **Hybrid Thesis** — Horizon material call + Hybrid/path features when the book underprices it  
7. **Collapse Fade** — path-aware fade after Horizon SURPRISE  

Agents receive a **desk-v1 pricing model** (score-state Poisson ⊕ tempo/odds hybrid tilt ⊕ Horizon-mapped 1X2 tilt — never raw Horizon class P as 1X2 fair). Path features use last-obs-before lookbacks and time-normalized vol. Live tempo polls recompute the same feature store agents read. Portfolios mark to **observed** prices (not privileged sim reference).

Session scorecard surfaces Sentinel edge (guarded − naive), path regime, Hybrid Thesis / Collapse Fade PnL, and warm-start tick counts.

Eval across seeds:

```bash
npm run eval:agents
```

## Advanced research (legacy Shock Strip)

The minute-aligned Tempo · Odds · Hybrid strip remains an Advanced research view. These are analysis tracks, not the seven Strategy policies and not the primary product language. Spec and historical handoff:

- [`docs/shock-strip/README.md`](./docs/shock-strip/README.md)
- [`docs/shock-strip/HANDOFF.md`](./docs/shock-strip/HANDOFF.md)

Fixture supervisor queue:

1. France–England `18257865`
2. Spain–Argentina `18257739`

## Run locally in simulation

```bash
cp .env.example .env.local
# Set SWEEPER_CONTROL_KEY and TXLINE_MODE=simulation
npm install
npm run dev
```

Open `http://localhost:3000`. Public viewers need no key. Operators enter the shared key only for mutations.

Deterministic demo (three-rail goal shock ~41′):

```text
http://localhost:3000/?demo=act2
```

## Run TxLINE live locally

1. Copy `.env.example` → `.env.local`.
2. Set a **rotated** mainnet level-12 `TXLINE_API_TOKEN`.
3. Set `SWEEPER_CONTROL_KEY`, optional `DATABASE_URL`, and `TXLINE_WATCH_FIXTURE_IDS=18257865,18257739`.
4. Preflight:

```bash
npm run preflight:live -- --fixture auto
```

5. Start:

```bash
npm run start:live   # after npm run build
# or
npm run dev:live
```

## Horizon rules

- A Horizon opens for exactly ten match-minutes.
- Probabilities are empirical bucket counts with Laplace smoothing `α=1` and always sum to 1.
- THESIS is the maximum across `goal_home`, `goal_away`, `card`, `quiet`.
- ACTION equals a non-Quiet THESIS; when THESIS is Quiet, ACTION is the maximum material outcome.
- First sequence-ordered home goal / away goal / yellow / red settles the publication; otherwise Quiet at close.
- Winner probability &lt; 15% ⇒ SURPRISE; different winner ≥ 15% ⇒ THESIS DEAD.

See [Horizon rules](docs/HORIZON_RULES.md).

## Public APIs

Read endpoints are public and `no-store`:

- `GET /api/stream`, `/api/demo/act2/stream`, `/api/recordings`, `/api/recordings/{id}/stream`
- `GET /api/horizon`, `/api/fixtures/{id}/horizon`
- `GET /api/health`, `/api/health/live`, `/api/health/ready`
- `GET /api/session`, `/api/fixtures`, `/api/proof/{seq}`

Mutations require `X-Control-Key` and are rate-limited.

## Verification

```bash
npm test                 # unit/integration
npm run typecheck
npm run lint
npm run build
npm run test:e2e
npm run db:migrate       # needs DATABASE_URL
npm run preflight:live
npm run soak:live
```

## Architecture

```text
TxLINE SSE / recorded / simulation
            │ normalized MarketTick
            ▼
     EventStore (Postgres | memory)
            ▼
     SweeperEngine.ingest(tick)
        ├─ HorizonMachine
        ├─ Sentinel + seven strategies
        ├─ readiness → shadow / simulated exchange
        └─ Merkle ledger → validateStatV2 settlement
            ▼
     EngineState + all-contract StrategyStances
            ▼
 StrategyLabProjection → EngineStreamController → spectator UI
```

Details: [architecture](docs/ARCHITECTURE.md), [TxLINE endpoints](docs/TXLINE_ENDPOINTS.md), [submission](SUBMISSION.md).
