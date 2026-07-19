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
import {
  buildMerkleTreeFromLeafHashes,
  leafHash,
  verifyMerkleProof,
  type MerkleProofStep,
} from "@/lib/util/merkle";
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

export interface LedgerEntry {
  record: LedgerRecord;
  leaf: string;
  leafHash: string;
}

export interface AuditLedgerOptions {
  /** Undefined retains every full record. Live sessions use a bounded window. */
  maxFullRecords?: number;
}

export class AuditLedger {
  private records = new Map<number, LedgerEntry>();
  private hashes: string[] = [];
  private cachedRoot: string | null = null;

  constructor(private readonly options: AuditLedgerOptions = {}) {
    if (options.maxFullRecords !== undefined && options.maxFullRecords < 1) {
      throw new Error("maxFullRecords must be at least one");
    }
  }

  append(
    kind: LedgerKind,
    tick: number,
    tsMs: number,
    summary: string,
    payload: unknown,
    reactedToHash?: string,
  ): LedgerRecord {
    const seq = this.hashes.length;
    const leaf = canonical({ seq, tick, tsMs, kind, payload });
    const hash = bytesToHex(leafHash(leaf));
    const record: LedgerRecord = {
      seq,
      tick,
      tsMs,
      kind,
      summary,
      payload,
      reactedToHash,
      hash,
    };
    this.records.set(seq, { record, leaf, leafHash: hash });
    this.hashes.push(hash);
    const limit = this.options.maxFullRecords;
    if (limit !== undefined && this.records.size > limit) {
      this.records.delete(seq - limit);
    }
    this.cachedRoot = null;
    return record;
  }

  /** Stable hash of a market-tick payload, used as a decision's reactedToHash. */
  static hashOf(payload: unknown): string {
    return bytesToHex(leafHash(canonical(payload)));
  }

  size(): number {
    return this.hashes.length;
  }

  retainedRecordCount(): number {
    return this.records.size;
  }

  leafHashes(): string[] {
    return [...this.hashes];
  }

  root(): string {
    if (this.cachedRoot) return this.cachedRoot;
    this.cachedRoot = buildMerkleTreeFromLeafHashes(this.hashes).root;
    return this.cachedRoot;
  }

  all(): LedgerRecord[] {
    return [...this.records.values()].map((entry) => entry.record);
  }

  /** Most recent `n` records (for the live audit trail). */
  recent(n: number): LedgerRecord[] {
    return this.all().slice(-n);
  }

  get(seq: number): LedgerRecord | undefined {
    return this.records.get(seq)?.record;
  }

  entry(seq: number): LedgerEntry | undefined {
    return this.records.get(seq);
  }

  /** Full retained entries whose global sequence is at or after `firstSeq`. */
  entriesSince(firstSeq: number): LedgerEntry[] {
    return [...this.records.entries()]
      .filter(([seq]) => seq >= firstSeq)
      .map(([, entry]) => entry);
  }

  verifyEntry(entry: LedgerEntry, proof: MerkleProofStep[], root: string): boolean {
    return verifyMerkleProof(entry.leaf, proof, root);
  }

  /** Build a verifiable inclusion proof for one record. */
  proof(seq: number): ProofBundle | null {
    const entry = this.records.get(seq);
    if (!entry) return null;
    const tree = buildMerkleTreeFromLeafHashes(this.hashes);
    const proof = tree.proof(seq);
    const verified = verifyMerkleProof(entry.leaf, proof, tree.root);
    return {
      record: entry.record,
      leaf: entry.leaf,
      leafHash: entry.leafHash,
      proof,
      root: tree.root,
      verified,
    };
  }
}

/** Reconstruct a full inclusion bundle for a record archived outside the live process. */
export function buildProofBundle(entry: LedgerEntry, leafHashes: string[]): ProofBundle {
  if (entry.record.seq < 0 || entry.record.seq >= leafHashes.length) {
    throw new Error(`Ledger sequence ${entry.record.seq} is outside the ${leafHashes.length}-leaf tree`);
  }
  if (leafHashes[entry.record.seq] !== entry.leafHash) {
    throw new Error(`Archived ledger hash mismatch at sequence ${entry.record.seq}`);
  }
  const tree = buildMerkleTreeFromLeafHashes(leafHashes);
  const proof = tree.proof(entry.record.seq);
  return {
    record: entry.record,
    leaf: entry.leaf,
    leafHash: entry.leafHash,
    proof,
    root: tree.root,
    verified: verifyMerkleProof(entry.leaf, proof, tree.root),
  };
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
