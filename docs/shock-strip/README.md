# Shock Strip

This folder is the archival home for Shock Strip ideation, spec, and handoff for Sweeper × N+1. The canonical product model is now [`CONTEXT.md`](../../CONTEXT.md): Observation → Analysis → Strategy.

| Doc | Role |
|-----|------|
| [SPEC.md](./SPEC.md) | Product spec (three strategies) |
| [IDEATION.md](./IDEATION.md) | Tunable baseline formulas |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Module map as shipped |
| [HANDOFF.md](./HANDOFF.md) | Next-agent notes |

**Current classification:** Tempo · Odds · Hybrid are legacy research tracks. They are not Strategies. Tempo enrichment is Observation; odds paths, Hybrid blends, and Horizon are Analysis. Enrichment never settles Horizon.

**UI:** The three-rail Strategy Lab is the hero. Arena is the compact Strategy scoreboard, Causal is Advanced, and the full Shock Strip is retained only under **Advanced → Research**.

**Act II tempo:** Demo uses `data/act2-tempo.json` — minute-aligned recorded enrichment from FIFA WC2022 Poland–Argentina (sides remapped to ARG home). Scoreline remains the deterministic sim; Tempo/Odds/Hybrid/`current.minute` share the raw match-minute axis. Horizon HTTP: `GET /api/horizon?demo=act2`.

**Per-contract lenses:** Each contract view (Next score, O/U 2.5, 1X2, Corners, Swing) retains a research series (`shockStrip.strategies`). The main Analysis rail renders only the selected contract and states when no pricing model exists.
