# TxLINE API — builder feedback

Our experience building Sweeper on TxLINE, as requested in the submission form.

## What we liked most

- **One normalized schema across competitions.** Modelling fixtures, scores (with period
  splits and the goals/cards/corners stat set), game-phase codes, and consensus odds was
  straightforward because the shape is consistent. We could build a single internal type
  set (`lib/txline/types.ts`) and map the live feed into it cleanly.
- **The proof primitives are the differentiator.** Merkle stat-validation + on-chain
  anchoring is what let us build something defensible — a *proof-first* autonomous tool
  rather than another odds bot. Exposing `stat-validation` with composite stat keys and a
  three-stage proof chaining to a daily on-chain root is exactly the right primitive for
  trustworthy settlement.
- **SSE for live transport** is a clean fit for an autonomous agent loop; `id` + heartbeat
  + `Last-Event-ID` resume is the right design.
- **No rate limits on the free tier** materially widened the design space — high-frequency
  polling, dense monitoring, and per-tick logging are all viable.
- **Mainnet + devnet hosts** lowered friction for testing.

## Where we hit friction

- **Host naming changed during prototyping.** The current mainnet documentation and API
  both use `https://txline.txodds.com`; keeping that canonical host prominent prevents
  older `oracle.*` examples from leaking into new integrations.
- **Activation returns `text/plain`, not JSON.** `POST /api/token/activate` returns the raw
  token as text. Easy to handle once known, but it tripped us initially (we expected
  `{ token }`). A one-line note in the docs would help.
- **The binding-message format is implicit.** The exact string to sign
  (`` `${txSig}:${leagues.join(',')}:${jwt}` ``) and that it's Ed25519-detached then
  base64 took trial and error. A copy-pasteable signing snippet would remove a class of
  support questions.
- **Official soccer stat keys are now published.** That removed the earlier ambiguity in
  our `stat-validation` mapping. Keeping the numeric table versioned and linked beside the
  validation example would make future schema changes equally easy to audit.
- **World Cup competition id.** We made it an env override (`TXLINE_COMPETITION_ID`) since
  we couldn't confirm the exact FIFA World Cup 2026 id from the docs alone.

## How we de-risked the unknowns

Everything TxLINE-specific is behind `lib/txline/`. Simulation/replay produces
TxLINE-shaped data for a labelled deterministic demo, while live mode hydrates real
snapshots and accepts both mainnet streams before it shows LIVE. A live failure never
switches to simulation, and schema surprises are localized to the adapter.

Overall: a genuinely strong data layer to build on. The proof/anchoring story is the part
that made this project worth building.
