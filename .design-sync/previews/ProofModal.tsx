import { ProofModal } from 'sweeper';

// ProofModal fetches /api/proof/<seq> on mount. In a static preview there is no
// server, so we serve a canned, verified inclusion-proof bundle — the same shape
// the real endpoint returns — so the component renders its true success state
// rather than the perpetual "building proof…" placeholder.
const bundle = {
  verified: true,
  record: {
    kind: 'fill',
    summary: 'Guarded Momentum bought Over 2.5 @1.72 ×40',
    reactedToHash: '9d4c61f0a8b2e7c3a5b1e93c7d2a40f88',
  },
  leaf: 'fill|141|over25|1.72|40',
  leafHash: 'f3a9c1d4e7b20a91c5d6e7f8a9b0c1d2',
  root: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
  proof: [{}, {}, {}, {}, {}, {}, {}],
};

if (typeof window !== 'undefined') {
  (window as unknown as { fetch: () => Promise<unknown> }).fetch = async () => ({
    json: async () => bundle,
  });
}

/**
 * A verified inclusion proof for ledger record #141, reproduced against the session root.
 * ProofModal is a full-viewport overlay (`position: fixed`); the `transform` wrapper
 * gives it a containing block so it centers inside the preview card instead of escaping it.
 */
export function Verified() {
  return (
    <div style={{ position: 'relative', transform: 'translateZ(0)', width: 660, height: 560, overflow: 'hidden' }}>
      <ProofModal seq={141} onClose={() => {}} />
    </div>
  );
}
