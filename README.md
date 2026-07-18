# Sweeper × N+1 Machine

Sweeper is a Horizon-first TxLINE trading console. It continuously publishes a fixed ten-match-minute forecast for the next material soccer event while retaining Sentinel, five trading agents, shadow/paper execution, Merkle audit proofs, official mainnet settlement verification, and replay.

Live means TxLINE mainnet level 12 only. Simulation and recorded-live replay are always labelled. Live execution is shadow-only (no real venue fills).

## Production

- **GitHub:** https://github.com/Anuragt1104/sweeper
- **Railway (judge target):** https://sweeper-production-0ef9.up.railway.app
- **Access deadline:** July 19, 2026 23:59 UTC

## Shock Strip (in progress)

Spatial memory under the Horizon Deck — three named strategies **Tempo · Odds · Hybrid**. Spec, ideation, and handoff:

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

Deterministic demo:

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
        ├─ Sentinel + five agents
        ├─ readiness → shadow / simulated exchange
        └─ Merkle ledger → validateStatV2 settlement
            ▼
     EngineState → SSE → spectator UI
```

Details: [architecture](docs/ARCHITECTURE.md), [TxLINE endpoints](docs/TXLINE_ENDPOINTS.md), [submission](SUBMISSION.md).
