import type { Fill } from "@/lib/agents/types";
import type { SweeperEngine } from "@/lib/engine/engine";
import type { ExecutionMode, RunProvenance } from "@/lib/engine/state";
import type { PortfolioMetrics } from "@/lib/execution/portfolio";
import type { LedgerRecord, ProofBundle } from "@/lib/proof/ledger";
import { strategyDesign, type StrategyDesign, type StrategyStance } from "@/lib/strategy-lab/designs";
import type { OddsViewId } from "@/lib/tempo/types";

export interface DecisionEvidenceSelector {
  sessionId: string;
  strategyId: string;
  contract: OddsViewId;
  selector: "latest_decision" | "latest_fill";
}

export type SettlementGuardState = "not_final" | "held" | "verified" | "simulated";

export interface DecisionReceipt {
  provenance: {
    source: "live" | "demo";
    run: RunProvenance;
    executionMode: ExecutionMode;
    sessionId: string;
    fixtureId: string;
  };
  observation: {
    sequence: number;
    timestampMs: number;
    tickHash: string;
    excerpt: unknown;
  };
  analysis: {
    modelVersion: string | null;
    regime: string | null;
    quality: number | null;
    fair1x2: unknown;
    edgeVsBook: unknown;
    horizonTransition: unknown;
  };
  strategy: {
    design: StrategyDesign;
    currentStance: StrategyStance | null;
    decision: LedgerRecord;
    activeGates: string[];
    rationale: string;
  };
  execution: {
    fill: LedgerRecord;
    details: Fill;
    pnlSnapshot: PortfolioMetrics | null;
  } | null;
  decisionProof: ProofBundle & { label: "SWEEPER DECISION PROOF" };
  settlementGuard: {
    label: "TXLINE SETTLEMENT GUARD";
    state: SettlementGuardState;
    detail: string;
  };
}

type DecisionPayload = {
  agentId?: string;
  rationale?: string;
  stoodDown?: boolean;
  orders?: Array<{ marketType?: string }>;
  quotes?: Array<{ marketType?: string }>;
  analysis?: {
    modelVersion?: string;
    regime?: string;
    quality?: number;
    fair1x2?: unknown;
    edgeVsBook?: unknown;
    horizonTransition?: unknown;
  };
};

type FillPayload = Fill & { portfolioAfter?: PortfolioMetrics };

export class DecisionEvidence {
  static async build(engine: SweeperEngine, selector: DecisionEvidenceSelector): Promise<DecisionReceipt> {
    if (selector.sessionId !== engine.sessionId) {
      throw new Error(`Session ${selector.sessionId} does not match active evidence source ${engine.sessionId}`);
    }
    const design = strategyDesign(selector.strategyId);
    if (!design) throw new Error(`Unknown strategy ${selector.strategyId}`);

    const records = engine.getLedger().all();
    const fill = selector.selector === "latest_fill"
      ? latest(records, (record) => {
          if (record.kind !== "fill") return false;
          const payload = record.payload as Partial<FillPayload>;
          return payload.agentId === selector.strategyId && contractForMarket(payload.marketType) === selector.contract;
        })
      : null;
    if (selector.selector === "latest_fill" && !fill) {
      throw new Error(`No ${selector.contract} fill exists for ${selector.strategyId}`);
    }

    const decision = fill
      ? records.find((record) => record.hash === fill.reactedToHash && record.kind === "decision") ?? null
      : latest(records, (record) => {
          if (record.kind !== "decision") return false;
          const payload = record.payload as DecisionPayload;
          if (payload.agentId !== selector.strategyId) return false;
          const markets = [...(payload.orders ?? []), ...(payload.quotes ?? [])];
          return markets.length === 0 || markets.some((item) => contractForMarket(item.marketType) === selector.contract);
        });
    if (!decision) throw new Error(`No decision exists for ${selector.strategyId}`);

    const tick = records.find((record) => record.hash === decision.reactedToHash && record.kind === "tick");
    if (!tick) throw new Error(`Decision ${decision.seq} is not linked to a retained observation`);
    const proof = engine.proof(decision.seq);
    if (!proof) throw new Error(`Decision ${decision.seq} proof record is not retained`);

    const state = engine.getState();
    const payload = decision.payload as DecisionPayload;
    const analysis = payload.analysis;
    const currentStance = state.strategyStances.find(
      (stance) => stance.agentId === selector.strategyId && stance.contract === selector.contract,
    ) ?? null;
    const fillPayload = fill?.payload as FillPayload | undefined;

    return {
      provenance: {
        source: state.provenance === "simulation" ? "demo" : "live",
        run: state.provenance,
        executionMode: state.executionMode,
        sessionId: state.sessionId,
        fixtureId: state.fixture.id,
      },
      observation: {
        sequence: tick.tick,
        timestampMs: tick.tsMs,
        tickHash: tick.hash,
        excerpt: tick.payload,
      },
      analysis: {
        modelVersion: analysis?.modelVersion ?? null,
        regime: analysis?.regime ?? null,
        quality: analysis?.quality ?? null,
        fair1x2: analysis?.fair1x2 ?? null,
        edgeVsBook: analysis?.edgeVsBook ?? null,
        horizonTransition: analysis?.horizonTransition ?? null,
      },
      strategy: {
        design,
        currentStance,
        decision,
        activeGates: payload.stoodDown ? [payload.rationale ?? "Strategy stood down"] : [],
        rationale: payload.rationale ?? decision.summary,
      },
      execution: fill && fillPayload ? {
        fill,
        details: fillPayload,
        pnlSnapshot: fillPayload.portfolioAfter ?? state.agents.find((agent) => agent.id === selector.strategyId)?.metrics ?? null,
      } : null,
      decisionProof: { ...proof, label: "SWEEPER DECISION PROOF" },
      settlementGuard: settlementGuard(state.provenance, state.settlement),
    };
  }
}

function latest(records: LedgerRecord[], predicate: (record: LedgerRecord) => boolean): LedgerRecord | null {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (predicate(records[index])) return records[index];
  }
  return null;
}

function contractForMarket(marketType?: string): OddsViewId | null {
  if (marketType === "match_result") return "match_1x2";
  if (marketType === "total_goals") return "ou_25";
  return null;
}

function settlementGuard(
  provenance: RunProvenance,
  settlement: ReturnType<SweeperEngine["getState"]>["settlement"],
): DecisionReceipt["settlementGuard"] {
  if (!settlement) {
    return {
      label: "TXLINE SETTLEMENT GUARD",
      state: "not_final",
      detail: "No terminal game_finalised record exists; outcome settlement is not released.",
    };
  }
  if (provenance === "simulation") {
    return {
      label: "TXLINE SETTLEMENT GUARD",
      state: "simulated",
      detail: "Deterministic simulation receipt only; no TxLINE mainnet outcome proof is claimed.",
    };
  }
  if (settlement.status === "hold" || !settlement.txlineSettlementProof) {
    return {
      label: "TXLINE SETTLEMENT GUARD",
      state: "held",
      detail: settlement.reason ?? "Mainnet settlement is held until TxLINE stat validation succeeds.",
    };
  }
  return {
    label: "TXLINE SETTLEMENT GUARD",
    state: "verified",
    detail: "TxLINE mainnet outcome proof verified; settlement guard released.",
  };
}
