import test from "node:test";
import assert from "node:assert/strict";
import { AuditLedger } from "@/lib/proof/ledger";
import { verifyMerkleProof } from "@/lib/util/merkle";

test("ledger inclusion proofs verify against the root", () => {
  const L = new AuditLedger();
  for (let i = 0; i < 25; i++) L.append("tick", i, i * 1000, `tick ${i}`, { i, v: i * i });
  const root = L.root();
  assert.equal(L.size(), 25);

  for (const seq of [0, 1, 7, 12, 24]) {
    const b = L.proof(seq);
    assert.ok(b, `proof for ${seq}`);
    assert.equal(b!.root, root);
    assert.ok(b!.verified, `record ${seq} should verify`);
  }
});

test("a tampered leaf fails verification", () => {
  const L = new AuditLedger();
  for (let i = 0; i < 16; i++) L.append("signal", i, i, `s${i}`, { i });
  const b = L.proof(5)!;
  // verifying a different payload against the same proof must fail
  const forged = JSON.stringify({ seq: 5, tick: 5, tsMs: 5, kind: "signal", payload: { i: 999 } });
  assert.equal(verifyMerkleProof(forged, b.proof, b.root), false);
  assert.equal(verifyMerkleProof(b.leaf, b.proof, b.root), true);
});

test("root changes when any record changes", () => {
  const a = new AuditLedger();
  const b = new AuditLedger();
  for (let i = 0; i < 10; i++) {
    a.append("tick", i, i, `t${i}`, { i });
    b.append("tick", i, i, `t${i}`, { i: i === 4 ? 1000 : i });
  }
  assert.notEqual(a.root(), b.root());
});
