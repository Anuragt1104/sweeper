# Horizon rules and probability artifact

## Features

- Minute bands: `0–15`, `15–30`, `30–45`, `45–60`, `60–75`, `75+`.
- Score difference: home goals minus away goals, clipped to `[-3,3]`.
- Card difference: `(home yellow + 2×home red) − (away yellow + 2×away red)`, clipped to `[-3,3]`.
- Label: first home goal, away goal, yellow/red card in the next ten minutes; otherwise Quiet.

## Estimation

Counts use Laplace smoothing `α=1`. A row requires support `N≥30`. Fallback is:

1. exact minute/score/card;
2. drop card difference;
3. drop score difference;
4. minute band;
5. global.

Any fallback is `lowData`. The simulation bootstrap is always `lowData`, even where exact support exists. Artifacts record generation time, source, fixture count, sample count, row support, and historical window.

## Lifecycle and badges

The close is fixed at open minute +10. Soft refresh happens after 30 seconds without moving the close. THESIS takes the four-class maximum. ACTION matches a material THESIS, or takes the maximum non-Quiet class when THESIS is Quiet. Exact ties preserve the previous badge and otherwise follow catalog order: home goal, away goal, card, Quiet.

## Collapse and scorecard

The first sequence-ordered material event settles. Quiet settles at the close. Surprise is strictly `<0.15`; otherwise a wrong THESIS is THESIS DEAD.

Machine Ledger reports opened/settled totals, THESIS and ACTION hit rates, Surprise and THESIS DEAD counts, mean multiclass Brier score `Σ(pᵢ−yᵢ)²`, and latest live event-to-collapse latency.
