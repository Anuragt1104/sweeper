# Judge evidence map

> TxLINE makes sports data verifiable. Sweeper makes every autonomous decision made from that data inspectable, comparable, and provable.

The demo follows: **trust the input → understand the inference → watch autonomous action → compare outcomes → verify the decision**.

| Criterion | What must be visible | Product evidence |
| --- | --- | --- |
| Core ingestion | TxLINE genuinely drives live mode | Mainnet Watchtower, hydrated score/odds snapshots, separate SSE acceptance, sequence continuity, timestamps, provenance |
| Autonomy | The system progresses without clicks | Supervisor plus goal → analysis → stance → fill → PnL |
| Logic | Decisions are deterministic and defensible | Three rails, strategy rules, signed edge, gates, `NO MODEL`, stand-downs |
| Innovation | More than an odds alert | Fixed ten-minute Horizon, seven-policy controlled experiment, Decision Receipt |
| Production readiness | A desk could operate it | Health, Postgres recovery, Last-Event-ID, control key, shadow boundary, proof-gated settlement |

## Claim boundaries

- TxLINE mainnet level 12 is the live source. Live failure is shown and never replaced silently with simulation.
- HTTP/SSE acceptance proves a request was accepted; it does not prove an active fixture is emitting updates.
- Desk fair, regime, Sentinel quality, and Horizon are Sweeper outputs.
- Act II is a deterministic simulation, not recorded live.
- Execution is shadow/simulated; no real-money venue execution is claimed.
- A Sweeper decision proof establishes record inclusion and tamper evidence. It does not establish model accuracy and is not a TxLINE stat proof.
- `validateStatV2.view()` is an outcome-validation guard. It is not described as posting a settlement transaction.
- Simulated PnL is experimental evidence inside the controlled replay, not a forecast of future profitability.

## Official TxLINE references

- [World Cup mainnet tier](https://txline.txodds.com/documentation/worldcup)
- [Streaming contract and SSE acceptance](https://txline.txodds.com/documentation/examples/streaming-data)
- [On-chain stat validation](https://txline.txodds.com/documentation/examples/onchain-validation)
