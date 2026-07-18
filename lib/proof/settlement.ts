/**
 * Settlement guardrail — proof-backed resolution of traded markets.
 *
 * At full-time the engine settles every position to its payout. But it refuses
 * to do so unless two conditions hold:
 *   1. the match has actually reached a terminal phase, and
 *   2. the settlement-relevant stats are backed by a verifiable proof.
 *
 * In simulation the proof is synthesized from the session ledger root and marked
 * verified. In live mode the receipt carries the exact TxLINE stat-validation
 * endpoint and composite stat keys (period*1000 + baseKey) needed to fetch the
 * three-stage Merkle proof; if that proof is missing or fails to verify the
 * engine raises SETTLEMENT_HOLD and does NOT release PnL. This is the
 * difference between "the score says X" and "X is cryptographically settleable".
 */
import { GamePhase, type Fixture } from "@/lib/txline/types";
import { selId } from "@/lib/market/ids";
import type { TxlineSettlementProof } from "@/lib/proof/txline-settlement-verifier";

export interface FinalScore {
  home: number;
  away: number;
}

export type SettlementStatus = "settled" | "hold";

export interface StatProofRef {
  source: "simulation" | "txline";
  /** live endpoint that returns the three-stage Merkle proof. */
  endpoint?: string;
  /** TxLINE composite stat keys: period*1000 + baseKey (1=home goals, 2=away goals). */
  statKeys: number[];
  /** session ledger root the receipt is bound to. */
  root: string;
  verified: boolean;
  note: string;
}

export interface ResolvedMarket {
  marketType: string;
  resolvedKey: string;
  detail: string;
}

export interface SettlementReceipt {
  fixtureId: string;
  match: string;
  finalScore: FinalScore;
  phaseTerminal: boolean;
  status: SettlementStatus;
  reason?: string;
  outcomes: Record<string, 0 | 1>;
  resolved: ResolvedMarket[];
  proof: StatProofRef;
  txlineSettlementProof?: TxlineSettlementProof | null;
}

const TOTAL_LINE = 2.5;

/** Outcome map (1 winner / 0 loser) for every selection agents can trade. */
export function computeOutcomes(score: FinalScore): Record<string, 0 | 1> {
  const total = score.home + score.away;
  const homeWin = score.home > score.away;
  const draw = score.home === score.away;
  const awayWin = score.away > score.home;
  return {
    [selId("match_result", "home")]: bit(homeWin),
    [selId("match_result", "draw")]: bit(draw),
    [selId("match_result", "away")]: bit(awayWin),
    [selId("total_goals", "over")]: bit(total > TOTAL_LINE),
    [selId("total_goals", "under")]: bit(total < TOTAL_LINE),
  };
}

export function isTerminal(phase: GamePhase): boolean {
  return phase === GamePhase.FullTime || phase === GamePhase.Finished;
}

export function buildSettlement(
  fixture: Fixture,
  score: FinalScore,
  phase: GamePhase,
  ledgerRoot: string,
  mode: "simulation" | "live",
  liveProofVerified = false,
): SettlementReceipt {
  const terminal = isTerminal(phase);
  const outcomes = computeOutcomes(score);
  const total = score.home + score.away;
  const mr = outcomes[selId("match_result", "home")] ? "home" : outcomes[selId("match_result", "draw")] ? "draw" : "away";

  const proof: StatProofRef =
    mode === "live"
      ? {
          source: "txline",
          endpoint: `/api/scores/stat-validation?fixtureId=${fixture.id}&statKey=1&statKey2=2`,
          statKeys: [1, 2],
          root: ledgerRoot,
          verified: liveProofVerified,
          note: liveProofVerified
            ? "TxLINE three-stage stat proof verified against the daily on-chain root."
            : "Awaiting TxLINE stat-validation proof — settlement held.",
        }
      : {
          source: "simulation",
          statKeys: [1, 2],
          root: ledgerRoot,
          verified: true,
          note: "Simulated deterministic settlement; proof bound to the session ledger root.",
        };

  const proofOk = mode === "live" ? liveProofVerified : true;
  const status: SettlementStatus = terminal && proofOk ? "settled" : "hold";
  const reason = !terminal
    ? `Match not terminal (phase ${phase}); settlement held.`
    : !proofOk
      ? "Stat proof not verified; settlement held."
      : undefined;

  return {
    fixtureId: fixture.id,
    match: `${fixture.home.name} v ${fixture.away.name}`,
    finalScore: score,
    phaseTerminal: terminal,
    status,
    reason,
    outcomes,
    resolved: [
      { marketType: "match_result", resolvedKey: mr, detail: `${score.home}-${score.away}` },
      {
        marketType: "total_goals",
        resolvedKey: total > TOTAL_LINE ? "over" : "under",
        detail: `${total} goals vs ${TOTAL_LINE} line`,
      },
    ],
    proof,
  };
}

function bit(b: boolean): 0 | 1 {
  return b ? 1 : 0;
}
