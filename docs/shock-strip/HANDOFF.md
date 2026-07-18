# Handoff — Shock Strip (post Tempo · Odds · Hybrid)

**For:** next agent iterating strategy quality  
**Date:** 2026-07-18  
**Repo:** `Anuragt1104/sweeper`  
**Status:** Three named strategies are **shipped**. Improve inside them; do **not** invent a fourth.

---

## Read first

| Artifact | Path |
|----------|------|
| Spec | `docs/shock-strip/SPEC.md` |
| Ideation baseline | `docs/shock-strip/IDEATION.md` |
| Architecture (as shipped) | `docs/shock-strip/ARCHITECTURE.md` |
| Horizon rules | `docs/HORIZON_RULES.md` |

---

## Decisions already made

1. Exactly **three** strategies: **Tempo**, **Odds**, **Hybrid**.
2. Primary test seam: **ShockStripAssembler → ShockStripState**.
3. Horizon settlement stays TxLINE-falsifiable; enrichment is UI/tempo only.
4. Odds multi-view (default `next_score`) lives **inside** Odds.
5. Blend/severity numbers are tunable (`lib/tempo/hybrid.ts`, `severity.ts`).
6. Free-kick XY / ball tracking out of scope.

## Current code state (shipped)

- `lib/tempo/` — three-track types, assembler, odds views, hybrid blend, denser sim, API-Football mapping
- `components/shock-strip.tsx` — Tempo / Odds / Hybrid bands + Odds chips
- Wired into `SweeperEngine` (Horizon side-inputs: `current`, `oddsSwing`, `lastCollapse`)
- `test/tempo.test.ts` covers three tracks, unavailable odds, hybrid collapses

## What to do next (optional quality work)

1. Tune Hybrid windows/weights for clearer pitch↔book agreement.
2. Improve Odds swing visualization / windowing.
3. Map additional API-Football stats when present (still no Horizon settlement).
4. Keep Horizon tests green; extend assembler seam tests only.

## Explicit non-goals

- Fourth strategy track
- Feeding shots/fouls into Horizon settlement
- Locking severity/blend numbers as immutable product law
- Committing secrets

## Done when (checklist — complete)

- [x] UI shows three labeled bands: Tempo, Odds, Hybrid
- [x] Odds view switcher works with next_score + 1X2 (+ others when present)
- [x] Tempo shows TxLINE events + denser enrichment in sim
- [x] Hybrid shows thesis trajectory + collapses
- [x] Assembler tests cover the three tracks; Horizon settlement tests unchanged
- [x] Docs match shipped behavior
