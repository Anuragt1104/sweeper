# Sweeper Domain Language

## Run provenance

- **LIVE** — normalized observations received directly from TxLINE mainnet level 12 during the active fixture.
- **RECORDED LIVE** — an immutable replay of persisted observations originally received from TxLINE. It is never represented as a current live connection.
- **SIMULATION** — deterministic generated match and market data. It is never represented as TxLINE data.

## Execution

- **SHADOW** — hypothetical positions generated from real TxLINE observations. No wager or external order is submitted.
- **SIMULATED** — hypothetical positions generated from deterministic simulation data.
- **Stand-down** — an explicit agent decision not to quote or trade because one or more readiness conditions are false.
- **Robust reference** — a filtered, smoothed reference probability derived only from recent TxLINE consensus observations.

## Proofs

- **TxLINE settlement proof** — validation of an observed final TxLINE score record against the TxLINE mainnet daily score root.
- **Agent ledger anchor** — Sweeper's independent timestamp of its deterministic ledger root using a Solana devnet memo transaction.
- **Proof receipt** — the persisted outcome and evidence for one verification attempt.

## Sessions and recordings

- **Session** — one fixture run with fixed configuration, artifact, provenance, and deterministic ledger.
- **Recording** — the immutable persisted observations and proof receipts of a session that can be replayed publicly.
