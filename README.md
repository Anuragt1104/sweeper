# Sweeper × N+1 Machine

Sweeper is an **autonomous eleven-strategy trading lab** on TxLINE. It makes the complete decision chain visible: source facts become desk analysis, analysis becomes a contract-specific Strategy stance, and every shadow fill remains Merkle-auditable.

**Hero surface:** landing page first, then one contract-focused Strategy Lab with three rails labelled **Observe → Interpret → Act** (domain: Observation → Analysis → Strategy). Arena is the compact session scoreboard inside Act; Evidence, Markets, Sentinel, Horizon, Proofs, Operator, and the legacy Research strip live in Advanced. Live means TxLINE mainnet level 12 only. Replay/simulation are always labelled, and all execution is shadow/simulated—never a real venue order.

## Production

- **GitHub:** https://github.com/Anuragt1104/sweeper
- **Railway (judge target):** https://sweeper-production-0ef9.up.railway.app
- **Access deadline:** July 19, 2026 23:59 UTC

## Strategy Lab

The five shareable contract views are Match 1X2, O/U 2.5, Next score, Corners O/U, and Swing. Selecting one updates all three rails atomically and persists as `?contract=<id>`. Coverage badges: `MODEL` · `BOOK ONLY` · `SIGNAL ONLY` · `NO MARKET`.

- **Observe** shows only received score/book/events, raw tempo enrichment counts, and feed truth.
- **Interpret** shows desk fair, Horizon, quality/regime/readiness, path charts (5m/15m/30m/FULL), and an explicit `NO PRICING MODEL` boundary where appropriate.
- **Act** shows the compact session scoreboard (Intensity / Kelly / Regime lifts vs Value) plus live stances with exact `TRADE`, `QUOTE`, `FLAT`, `STAND DOWN`, `INELIGIBLE`, or `NO MODEL` language.

Strategy names, colors, display order, design metadata, eligibility, and fill authority come from one registry: `lib/strategy-lab/designs.ts`. Operator cards: [`docs/strategy-lab/ROSTER.md`](./docs/strategy-lab/ROSTER.md).

### Strategy roster

Roster (same tick, competing PnL) — eleven policies:

1. Value — desk fair versus observed 1X2
2. Guarded Momentum — Sentinel-confirmed sharp moves only
3. Mean Reversion — fades outlier prints
4. Intensity Burst — desk fair only inside MatchIntensity / tempo-accel windows
5. Hybrid Thesis — Horizon + Hybrid/path features into executable 1X2
6. Collapse Fade — path-aware fade after Horizon SURPRISE / THESIS DEAD
7. Goal Overreaction — fades post-goal book overshoot after a cool-off
8. Shock Fade — fades red-card / comeback panic toward desk fair
9. Stale Reopen — fades misprints after suspend→reopen or stale-clear
10. Regime Switcher — calm Value / normal Guarded / chaotic flatten
11. Kelly Value — Value edge with fractional Kelly + drawdown throttle

Agents receive a **desk-v1 pricing model** (score-state Poisson ⊕ tempo/odds hybrid tilt ⊕ Horizon-mapped 1X2 tilt — never raw Horizon class P as 1X2 fair). Path features use last-obs-before lookbacks and time-normalized vol. Live tempo polls recompute the same feature store agents read. Portfolios mark to **observed** prices (not privileged sim reference).

Session scorecard surfaces Intensity / Kelly / Regime lifts versus Value, event-specialist PnL, and warm-start tick counts.

Eval across seeds:

```bash
npm run eval:agents
```

## Decision Evidence and Advanced research

The Evidence workspace reconstructs one receipt from observation tick hash → desk snapshot → strategy rule/gates → shadow fill/PnL → Sweeper Merkle inclusion proof. It renders the `SWEEPER DECISION PROOF` separately from the `TXLINE SETTLEMENT GUARD`; neither lane is allowed to imply the other.

Live ledgers retain the latest 256 full records in process plus all compact leaf hashes. Complete records are archived in Postgres, and recovery reads ticks in pages of 100. Simulation/replay retains complete in-memory records for deterministic research.

The legacy Shock Strip remains an Advanced research view.

## Strategy lenses

Act-rail session scoreboard + family filters for the live Strategy roster: equity overlay and per-strategy design parameters (reads, stand-downs, fillable contracts). The Tempo · Odds · Hybrid Shock Strip remains Advanced → Research only.

Historical strip assembler docs (engine still uses tempo/odds series for Observation/Analysis):

- [`docs/shock-strip/README.md`](./docs/shock-strip/README.md)
- [`docs/shock-strip/HANDOFF.md`](./docs/shock-strip/HANDOFF.md)

Fixture selection is schedule-driven. Completed fixtures are never described as upcoming; the Watchtower reports the actual next eligible fixture or `No active covered fixture`.

## Run locally in simulation

```bash
cp .env.example .env.local
# Set SWEEPER_CONTROL_KEY and TXLINE_MODE=simulation
npm install
npm run dev
```

Open `http://localhost:3000`. Public viewers need no key. Operators enter the shared key only for mutations.

Deterministic demo (three-rail goal shock ~41′). Bare `/` is the landing page; Lab requires a lab key:

```text
http://localhost:3000/?demo=act2&contract=match_1x2
```

Judge-directed scenes (normal public Demo has no presenter controls):

```text
/?demo=act2&present=judge&scene=overview&contract=match_1x2
/?demo=act2&present=judge&scene=pre_goal&contract=match_1x2
/?demo=act2&present=judge&scene=post_goal&contract=match_1x2
/?demo=act2&present=judge&scene=full_time&contract=match_1x2
```

Recording script: [`docs/DEMO_SCRIPT.md`](./docs/DEMO_SCRIPT.md). Judge evidence map: [`docs/JUDGE_EVIDENCE.md`](./docs/JUDGE_EVIDENCE.md).
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
- `GET /api/evidence/decision?source=live|demo&sessionId=...&strategy=...&contract=...&selector=...`

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
        ├─ Sentinel + six strategies
        ├─ readiness → shadow / simulated exchange
        └─ bounded Merkle ledger → Postgres archive → validateStatV2 guard
            ▼
     EngineState + all-contract StrategyStances
            ▼
 StrategyLabProjection → EngineStreamController → spectator UI
```

Details: [architecture](docs/ARCHITECTURE.md), [TxLINE endpoints](docs/TXLINE_ENDPOINTS.md), [submission](SUBMISSION.md).
