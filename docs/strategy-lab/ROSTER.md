# Strategy roster

The executable authority is [`lib/strategy-lab/designs.ts`](../../lib/strategy-lab/designs.ts). This document mirrors the **eleven** live designs for operators. `eligibleContracts` describes design intent; only `fillableNow` can reach an exchange adapter.

Family filters on the Act scoreboard: **Core** · **Event** · **Meta**.

| Strategy | Family | Observation read | Analysis read | Eligible | Fillable now | Stance rule |
|---|---|---|---|---|---|---|
| Value | Core / Meta | TxLINE book, score | desk fair 1X2, path, regime | Match 1X2 | Match 1X2 | Trade when fair clears the configured edge; flatten when it disappears. |
| Guarded Momentum | Core | TxLINE book/events | odds path, Sentinel quality/sharp move, regime | Match 1X2, O/U 2.5, Swing | Match 1X2, O/U 2.5 | Follow only corroborated momentum; flatten when quality or regime gates fail. |
| Mean Reversion | Core | TxLINE book | odds path z/return, Sentinel | Match 1X2, O/U 2.5 | Match 1X2, O/U 2.5 | Fade statistically stretched moves and reduce exposure as they normalize. |
| Intensity Burst | Core / Event | TxLINE events, tempo enrichment | MatchIntensity, desk fair 1X2, tempo accel, regime | Match 1X2 | Match 1X2 | During flurry/card/tempo-accel windows, trade desk fair vs book. Intensity is a gate only — never a price. |
| Hybrid Thesis | Core | TxLINE book, tempo enrichment | desk fair 1X2, Horizon, pressure, regime | Match 1X2, Next score, O/U 2.5 | Match 1X2 | Map Horizon and pressure into desk fair, then execute only the 1X2 contract. |
| Collapse Fade | Core / Event | TxLINE book/events | Horizon collapse, desk path | Match 1X2, Next score | Match 1X2 | After a collapse, fade its priced winner through the corresponding 1X2 selection. |
| Goal Overreaction | Event | TxLINE events, score | post-goal intensity, desk fair, regime | Match 1X2 | Match 1X2 | After a goal, cool off briefly then fade book overshoot toward desk fair. |
| Shock Fade | Event | TxLINE events | red-card / comeback intensity, desk fair | Match 1X2 | Match 1X2 | Fade red-card panic and comeback emotion toward desk fair while the shock gate is open. |
| Stale Reopen | Event | TxLINE book | Sentinel reopen / outlier, desk fair, reference | Match 1X2, O/U 2.5 | Match 1X2, O/U 2.5 | On suspend→reopen (or stale-clear outlier), fade misprints toward consensus / desk fair. |
| Regime Switcher | Meta | TxLINE book | desk regime, fair, Sentinel | Match 1X2 | Match 1X2 | Calm → Value overweight; normal → Guarded Momentum; chaotic → flatten. |
| Kelly Value | Meta | TxLINE book, score | desk fair, regime, portfolio drawdown | Match 1X2 | Match 1X2 | Same desk-fair edge as Value, sized with fractional Kelly and soft drawdown throttle. |

Removed from the live roster (code may remain for tests):

- **Naive Momentum** — noisy control that cluttered the stance board.
- **Market Maker** — quote-only surface without a distinct Observation→Analysis story.

The Strategy board always publishes one of: `TRADE`, `QUOTE`, `FLAT`, `STAND DOWN`, `INELIGIBLE`, or `NO MODEL`. Edge versus book appears only for a Strategy that genuinely consumes the desk pricing model (Value, Intensity Burst, Hybrid Thesis, Goal Overreaction, Shock Fade, Regime Switcher, Kelly Value, and Collapse Fade when fading through desk/path context).

Session scoreboard A/B lifts versus Value: **Intensity lift**, **Kelly lift**, **Regime lift** (plus stood-down count). There is no Guarded−Naive delta.
