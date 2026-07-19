/**
 * SHA-256 Merkle tree for the room proof layer.
 *
 * Every match event the room reacts to is hashed into a leaf. The Merkle root
 * is the room's tamper-evident fingerprint of "what data we reacted to, and
 * when." It can be anchored on Solana (optional), and any single event can be
 * proven to belong to the root with a compact inclusion proof — mirroring
 * TxLINE's own Merkle-proof validation model, surfaced as a fan feature.
 */
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

function hashPair(a: Uint8Array, b: Uint8Array): Uint8Array {
  const buf = new Uint8Array(a.length + b.length);
  buf.set(a, 0);
  buf.set(b, a.length);
  return sha256(buf);
}

export function leafHash(data: string): Uint8Array {
  // domain-separate leaves from internal nodes
  return sha256(utf8ToBytes("\x00" + data));
}

export interface MerkleProofStep {
  hash: string; // hex
  position: "left" | "right";
}

export interface MerkleTree {
  root: string; // hex
  leaves: string[]; // hex leaf hashes
  proof(index: number): MerkleProofStep[];
}

export function buildMerkleTree(items: string[]): MerkleTree {
  return buildMerkleTreeFromLeafHashes(items.map((item) => bytesToHex(leafHash(item))));
}

/** Build the exact same tree from already domain-separated SHA-256 leaf hashes. */
export function buildMerkleTreeFromLeafHashes(leafHashes: string[]): MerkleTree {
  if (leafHashes.length === 0) {
    const empty = bytesToHex(sha256(utf8ToBytes("EMPTY")));
    return { root: empty, leaves: [], proof: () => [] };
  }

  const leaves = leafHashes.map(hexToBytes);
  const leafHex = [...leafHashes];

  // Build levels bottom-up, duplicating the last node on odd counts.
  const levels: Uint8Array[][] = [leaves];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next: Uint8Array[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = i + 1 < prev.length ? prev[i + 1] : prev[i];
      next.push(hashPair(left, right));
    }
    levels.push(next);
  }

  const root = bytesToHex(levels[levels.length - 1][0]);

  function proof(index: number): MerkleProofStep[] {
    const steps: MerkleProofStep[] = [];
    let idx = index;
    for (let lvl = 0; lvl < levels.length - 1; lvl++) {
      const level = levels[lvl];
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;
      const sibling = siblingIdx < level.length ? level[siblingIdx] : level[idx];
      steps.push({
        hash: bytesToHex(sibling),
        position: isRight ? "left" : "right",
      });
      idx = Math.floor(idx / 2);
    }
    return steps;
  }

  return { root, leaves: leafHex, proof };
}

/** Verify a leaf belongs to `root` given its inclusion proof. */
export function verifyMerkleProof(
  leafData: string,
  proof: MerkleProofStep[],
  root: string,
): boolean {
  let acc = leafHash(leafData);
  for (const step of proof) {
    const sib = hexToBytes(step.hash);
    acc = step.position === "left" ? hashPair(sib, acc) : hashPair(acc, sib);
  }
  return bytesToHex(acc) === root;
}

/** Verify a proof when only the archived leaf hash is available. */
export function verifyMerkleProofHash(
  leafHashHex: string,
  proof: MerkleProofStep[],
  root: string,
): boolean {
  let acc = hexToBytes(leafHashHex);
  for (const step of proof) {
    const sib = hexToBytes(step.hash);
    acc = step.position === "left" ? hashPair(sib, acc) : hashPair(acc, sib);
  }
  return bytesToHex(acc) === root;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
