# Architecture — Shock Strip (as shipped)

```text
MarketTick (+ optional tick.tempo)
        │
        ▼
HorizonMachine.processTick   ← settlement authority (unchanged)
        │ side-inputs: current, oddsSwing, lastCollapse
        ▼
ShockStripAssembler.ingestTick
        ├─ Tempo  — TxLINE events + enrichment series/markers + status
        ├─ Odds   — TxLINE odds views map (next_score default)
        └─ Hybrid — thesisProb / pressure series + collapse markers
        │
        ▼
EngineState.shockStrip  → SSE → components/shock-strip.tsx
```

## Modules

| Path | Role |
|------|------|
| `lib/tempo/types.ts` | `ShockStripState` with `tempo` / `odds` / `hybrid` |
| `lib/tempo/strip.ts` | Assembler (primary test seam) |
| `lib/tempo/odds-views.ts` | Odds multi-view extraction |
| `lib/tempo/hybrid.ts` | Tunable pressure blend |
| `lib/tempo/severity.ts` | Marker severity helpers |
| `lib/tempo/diff.ts` | Cumulative → discrete enrichment events |
| `lib/tempo/sim.ts` | Deterministic dense sim enrichment |
| `lib/tempo/api-football.ts` | Optional live enrichment poller |
| `components/shock-strip.tsx` | Three labeled bands + Odds chips |

## Hard boundaries

- Strip never feeds Horizon settlement, agents, or proof.
- Odds inputs are TxLINE odds only; missing markets → unavailable.
- Live enrichment uses `API_FOOTBALL_KEY` server-side only.
- Engine order: Horizon first, then strip assemble.

## Schema note

`shockStrip` rides on `EngineState` under `schemaVersion: 2`. Shape is the three-track contract above (not the earlier dual-track `material`/`tempo` prototype).
