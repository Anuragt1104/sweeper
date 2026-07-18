# Shock Strip

This folder is the durable home for Shock Strip ideation, spec, and handoff for Sweeper × N+1.

| Doc | Role |
|-----|------|
| [SPEC.md](./SPEC.md) | Product spec (three strategies) |
| [IDEATION.md](./IDEATION.md) | Tunable baseline formulas |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Module map as shipped |
| [HANDOFF.md](./HANDOFF.md) | Next-agent notes |

**Shipped contract:** Tempo · Odds · Hybrid as three named strategies. Enrichment never settles Horizon.

**UI (Agent Desk first):** Agent Arena + Causal rail are the console hero. Compact Horizon and Tempo · Odds · Hybrid charts are the **shared signal layer agents read** (Hybrid Thesis trades Horizon + Hybrid). Hybrid forecast still extends as a dotted path through the open Horizon window.

**Act II tempo:** Demo uses `data/act2-tempo.json` — minute-aligned recorded enrichment from FIFA WC2022 Poland–Argentina (sides remapped to ARG home). Scoreline remains the deterministic sim; Tempo/Odds/Hybrid/`current.minute` share the raw match-minute axis. Horizon HTTP: `GET /api/horizon?demo=act2`.

**Per-bet lenses:** Each Odds view (Next score, O/U 2.5, 1X2, Corners, Swing) gets its own Tempo · Odds · Hybrid series (`shockStrip.strategies`). UI shows one graph per bet (or focus a single bet).
