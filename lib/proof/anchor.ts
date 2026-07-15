/**
 * Optional on-chain anchor for the session audit ledger (server-side, devnet).
 *
 * Writes the ledger's Merkle root into a Solana memo transaction so the
 * tamper-evident fingerprint of "everything the agents saw and did this session"
 * is timestamped on-chain — mirroring TxLINE's own on-chain verification model,
 * applied to agent behaviour. Entirely optional: inclusion proofs verify locally
 * with no wallet, so judges never need to set one up. Anchoring activates only
 * when SOLANA_ANCHOR_SECRET_KEY is configured.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { base58Decode } from "@/lib/util/base58";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export function anchorConfigured(): boolean {
  return !!process.env.SOLANA_ANCHOR_SECRET_KEY;
}

export function clusterUrl(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";
}

function payer(): Keypair {
  const raw = process.env.SOLANA_ANCHOR_SECRET_KEY as string;
  const bytes = raw.trim().startsWith("[")
    ? Uint8Array.from(JSON.parse(raw) as number[])
    : base58Decode(raw.trim());
  return Keypair.fromSecretKey(bytes);
}

/** Anchor a session's ledger root via a memo tx. Returns the tx signature. */
export async function anchorRoot(sessionId: string, root: string): Promise<string> {
  if (!anchorConfigured()) throw new Error("SOLANA_ANCHOR_SECRET_KEY not set");
  const connection = new Connection(clusterUrl(), "confirmed");
  const kp = payer();
  const memo = `SWPR:${sessionId}:${root}`;
  const ix = new TransactionInstruction({
    keys: [{ pubkey: kp.publicKey, isSigner: true, isWritable: true }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, "utf8"),
  });
  const tx = new Transaction().add(ix);
  return sendAndConfirmTransaction(connection, tx, [kp], { commitment: "confirmed" });
}

export function explorerTxUrl(sig: string): string {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  return `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
}
