# Strategy roster

The executable authority is [`lib/strategy-lab/designs.ts`](../../lib/strategy-lab/designs.ts). This document explains the same six designs for operators. `eligibleContracts` describes design intent; only `fillableNow` can reach an exchange adapter.

| Strategy | Observation read | Analysis read | Eligible | Fillable now | Stance rule |
|---|---|---|---|---|---|
| Value | TxLINE book, score | desk fair 1X2, path, regime | Match 1X2 | Match 1X2 | Trade when fair clears the configured edge; flatten when it disappears. |
| Guarded Momentum | TxLINE book/events | odds path, Sentinel quality/sharp move, regime | Match 1X2, O/U 2.5, Swing | Match 1X2, O/U 2.5 | Follow only corroborated momentum and flatten when quality or regime gates fail. |
| Mean Reversion | TxLINE book | odds path z/return, Sentinel | Match 1X2, O/U 2.5 | Match 1X2, O/U 2.5 | Fade statistically stretched moves and reduce exposure as they normalize. |
| Intensity Burst | TxLINE events, tempo enrichment | MatchIntensity, desk fair 1X2, tempo accel, regime | Match 1X2 | Match 1X2 | During flurry/card/tempo-accel windows, trade desk fair vs book. Intensity is a gate only — never a price. |
| Hybrid Thesis | TxLINE book, tempo enrichment | desk fair 1X2, Horizon, pressure, regime | Match 1X2, Next score, O/U 2.5 | Match 1X2 | Map Horizon and pressure into desk fair, then execute only the 1X2 contract. |
| Collapse Fade | TxLINE book/events | Horizon collapse, desk path | Match 1X2, Next score | Match 1X2 | After a collapse, fade its priced winner through the corresponding 1X2 selection. |

Removed from the live roster (still present as code for tests where needed):

- **Naive Momentum** — noisy control that cluttered the stance board.
- **Market Maker** — quote-only surface without a distinct Observation→Analysis story.

The Strategy board always publishes one of: `TRADE`, `QUOTE`, `FLAT`, `STAND DOWN`, `INELIGIBLE`, or `NO MODEL`. Edge versus book appears only for a Strategy that genuinely consumes the desk pricing model (Value, Intensity Burst, Hybrid Thesis).
