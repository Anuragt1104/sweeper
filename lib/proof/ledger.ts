/**
 * AuditLedger — the proof-first spine of Sweeper.
 *
 * Every meaningful thing the system does — each market tick it ingested, each
 * sentinel signal, each agent decision, each fill, the final settlement — is
 * appended as a leaf to a per-session Merkle ledger. Each record carries the
 * hash of the market tick it reacted to, so the chain "what we saw → why we
 * acted → what we did" is explicit and tamper-evident.
 *
 * The Merkle root is the session's fingerprint. Any single record can be proven
 * to belong to that root with a compact inclusion proof (verifiable offline,
 * with no wallet), and the root can optionally be anchored on Solana — mirroring
 * TxLINE's own on-chain Merkle-proof validation model, applied to agent
 * behaviour instead of raw data. This is what turns the agents from a black box
 * into an auditable instrument.
 */
import { buildMerkleTree, leafHash, verifyMerkleProof, type MerkleProofStep } from "@/lib/util/merkle";
import { bytesToHex } from "@noble/hashes/utils";

export type LedgerKind =
  | "tick"
  | "signal"
  | "decision"
  | "fill"
  | "settlement"
  | "horizon_open"
  | "horizon_refresh"
  | "horizon_collapse";

export interface LedgerRecord {
  /** global ledger index (also the proof index). */
  seq: number;
  /** market tick index this record relates to. */
  tick: number;
  tsMs: number;
  kind: LedgerKind;
  /** short human summary for the audit trail. */
  summary: string;
  /** the canonical payload that is hashed. */
  payload: unknown;
  /** hash of the market tick this record reacted to (links decision → data). */
  reactedToHash?: string;
  /** sha256 leaf hash (hex) of this record's canonical form. */
  hash: string;
}

export interface ProofBundle {
  record: LedgerRecord;
  /** the canonical leaf string. */
  leaf: string;
  leafHash: string;
  proof: MerkleProofStep[];
  root: string;
  verified: boolean;
}

export class AuditLedger {
  private records: LedgerRecord[] = [];
  private leaves: string[] = [];
  private cachedRoot: string | null = null;

  append(
    kind: LedgerKind,
    tick: number,
    tsMs: number,
    summary: string,
    payload: unknown,
    reactedToHash?: string,
  ): LedgerRecord {
    const seq = this.records.length;
    const leaf = canonical({ seq, tick, tsMs, kind, payload });
    const record: LedgerRecord = {
      seq,
      tick,
      tsMs,
      kind,
      summary,
      payload,
      reactedToHash,
      hash: bytesToHex(leafHash(leaf)),
    };
    this.records.push(record);
    this.leaves.push(leaf);
    this.cachedRoot = null;
    return record;
  }

  /** Stable hash of a market-tick payload, used as a decision's reactedToHash. */
  static hashOf(payload: unknown): string {
    return bytesToHex(leafHash(canonical(payload)));
  }

  size(): number {
    return this.records.length;
  }

  root(): string {
    if (this.cachedRoot) return this.cachedRoot;
    this.cachedRoot = buildMerkleTree(this.leaves).root;
    return this.cachedRoot;
  }

  all(): LedgerRecord[] {
    return this.records;
  }

  /** Most recent `n` records (for the live audit trail). */
  recent(n: number): LedgerRecord[] {
    return this.records.slice(Math.max(0, this.records.length - n));
  }

  get(seq: number): LedgerRecord | undefined {
    return this.records[seq];
  }

  /** Build a verifiable inclusion proof for one record. */
  proof(seq: number): ProofBundle | null {
    const record = this.records[seq];
    if (!record) return null;
    const tree = buildMerkleTree(this.leaves);
    const proof = tree.proof(seq);
    const leaf = this.leaves[seq];
    const verified = verifyMerkleProof(leaf, proof, tree.root);
    return { record, leaf, leafHash: record.hash, proof, root: tree.root, verified };
  }
}

/** Deterministic, key-sorted JSON — the canonical form that gets hashed. */
export function canonical(v: unknown): string {
  return JSON.stringify(sortDeep(v));
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortDeep((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}
