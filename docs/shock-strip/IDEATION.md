# Shock Strip — Ideation baseline

**Status:** living baseline — not frozen product law  
**Constraint:** exactly three strategies — **Tempo**, **Odds**, **Hybrid**. Improve freely inside them; do not invent a fourth.

This document captures the discussion baseline used to start implementation. Severity weights, blend coefficients, marker sets, and Odds view details may be redesigned for clarity, demo impact, or signal quality.

---

## Why three strategies

| Strategy | Question it answers | Allowed inputs |
|----------|---------------------|----------------|
| **Tempo** | What is happening in the match / stats? | Match facts only (scores + enrichment). No prices. |
| **Odds** | What is the book pricing? | TxLINE odds only. No enrichment. No Horizon. |
| **Hybrid** | What does the machine believe, given both? | Tempo signals + Odds velocity + Horizon publication |

Odds “views” (next score, 1X2, etc.) are **lenses inside Odds**, not separate strategies.

---

## Tempo — richer markers (baseline)

### From TxLINE scores (always when present)

| Marker | Notes | Example base severity |
|--------|-------|------------------------|
| Goal | Counter delta | 1.00 |
| Red | Counter delta | 0.85 |
| Yellow | Counter delta | 0.45 |
| Corner | Counter delta | 0.22 |
| Kick-off / HT / FT | Phase transitions | 0.12–0.20 |

### From enrichment (sim or API-Football)

| Marker / series | Notes | Example base severity |
|-----------------|-------|------------------------|
| Shot | Diff total shots beyond SOT | 0.18 |
| Shot on target | Diff SOT | 0.30 |
| Foul | If provider exposes Fouls | 0.16 |
| Offside | If exposed | 0.14 |
| Attack | If exposed | 0.12 |
| Dangerous attack | If exposed | 0.24 |
| Possession shift | Series always; spike on large jump | ~0.20 |

**Cumulative curves (when data exists):** shots, SOT, corners, cards (Y+R), fouls; optional possession %.

**Sim:** synthesize enrichment deterministically from fixture seed so demos are dense.  
**Live:** map API-Football statistic type strings; missing types ≠ fabricated spikes.

**Hard rule:** enrichment never settles Horizon.

---

## Odds — multi-view (baseline)

Default view: **next_score** (short-term).

| View id | Market | Lines | Horizon feel |
|---------|--------|-------|--------------|
| `next_score` | `next_team_to_score` | home / none / away | Short |
| `ou_25` | `total_goals` O/U 2.5 | over / under | Medium |
| `match_1x2` | `match_result` | home / draw / away | Long |
| `corners_ou` | `total_corners` | over / under | Tempo-linked |
| `swing` | derived | favorite level + Δ over ~3′ | Very short heat |

Computation for listed markets is pass-through of implied probabilities already on the tick. Swing is derived from favorite of next_score (fallback 1X2). Missing market → view unavailable.

Improving this strategy may include better swing windows, additional TxLINE markets if they appear, or clearer de-margining display — still Odds-only inputs.

---

## Hybrid — prediction band (baseline)

Example (improvable) formulas:

```text
thesisProb     = horizon.current.probabilities[horizon.current.thesis]
tempoIntensity = f(recent Tempo markers in ~5′ window) → [0,1]
oddsVelocity   = min(1, |Δ short-term favorite| / 0.08) over ~3′
pressure       = 0.55 * tempoIntensity + 0.45 * oddsVelocity
```

Collapse markers on Hybrid only; surprise taller than routine / thesis-dead.

Improving Hybrid may change windows, weights, normalization, or which Odds series drives velocity — still must consume Tempo + Odds + Horizon, and must not change Horizon settlement rules.

---

## Naming

Always: **Tempo**, **Odds**, **Hybrid**.  
Never: top / middle / bottom as product names.

---

## Data reality check (TxLINE)

TxLINE soccer score stats documented in-repo: Goals, YellowCards, RedCards, Corners (+ phase, minute, odds).  
Shots/fouls/attacks/possession are enrichment, not TxLINE score keys.
