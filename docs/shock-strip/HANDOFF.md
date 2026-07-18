# Handoff — Shock Strip (ideation + implementation)

**For:** next agent continuing Sweeper Shock Strip work  
**Date:** 2026-07-18  
**Repo:** `projects/sweeper` (GitHub: `Anuragt1104/sweeper`)  
**Focus:** Evolve the strip into three named strategies (Tempo · Odds · Hybrid), improve those strategies, ship UI + tests. Do **not** invent a fourth strategy.

---

## Read first (do not duplicate)

| Artifact | Path |
|----------|------|
| Spec (tracker copy) | `.scratch/shock-strip/spec.md` |
| Spec (docs copy) | `docs/shock-strip/SPEC.md` |
| Ideation baseline | `docs/shock-strip/IDEATION.md` |
| Architecture | `docs/shock-strip/ARCHITECTURE.md` |
| Index | `docs/shock-strip/README.md` |
| Horizon rules | `docs/HORIZON_RULES.md` |
| TxLINE mapping | `docs/TXLINE_ENDPOINTS.md` |
| Console architecture | `docs/ARCHITECTURE.md` |

N+1 ADRs live in the sibling project `projects/n-plus-one-machine/docs/adr/` (catalog, first-material settlement, surprise/thesis-dead). Respect those for Horizon; this feature does not reopen them.

---

## Decisions already made

1. Exactly **three** strategies: **Tempo**, **Odds**, **Hybrid** (never “top/middle/bottom”).
2. Primary test seam: **ShockStripAssembler → ShockStripState** (operator confirmed).
3. Horizon settlement stays TxLINE-falsifiable; enrichment is UI/tempo only.
4. Odds multi-view (default next_score) lives **inside** Odds — not new strategies.
5. Example weights / blend formulas in ideation are a **baseline** — improve freely inside the three strategies.
6. Free-kick XY / ball tracking out of scope.

## Current code state (prototype)

Already in tree (dual-track prototype, not final three-track contract):

- `lib/tempo/` — types, severity, diff, sim shots, API-Football stub, strip assembler
- `components/shock-strip.tsx` — dual-band UI
- Wired into `SweeperEngine` / `EngineState.shockStrip` / live manager poller hook
- `test/tempo.test.ts`
- `.env.example` documents `API_FOOTBALL_KEY`

**Gap vs spec:** rename/reshape to Tempo · Odds · Hybrid; expand Tempo markers; Odds multi-view switcher; Hybrid thesisProb + pressure + collapses; update UI + tests.

## What to do next

1. Evolve types/assembler to three named tracks per `SPEC.md`.
2. Expand Tempo markers/series (ideation table); keep weights tunable.
3. Record all Odds views each tick; UI chips to switch (default `next_score`).
4. Hybrid: thesis line + improvable pressure blend + collapse markers.
5. Keep Horizon tests green; extend `test/tempo.test.ts` at the assembler seam.
6. Optionally improve strategy quality (windows, normalization, which markers count as intensity) without adding strategy types.

## Explicit non-goals for this handoff

- Fourth strategy track
- Feeding shots/fouls into Horizon settlement
- Locking severity/blend numbers as immutable product law
- Committing secrets

## Suggested skills

- `/implement` — once executing the spec
- `/tdd` — assembler seam tests first if expanding behavior
- `/prototype` — if trying alternate Hybrid/Odds visuals before committing
- `/grilling` or `/grill-me` — only if changing the three-strategy frame (discouraged)
- `/review` or `/code-review` — after a substantial strip PR
- `/to-issues` — to break remaining work into `.scratch/shock-strip/issues/` tickets if needed

## Secrets / env (redacted)

- TxLINE and API-Football keys live only in local `.env.local` — never commit or paste into docs/issues.
- Control mutations still require `SWEEPER_CONTROL_KEY`.

## Done when

- UI shows three labeled bands: Tempo, Odds, Hybrid
- Odds view switcher works with at least next_score + 1X2 (+ others when present)
- Tempo shows TxLINE events + denser enrichment in sim
- Hybrid shows thesis trajectory + collapses
- Assembler tests cover the three tracks; Horizon settlement tests unchanged
- Docs in `docs/shock-strip/` still match shipped behavior (update ideation if strategies improve)
