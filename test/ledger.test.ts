import test from "node:test";
import assert from "node:assert/strict";
import { AuditLedger, buildProofBundle } from "@/lib/proof/ledger";
import { buildMerkleTreeFromLeafHashes, verifyMerkleProof } from "@/lib/util/merkle";

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

test("bounded and complete ledgers produce identical roots from 10,000 records", () => {
  const complete = new AuditLedger();
  const bounded = new AuditLedger({ maxFullRecords: 256 });
  for (let i = 0; i < 10_000; i += 1) {
    const args = ["tick", i, i * 1_000, `tick ${i}`, { i, price: (i % 97) / 100 }] as const;
    complete.append(...args);
    bounded.append(...args);
  }

  assert.equal(bounded.root(), complete.root());
  assert.equal(bounded.size(), 10_000);
  assert.equal(bounded.retainedRecordCount(), 256);
  assert.equal(bounded.get(0), undefined);
  assert.equal(bounded.get(9_999)?.seq, 9_999);
});

test("pre-hashed leaves preserve roots and historical inclusion paths", () => {
  const ledger = new AuditLedger({ maxFullRecords: 2 });
  let historical: ReturnType<AuditLedger["entry"]>;
  for (let i = 0; i < 10; i += 1) {
    ledger.append("decision", i, i, `decision ${i}`, { i });
    if (i === 1) historical = ledger.entry(1);
  }

  const tree = buildMerkleTreeFromLeafHashes(ledger.leafHashes());
  assert.equal(tree.root, ledger.root());
  assert.ok(historical);
  const proof = tree.proof(1);
  assert.equal(ledger.verifyEntry(historical!, proof, tree.root), true);
});

test("an archived full record produces a valid proof from compact leaf hashes", () => {
  const ledger = new AuditLedger({ maxFullRecords: 2 });
  let archived: ReturnType<AuditLedger["entry"]>;
  for (let i = 0; i < 20; i += 1) {
    ledger.append("fill", i, i, `fill ${i}`, { strategy: "collapse_fade", i });
    if (i === 0) archived = structuredClone(ledger.entry(0));
  }
  assert.equal(ledger.get(0), undefined);
  const bundle = buildProofBundle(archived!, ledger.leafHashes());
  assert.equal(bundle.root, ledger.root());
  assert.equal(bundle.record.seq, 0);
  assert.equal(bundle.verified, true);
});
