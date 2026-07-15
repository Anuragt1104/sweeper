# TxLINE endpoints and field mapping

## Host and auth

Mainnet is `https://txline.txodds.com` (devnet is `https://txline-dev.txodds.com`). Every `/api/*` request carries a guest JWT and `X-Api-Token`. A single 401 renews the JWT and retries; a 403 is fatal configuration feedback.

The token is server-only. Error sanitization removes token-shaped strings and `/api/health` reports only whether credentials are present.

## Calls

| Purpose | Endpoint |
| --- | --- |
| Schedule | `GET /api/fixtures/snapshot?startEpochDay&competitionId` |
| Score hydration | `GET /api/scores/snapshot/{fixtureId}` |
| Odds hydration | `GET /api/odds/snapshot/{fixtureId}` |
| Score stream | `GET /api/scores/stream?fixtureId={fixtureId}` |
| Odds stream | `GET /api/odds/stream?fixtureId={fixtureId}` |
| Training | `GET /api/scores/historical/{fixtureId}` |
| Final proof | `GET /api/scores/stat-validation?...` |

SSE cursors use `id: <timestamp>:<index>`. Reconnect sends `Last-Event-ID`. Heartbeat events do not enter event derivation; Sweeper separately emits a 30-second combined tick from the latest accepted snapshots.

## Fixtures

Both lower- and Pascal-case variants are accepted. `Participant1IsHome` is preserved. Participant 1/2 ordering is never assumed to equal home/away ordering.

## Soccer score records

The parser requires real `fixtureId`, `seq`, and `ts`; reads `scoreSoccer.Participant1/Participant2` for cumulative totals and period breakdowns; and reads `dataSoccer` (`Goal`, `YellowCard`, `RedCard`, `Minutes`, `Participant`) for material actions.

Supported soccer states are `NS`, `H1`, `HT`, `H2`, `F`, `WET`, `ET1`, `HTET`, `ET2`, `FET`, `WPE`, `PE`, `FPE`, `I`, `A`, `C`, `TXCC`, `TXCS`, `P`, and `END`. `action=game_finalised` is terminal.

If `scoreSoccer` is sparse, documented stat-map totals are accepted: participant-1/2 goals, yellow, red, and corners. Only home/away goals and yellow/red cards are Horizon material events.

## Odds

Each record supplies `SuperOddsType`, `MarketPeriod`, `MarketParameters`, `PriceNames`, `Prices`, and optional `Pct`. The adapter keeps the freshest record per returned market line, de-margins probabilities, maps participant 1/2 to actual home/away, and retains unsupported markets as `txline:<slug>` instead of discarding them.

A tradeable full-match 1X2 must contain positive home, draw, and away selections. If it is absent, the feed can still be healthy but the odds-swing calculation and agents visibly stand down.
