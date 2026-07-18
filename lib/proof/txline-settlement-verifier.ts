import { createHash } from "node:crypto";
import { AnchorProvider, BN, Idl, Program, type Wallet as AnchorWallet } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { NormalizedScoreRecord } from "@/lib/txline/normalize";
import { refreshJwt, txlineBase, txlineHeaders } from "@/lib/txline/auth";
import type { Fixture, StatPair } from "@/lib/txline/types";
import { txoracleMainnetIdl } from "@/vendor/txline/mainnet/txoracle";

export const TXLINE_MAINNET_PROGRAM_ID = "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA";
export const TXLINE_SETTLEMENT_STAT_KEYS = [1, 2] as const;

export type SettlementFailureCode =
  | "FINAL_RECORD_REQUIRED"
  | "INVALID_FINAL_SEQUENCE"
  | "NON_TERMINAL_FINAL_RECORD"
  | "PROOF_HTTP_ERROR"
  | "MALFORMED_PROOF"
  | "INVALID_PROOF_NODE"
  | "STAT_ORDER_MISMATCH"
  | "SCOREBOARD_MISMATCH"
  | "INVALID_EPOCH_DAY"
  | "PROGRAM_ID_MISMATCH"
  | "ONCHAIN_REJECTED"
  | "RPC_ERROR";

export interface TxlineSettlementProof {
  network: "mainnet";
  programId: string;
  fixtureId: string;
  finalSequence: number;
  statKeys: number[];
  statValues: number[];
  dailyRootPda: string;
  responseHash: string;
  verifiedAtMs: number;
}

export interface SettlementVerification {
  verified: boolean;
  status: "verified" | "held";
  failureCode: SettlementFailureCode | null;
  retryable: boolean;
  detail: string;
  txlineSettlementProof: TxlineSettlementProof | null;
}

export interface SettlementVerifyInput {
  fixture: Fixture;
  finalRecord: NormalizedScoreRecord;
  observedScore: StatPair;
}

export interface SettlementVerifier {
  verify(input: SettlementVerifyInput): Promise<SettlementVerification>;
}

interface ProofNode {
  hash: number[];
  isRightSibling: boolean;
}

interface ValidatedProof {
  summary: {
    fixtureId: number;
    updateStats: { updateCount: number; minTimestamp: number; maxTimestamp: number };
    eventStatsSubTreeRoot: number[];
  };
  subTreeProof: ProofNode[];
  mainTreeProof: ProofNode[];
  eventStatRoot: number[];
  statsToProve: { key: number; value: number; period: number }[];
  statProofs: ProofNode[][];
}

export interface OnChainValidator {
  validate(payload: unknown, strategy: unknown, dailyRootPda: PublicKey): Promise<boolean>;
}

export interface TxlineSettlementDependencies {
  fetch: typeof fetch;
  headers(): Promise<Record<string, string>>;
  refresh(): Promise<void>;
  onChain: OnChainValidator;
  now(): number;
}

export class TxlineSettlementVerifier implements SettlementVerifier {
  constructor(private readonly dependencies: TxlineSettlementDependencies = defaultDependencies()) {
    assertProgramId();
  }

  async verify(input: SettlementVerifyInput): Promise<SettlementVerification> {
    const eligibility = validateFinalRecord(input.finalRecord);
    if (eligibility) return hold(eligibility.code, eligibility.detail, false);
    const finalSequence = input.finalRecord.snapshot.seq;

    let raw: string;
    try {
      raw = await this.fetchProof(input.fixture.id, finalSequence);
    } catch (error) {
      return hold(
        error instanceof ProofHttpError ? "PROOF_HTTP_ERROR" : "RPC_ERROR",
        error instanceof Error ? error.message : "Proof request failed",
        true,
      );
    }

    const responseHash = createHash("sha256").update(raw).digest("hex");
    let proof: ValidatedProof;
    try {
      proof = validateProof(JSON.parse(raw) as unknown);
    } catch (error) {
      const code = error instanceof InvalidProofNodeError ? "INVALID_PROOF_NODE" : "MALFORMED_PROOF";
      return hold(code, error instanceof Error ? error.message : "Malformed proof", false);
    }
    if (String(proof.summary.fixtureId) !== input.fixture.id) {
      return hold("MALFORMED_PROOF", "Proof fixture does not match the final record", false);
    }
    const keys = proof.statsToProve.map((stat) => stat.key);
    if (keys[0] !== 1 || keys[1] !== 2 || keys.length !== 2) {
      return hold("STAT_ORDER_MISMATCH", `Expected ordered stat keys 1,2; received ${keys.join(",")}`, false);
    }
    const participant1IsHome = input.finalRecord.snapshot.lifecycle?.participant1IsHome
      ?? input.fixture.participant1IsHome
      ?? true;
    const [participant1, participant2] = proof.statsToProve.map((stat) => stat.value);
    const provenScore = participant1IsHome
      ? { home: participant1, away: participant2 }
      : { home: participant2, away: participant1 };
    if (provenScore.home !== input.observedScore.home || provenScore.away !== input.observedScore.away) {
      return hold(
        "SCOREBOARD_MISMATCH",
        `Proven ${provenScore.home}-${provenScore.away} does not match observed ${input.observedScore.home}-${input.observedScore.away}`,
        false,
      );
    }

    let dailyRootPda: PublicKey;
    try {
      dailyRootPda = deriveDailyScoresRootPda(proof.summary.updateStats.minTimestamp);
    } catch (error) {
      return hold("INVALID_EPOCH_DAY", error instanceof Error ? error.message : "Invalid proof timestamp", false);
    }
    const payload = toAnchorPayload(proof);
    const strategy = {
      geometricTargets: [],
      distancePredicate: null,
      discretePredicates: proof.statsToProve.map((stat, index) => ({
        single: {
          index,
          predicate: { threshold: stat.value, comparison: { equalTo: {} } },
        },
      })),
    };

    try {
      const valid = await this.dependencies.onChain.validate(payload, strategy, dailyRootPda);
      if (!valid) return hold("ONCHAIN_REJECTED", "TxLINE validateStatV2 returned false", false);
    } catch (error) {
      return hold("RPC_ERROR", error instanceof Error ? error.message : "Mainnet validation failed", true);
    }

    return {
      verified: true,
      status: "verified",
      failureCode: null,
      retryable: false,
      detail: "Final score verified against the TxLINE mainnet daily score root",
      txlineSettlementProof: {
        network: "mainnet",
        programId: TXLINE_MAINNET_PROGRAM_ID,
        fixtureId: input.fixture.id,
        finalSequence,
        statKeys: [...TXLINE_SETTLEMENT_STAT_KEYS],
        statValues: [participant1, participant2],
        dailyRootPda: dailyRootPda.toBase58(),
        responseHash,
        verifiedAtMs: this.dependencies.now(),
      },
    };
  }

  private async fetchProof(fixtureId: string, sequence: number): Promise<string> {
    const query = new URLSearchParams({
      fixtureId,
      seq: String(sequence),
      statKeys: TXLINE_SETTLEMENT_STAT_KEYS.join(","),
    });
    const path = `/api/scores/stat-validation?${query}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.dependencies.fetch(`${txlineBase()}${path}`, {
        headers: await this.dependencies.headers(),
        cache: "no-store",
      });
      if (response.status === 401 && attempt === 0) {
        await this.dependencies.refresh();
        continue;
      }
      const raw = await response.text();
      if (!response.ok) throw new ProofHttpError(response.status, `TxLINE proof endpoint returned ${response.status}`);
      return raw;
    }
    throw new ProofHttpError(401, "TxLINE proof authentication failed");
  }
}

class AnchorOnChainValidator implements OnChainValidator {
  private readonly program: Program;

  constructor() {
    const connection = new Connection(
      process.env.SOLANA_MAINNET_RPC ?? "https://api.mainnet-beta.solana.com",
      "confirmed",
    );
    const provider = new AnchorProvider(connection, new EphemeralViewWallet(), {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    this.program = new Program(txoracleMainnetIdl as unknown as Idl, provider);
    if (this.program.programId.toBase58() !== TXLINE_MAINNET_PROGRAM_ID) {
      throw new Error("PROGRAM_ID_MISMATCH");
    }
  }

  async validate(payload: unknown, strategy: unknown, dailyRootPda: PublicKey): Promise<boolean> {
    type ValidateBuilder = {
      accounts(accounts: { dailyScoresMerkleRoots: PublicKey }): {
        preInstructions(instructions: unknown[]): { view(): Promise<boolean> };
      };
    };
    type DynamicMethods = { validateStatV2(payload: unknown, strategy: unknown): ValidateBuilder };
    const methods = this.program.methods as unknown as DynamicMethods;
    return methods.validateStatV2(payload, strategy)
      .accounts({ dailyScoresMerkleRoots: dailyRootPda })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
      .view();
  }
}

class EphemeralViewWallet implements AnchorWallet {
  readonly payer = Keypair.generate();
  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    if (transaction instanceof Transaction) transaction.partialSign(this.payer);
    else transaction.sign([this.payer]);
    return transaction;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    return Promise.all(transactions.map((transaction) => this.signTransaction(transaction)));
  }
}

export function deriveDailyScoresRootPda(timestampMs: number): PublicKey {
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) throw new Error("Proof timestamp must be a safe non-negative integer");
  const epochDay = Math.floor(timestampMs / 86_400_000);
  if (epochDay > 0xffff) throw new Error("Proof timestamp exceeds the u16 epoch-day range");
  return PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), new BN(epochDay).toArrayLike(Buffer, "le", 2)],
    new PublicKey(TXLINE_MAINNET_PROGRAM_ID),
  )[0];
}

function validateFinalRecord(record: NormalizedScoreRecord): { code: SettlementFailureCode; detail: string } | null {
  if (record.action !== "game_finalised") return { code: "FINAL_RECORD_REQUIRED", detail: "Settlement requires action=game_finalised" };
  if (!Number.isInteger(record.snapshot.seq) || record.snapshot.seq < 1) {
    return { code: "INVALID_FINAL_SEQUENCE", detail: "Final score sequence must be at least 1" };
  }
  const lifecycle = record.snapshot.lifecycle;
  if (lifecycle?.statusId !== 100 || lifecycle.period !== 100) {
    return { code: "NON_TERMINAL_FINAL_RECORD", detail: "Final score record must have terminal statusId=100 and period=100" };
  }
  return null;
}

function validateProof(raw: unknown): ValidatedProof {
  const root = object(raw, "proof");
  const summary = object(field(root, "summary"), "summary");
  const updateStats = object(field(summary, "updateStats"), "summary.updateStats");
  const stats = array(field(root, "statsToProve"), "statsToProve").map((item, index) => {
    const stat = object(item, `statsToProve[${index}]`);
    return {
      key: integer(field(stat, "key"), "stat.key"),
      value: integer(field(stat, "value"), "stat.value"),
      period: integer(field(stat, "period"), "stat.period"),
    };
  });
  const statProofs = array(field(root, "statProofs"), "statProofs").map((nodes, index) =>
    proofNodes(nodes, `statProofs[${index}]`),
  );
  if (stats.length !== statProofs.length) throw new Error("Each stat must have exactly one proof");
  return {
    summary: {
      fixtureId: integer(field(summary, "fixtureId"), "summary.fixtureId"),
      updateStats: {
        updateCount: integer(field(updateStats, "updateCount"), "updateCount"),
        minTimestamp: integer(field(updateStats, "minTimestamp"), "minTimestamp"),
        maxTimestamp: integer(field(updateStats, "maxTimestamp"), "maxTimestamp"),
      },
      eventStatsSubTreeRoot: bytes32(field(summary, "eventStatSubTreeRoot", "eventStatsSubTreeRoot")),
    },
    subTreeProof: proofNodes(field(root, "subTreeProof"), "subTreeProof"),
    mainTreeProof: proofNodes(field(root, "mainTreeProof"), "mainTreeProof"),
    eventStatRoot: bytes32(field(root, "eventStatRoot")),
    statsToProve: stats,
    statProofs,
  };
}

function toAnchorPayload(proof: ValidatedProof) {
  return {
    ts: new BN(proof.summary.updateStats.minTimestamp),
    fixtureSummary: {
      fixtureId: new BN(proof.summary.fixtureId),
      updateStats: {
        updateCount: proof.summary.updateStats.updateCount,
        minTimestamp: new BN(proof.summary.updateStats.minTimestamp),
        maxTimestamp: new BN(proof.summary.updateStats.maxTimestamp),
      },
      eventsSubTreeRoot: proof.summary.eventStatsSubTreeRoot,
    },
    fixtureProof: proof.subTreeProof,
    mainTreeProof: proof.mainTreeProof,
    eventStatRoot: proof.eventStatRoot,
    stats: proof.statsToProve.map((stat, index) => ({ stat, statProof: proof.statProofs[index] })),
  };
}

function proofNodes(value: unknown, label: string): ProofNode[] {
  return array(value, label).map((item, index) => {
    const node = object(item, `${label}[${index}]`);
    return {
      hash: bytes32(field(node, "hash")),
      isRightSibling: boolean(field(node, "isRightSibling"), "isRightSibling"),
    };
  });
}

function bytes32(value: unknown): number[] {
  let bytes: Uint8Array;
  if (Array.isArray(value)) bytes = Uint8Array.from(value.map(Number));
  else if (typeof value === "string" && value.startsWith("0x")) bytes = Buffer.from(value.slice(2), "hex");
  else if (typeof value === "string") bytes = Buffer.from(value, "base64");
  else throw new InvalidProofNodeError("Proof hash must be bytes, hex, or base64");
  if (bytes.length !== 32) throw new InvalidProofNodeError(`Expected 32-byte proof node, received ${bytes.length}`);
  return [...bytes];
}

function field(objectValue: Record<string, unknown>, ...names: string[]): unknown {
  const available = new Map(Object.keys(objectValue).map((key) => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), key]));
  for (const name of names) {
    const key = available.get(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (key) return objectValue[key];
  }
  throw new Error(`Missing proof field ${names[0]}`);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function integer(value: unknown, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${label} must be a safe integer`);
  return result;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
}

function hold(
  failureCode: SettlementFailureCode,
  detail: string,
  retryable: boolean,
): SettlementVerification {
  return { verified: false, status: "held", failureCode, retryable, detail, txlineSettlementProof: null };
}

function assertProgramId() {
  if (txoracleMainnetIdl.address !== TXLINE_MAINNET_PROGRAM_ID) {
    throw new Error(`PROGRAM_ID_MISMATCH: IDL ${txoracleMainnetIdl.address} != ${TXLINE_MAINNET_PROGRAM_ID}`);
  }
}

function defaultDependencies(): TxlineSettlementDependencies {
  return {
    fetch: globalThis.fetch,
    headers: txlineHeaders,
    refresh: refreshJwt,
    onChain: new AnchorOnChainValidator(),
    now: Date.now,
  };
}

class InvalidProofNodeError extends Error {}
class ProofHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
