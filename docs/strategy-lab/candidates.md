# Phase B Strategy candidates

These are design candidates only. They have no `fillableNow` authority and must not create orders until a defensible fair-value model, execution mapping, and settlement test suite exist.

## Corners Pressure

- Reads: raw corner/enrichment observations and the returned corners O/U book.
- Eligible contract: Corners O/U.
- Gate to implementation: independently calibrated corner-total fair model with adequate historical support.

## Enrichment Burst

- Reads: MatchIntensity and observed shot/attack bursts.
- Eligible contracts: Match 1X2 and O/U 2.5.
- Gate to implementation: prove incremental calibration beyond the existing desk and momentum paths without treating enrichment as settlement truth.

## Swing Guard

- Reads: short-term favorite movement, goal-free lookback, Sentinel quality.
- Eligible contract: Swing.
- Gate to implementation: define an actual executable Contract rather than treating a derived path alert as a fill market.

