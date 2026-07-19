# Phase B Strategy candidates

These are design candidates only unless noted as shipped. They have no
`fillableNow` authority until a defensible fair-value model, execution mapping,
and settlement test suite exist.

## Shipped (from ideation — event / meta desk)

| id | Name | Notes |
|----|------|-------|
| `goal_overreaction` | Goal Overreaction | Post-goal cool-off then fade toward desk fair |
| `shock_fade` | Shock Fade | Red-card + comeback emotion fade |
| `stale_reopen` | Stale Reopen | Suspend→reopen / stale-clear microstructure fade |
| `regime_switcher` | Regime Switcher | Calm→Value, normal→Momentum, chaotic→flat |
| `kelly_value` | Kelly Value | Desk fair + fractional Kelly + DD throttle |

## Corners Pressure

- Reads: raw corner/enrichment observations and the returned corners O/U book.
- Eligible contract: Corners O/U.
- Gate to implementation: independently calibrated corner-total fair model with adequate historical support.

## Enrichment Burst

- Shipped as `intensity_burst` in the live roster. Reads MatchIntensity + tempo accel as a **gate only**; desk-v1 fair remains the sole price. Eligible/fillable: Match 1X2.

## Swing Guard

- Reads: short-term favorite movement, goal-free lookback, Sentinel quality.
- Eligible contract: Swing.
- Gate to implementation: define an actual executable Contract rather than treating a derived path alert as a fill market.

## Still design-only (high PnL research)

- **1X2 ↔ O/U Parity Arb** — needs joint λ calibration
- **Horizon Next-Goal Taker** — needs `next_score` fillable path
- **xG / Shot Residual** — process λ from tempo (careful: enrichment ≠ settlement)
- **Scoreless Grind (Under Lock)** — needs O/U fair model
