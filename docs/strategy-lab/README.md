# Strategy Lab

The Strategy Lab is Sweeper's primary product surface. It separates received facts, desk inference, and policy action into one contract-focused view.

- **[HANDOFF.md](./HANDOFF.md)** — original Phase A locked decisions (historical; roster has since grown)
- **[ROSTER.md](./ROSTER.md)** — operator-readable design cards for the **eleven** Strategies
- **[candidates.md](./candidates.md)** — Phase B designs with no current fill authority
- Domain language: [`CONTEXT.md`](../../CONTEXT.md)
- Canonical roster: [`lib/strategy-lab/designs.ts`](../../lib/strategy-lab/designs.ts)
- Projection seam: [`lib/strategy-lab/projection.ts`](../../lib/strategy-lab/projection.ts)
- Recording script: [`docs/DEMO_SCRIPT.md`](../DEMO_SCRIPT.md)

Bare `/` is the **landing page**. Strategy Lab opens when the URL includes `lab`, `demo`, `contract`, `advanced`, or `rail`.

Current desktop IA:

```text
Landing (optional) → Session masthead → contract navigator
OBSERVE            → INTERPRET         → ACT
What happened?       What does the       Who is winning —
                     desk infer?         and what will they do?
source facts         desk inference      11 stances + session scoreboard
```

Domain layer names remain Observation → Analysis → Strategy. UI verbs are Observe / Interpret / Act.

Contract coverage badges: `MODEL` · `BOOK ONLY` · `SIGNAL ONLY` · `NO MARKET`. Interpret may also show `NO PRICING MODEL` when agents have no fill authority on that contract.

Advanced is a URL-linkable drawer (`?advanced=evidence` etc.) containing:

`evidence` · `markets` · `sentinel` · `horizon` · `proofs` · `operator` · `research`

Chart timeframes on Interpret and Act compact charts: `5m` / `15m` / `30m` / `FULL` (default `15m`).
