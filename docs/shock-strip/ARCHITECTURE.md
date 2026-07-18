# Shock Strip — Architecture notes

## Where it sits

```text
TxLINE scores SSE ──┐
                    ├──► MarketTick / LiveTickAssembler
TxLINE odds SSE  ───┘            │
                                 ▼
                          SweeperEngine.ingest
                     ┌───────────┼──────────────┐
                     ▼           ▼              ▼
                 Horizon     Sentinel        strip assemble
                 Machine     + agents        (after Horizon)
                     │                           │
                     └──────────► EngineState ◄──┘
                                      │
                                      ▼
                              SSE → Shock Strip UI
```

Enrichment (sim Tempo synthesizer or API-Football poller) attaches optional tempo snapshots. Live poller is owned by the session manager; it must never call Horizon APIs.

## Contracts

- **In:** normalized ticks + Horizon snapshot fields needed for Hybrid (thesis, probabilities, last collapse, optional odds swing).
- **Out:** `shockStrip` on engine state (SSE-safe, bounded history).
- **Forbidden:** strip events → Horizon collapse / agent decisions / settlement receipts.

## Test seam

Highest seam: assembler ingest → serializable strip state. Prefer this over UI or HTTP.

## Prototype vs target

Current tree includes a dual-track prototype (`lib/tempo/*`, `components/shock-strip.tsx`). Target product is three named tracks per `SPEC.md` / `IDEATION.md`. Evolve the prototype; do not preserve dual-track naming as the long-term contract.
