import { AuditTrail } from 'sweeper';

const noop = () => {};

const active = {
  size: 142,
  root: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
  recent: [
    { seq: 142, kind: 'settlement', summary: 'Settled match_result → home; total_goals → over', hash: 'f3a9c1d4e7b20a91' },
    { seq: 141, kind: 'fill', summary: 'Guarded Momentum bought Over 2.5 @1.72 ×40', hash: '8c2d4419ab7e3f02' },
    { seq: 140, kind: 'decision', summary: 'Naive Momentum chased the repricing — bought outlier', hash: '5b1e93c7d2a40f88' },
    { seq: 139, kind: 'signal', summary: 'Outlier print on match_result/away (5.1σ)', hash: '2f7a08be91c3d5a6' },
    { seq: 138, kind: 'tick', summary: "78' Argentina 2–2 France · quality 78", hash: '9d4c61f0a8b2e7c3' },
    { seq: 137, kind: 'fill', summary: 'Value sold Draw @3.65 ×20', hash: '7a3f12c9e0b48d51' },
  ],
  anchor: {
    sig: 'Qm5xR2tWvB7nK3pLs9aYcF1dE8hJ4gN6',
    url: 'https://explorer.solana.com/tx/Qm5xR2tWvB7nK3pLs9aYcF1dE8hJ4gN6?cluster=devnet',
    root: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
  },
};

/** A populated audit ledger with a Solana devnet anchor and clickable proof rows. */
export function Anchored() {
  return (
    <div style={{ width: 420 }}>
      <AuditTrail ledger={active} status="running" onProof={noop} />
    </div>
  );
}

/** Before a session starts — empty ledger. */
export function Idle() {
  return (
    <div style={{ width: 420 }}>
      <AuditTrail
        ledger={{ size: 0, root: '0000000000000000', recent: [], anchor: null }}
        status="idle"
        onProof={noop}
      />
    </div>
  );
}
