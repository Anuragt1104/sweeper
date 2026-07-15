# Architecture

## Deep modules and seams

The core seam is `SweeperEngine.ingest(tick)`. It contains all deterministic Horizon, Sentinel, agent, execution, portfolio, proof-ledger, and settlement behavior. Feed adapters only produce normalized `MarketTick` values:

- `MarketTickGenerator` drives deterministic simulation and replay.
- `LiveTickAssembler` hydrates TxLINE score/odds snapshots and combines two independently updating SSE streams plus 30-second heartbeats.
- `HorizonMachine.processTick` owns probability lookup, smoothing, badge locks, fixed-window lifecycle, collapse history, odds swing, and Machine Ledger metrics.

```text
TxLINE mainnet                 deterministic replay
fixtures/snapshots/SSE         MarketTickGenerator
          │                            │
          └──── feed adapters ─────────┘
                       │
              normalized MarketTick
                       │
             SweeperEngine.ingest
          ┌────────────┼───────────────────┐
     Horizon        Sentinel          proof ledger
                       │                   │
                agents/exchange       settlement
                       │                   │
                       └──── EngineState ──┘
                                  │
                      SSE + read-only APIs + UI
```

## Live acceptance

Live starts in `connecting`. It becomes `live` only after:

1. a real score snapshot is hydrated;
2. a real odds snapshot is hydrated;
3. the fixture-filtered score SSE request returns an accepted response; and
4. the fixture-filtered odds SSE request returns an accepted response.

A missing full-match 1X2 market does not fabricate a line: the Horizon remains visible, the odds-swing chip reports `missing_1x2`, and agents stand down. Sequence gaps, malformed frames, and reconnects mark the feed `degraded`. A 403 is fatal/offline. There is no live-to-simulation fallback.

## Event ordering

Score records are ordered by real TxLINE `seq`. Duplicate or older sequences are ignored. A gap is reported and produces no inferred material event. Contiguous records use `dataSoccer` event flags first, then positive cumulative deltas in goals/yellow/red. Counter decreases are corrections and never become reverse events.

The first material event within the current fixed Horizon collapses it. A transition record preserves the publication exactly as settled, and the next Horizon opens immediately.

## Proof chain

Every tick is a canonical SHA-256 Merkle leaf. Horizon open, refresh, and collapse records carry the triggering tick hash in `reactedToHash`, just like Sentinel signals, decisions, and fills. Full-time live settlement remains on hold until the final `game_finalised` sequence and TxLINE stat proof are validated. Horizon collapses do not depend on final settlement.

## Public/control split

The UI and public read APIs expose complete state without secrets. Session/replay mutations require a timing-safe comparison of `X-Control-Key`. The server never sends the configured key or TxLINE token to a client. The browser stores an operator-supplied key only in session storage.
