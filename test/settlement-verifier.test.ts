import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScoreRecord } from "../lib/txline/normalize";
import {
  TXLINE_MAINNET_PROGRAM_ID,
  TxlineSettlementVerifier,
  deriveDailyScoresRootPda,
  type OnChainValidator,
} from "../lib/proof/txline-settlement-verifier";
import type { Fixture } from "../lib/txline/types";

const fixture: Fixture = {
  id: "18257865",
  competitionId: "26",
  competition: "World Cup",
  stage: "Final",
  home: { id: "2", name: "England", code: "ENG", flag: "", rating: 90 },
  away: { id: "1", name: "France", code: "FRA", flag: "", rating: 92 },
  kickoff: "2026-07-18T20:00:00.000Z",
  venue: "",
  status: "live",
  participant1IsHome: false,
};

test("game_finalised proof maps participant order and validates two exact predicates", async () => {
  let capturedStrategy: unknown;
  const verifier = verifierFor(proofPayload(2, 1), {
    validate: async (_payload, strategy) => {
      capturedStrategy = strategy;
      return true;
    },
  });
  const finalRecord = finalScoreRecord();
  const result = await verifier.verify({
    fixture,
    finalRecord,
    observedScore: { home: 1, away: 2 },
  });
  assert.equal(result.verified, true);
  assert.equal(result.txlineSettlementProof?.programId, TXLINE_MAINNET_PROGRAM_ID);
  assert.deepEqual(result.txlineSettlementProof?.statValues, [2, 1]);
  assert.equal((capturedStrategy as { discretePredicates: unknown[] }).discretePredicates.length, 2);
});

test("malformed 32-byte proof nodes, stat order, and scoreboard mismatches remain held", async () => {
  const malformed = proofPayload(2, 1);
  malformed.subTreeProof[0].hash = [1, 2];
  assert.equal((await verifierFor(malformed).verify({
    fixture,
    finalRecord: finalScoreRecord(),
    observedScore: { home: 1, away: 2 },
  })).failureCode, "INVALID_PROOF_NODE");

  const reversed = proofPayload(2, 1);
  reversed.statsToProve.reverse();
  reversed.statProofs.reverse();
  assert.equal((await verifierFor(reversed).verify({
    fixture,
    finalRecord: finalScoreRecord(),
    observedScore: { home: 1, away: 2 },
  })).failureCode, "STAT_ORDER_MISMATCH");

  assert.equal((await verifierFor(proofPayload(3, 0)).verify({
    fixture,
    finalRecord: finalScoreRecord(),
    observedScore: { home: 1, away: 2 },
  })).failureCode, "SCOREBOARD_MISMATCH");
});

test("false on-chain views and non-final records never release settlement", async () => {
  const rejected = await verifierFor(proofPayload(2, 1), { validate: async () => false }).verify({
    fixture,
    finalRecord: finalScoreRecord(),
    observedScore: { home: 1, away: 2 },
  });
  assert.equal(rejected.failureCode, "ONCHAIN_REJECTED");

  const notFinal = finalScoreRecord();
  notFinal.action = "score_update";
  notFinal.snapshot.lifecycle!.action = "score_update";
  const held = await verifierFor(proofPayload(2, 1)).verify({
    fixture,
    finalRecord: notFinal,
    observedScore: { home: 1, away: 2 },
  });
  assert.equal(held.failureCode, "FINAL_RECORD_REQUIRED");
});

test("daily score PDA is derived from proof time and stays on mainnet", () => {
  const timestamp = Date.UTC(2026, 6, 18, 12);
  const first = deriveDailyScoresRootPda(timestamp);
  const sameDay = deriveDailyScoresRootPda(timestamp + 60_000);
  const nextDay = deriveDailyScoresRootPda(timestamp + 86_400_000);
  assert.equal(first.toBase58(), sameDay.toBase58());
  assert.notEqual(first.toBase58(), nextDay.toBase58());
});

function verifierFor(payload: ReturnType<typeof proofPayload>, onChain: OnChainValidator = { validate: async () => true }) {
  return new TxlineSettlementVerifier({
    fetch: async () => new Response(JSON.stringify(payload), { status: 200 }),
    headers: async () => ({ Authorization: "Bearer test", "X-Api-Token": "test" }),
    refresh: async () => undefined,
    onChain,
    now: () => 1_752_841_000_000,
  });
}

function finalScoreRecord() {
  return normalizeScoreRecord({
    FixtureId: Number(fixture.id),
    Seq: 991,
    Ts: 1_752_840_000_000,
    Action: "game_finalised",
    GameState: "F",
    StatusId: 100,
    Period: 100,
    Participant1IsHome: false,
    Stats: { "1": 2, "2": 1 },
  }, fixture);
}

function proofPayload(participant1: number, participant2: number) {
  const node = () => ({ hash: Array(32).fill(7), isRightSibling: false });
  return {
    summary: {
      fixtureId: Number(fixture.id),
      updateStats: {
        updateCount: 12,
        minTimestamp: 1_752_840_000_000,
        maxTimestamp: 1_752_840_299_999,
      },
      eventStatsSubTreeRoot: Array(32).fill(3),
    },
    subTreeProof: [node()],
    mainTreeProof: [node()],
    eventStatRoot: Array(32).fill(4),
    statsToProve: [
      { key: 1, value: participant1, period: 100 },
      { key: 2, value: participant2, period: 100 },
    ],
    statProofs: [[node()], [node()]],
  };
}
