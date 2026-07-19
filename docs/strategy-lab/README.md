# Strategy Lab

The Strategy Lab is implemented as Sweeper's primary product surface. It separates received facts, desk inference, and policy action into one contract-focused view.

- **[HANDOFF.md](./HANDOFF.md)** — original locked decisions and acceptance criteria
- **[ROSTER.md](./ROSTER.md)** — operator-readable design cards for the seven Strategies
- **[candidates.md](./candidates.md)** — Phase B designs with no current fill authority
- Domain language: [`CONTEXT.md`](../../CONTEXT.md)
- Canonical roster: [`lib/strategy-lab/designs.ts`](../../lib/strategy-lab/designs.ts)
- Projection seam: [`lib/strategy-lab/projection.ts`](../../lib/strategy-lab/projection.ts)

Current desktop IA:

```text
Session masthead → contract navigator
Observation      → Analysis       → Strategy
source facts       desk inference    seven stances + Arena
```

Advanced is a URL-linkable drawer (`?advanced=proofs`) containing Causal, Markets, Sentinel, Horizon, Proofs, Operator, and the legacy Research strip.
