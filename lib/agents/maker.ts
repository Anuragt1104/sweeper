/**
 * Market maker — quotes around desk-model fair (not privileged sim reference).
 */
import {
  MAKER_SELECTIONS,
  standDownDecision,
  type Agent,
  type AgentContext,
  type Decision,
  type Quote,
} from "@/lib/agents/types";
import { selId } from "@/lib/market/ids";
import { clamp, volOf } from "@/lib/agents/util";
import { classifyRegime } from "@/lib/agents/regime";

const QUALITY_PULL = 40;

export class MarketMakerAgent implements Agent {
  readonly id = "maker";
  readonly name = "Market Maker";
  readonly kind = "maker";
  readonly blurb = "Quotes around desk-v1 fair; sentinel widens/pulls; regime-aware.";
  readonly mode = "maker" as const;

  reset() {}

  onTick(ctx: AgentContext): Decision {
    const { tick, cfg, assessment, features, desk } = ctx;
    if (ctx.readiness && !ctx.readiness.ready) {
      return standDownDecision(this.id, tick, ctx.readiness.reasons);
    }
    const model = desk?.model;
    if (!model?.ready) {
      return standDownDecision(this.id, tick, ["desk model not ready"]);
    }

    const exec = cfg.execution;
    const quotes: Quote[] = [];
    const pulledReasons: string[] = [];
    const regime = classifyRegime(desk?.path, cfg);
    const regimeWiden = regime === "chaotic" ? 1.45 : regime === "calm" ? 0.92 : 1;

    const globalPull = tick.suspended || assessment.quality < QUALITY_PULL;
    if (globalPull) {
      pulledReasons.push(tick.suspended ? "book suspended" : `quality ${assessment.quality}`);
    }

    for (const s of MAKER_SELECTIONS) {
      if (s.marketType !== "match_result") continue;
      const id = selId(s.marketType, s.key);
      const fair =
        s.key === "home"
          ? model.fair1x2.home
          : s.key === "away"
            ? model.fair1x2.away
            : model.fair1x2.draw;

      if (globalPull || assessment.staleSelections.includes(id)) {
        if (!globalPull) pulledReasons.push(`${s.key} stale`);
        continue;
      }

      const vol = volOf(features, s.marketType, s.key);
      let half = exec.mmBaseHalfSpread + exec.mmVolSpreadK * vol;
      half *= 1 + (100 - assessment.quality) / 120;
      half *= regimeWiden;
      half = clamp(half, 0.006, 0.12);

      const net = ctx.book.net(id);
      const skew = clamp(net / exec.mmMaxInventory, -1, 1) * half * 0.8;
      const center = clamp(fair - skew, 0.05, 0.95);

      let bid = clamp(center - half, 0.01, 0.97);
      let ask = clamp(center + half, 0.03, 0.99);
      if (net >= exec.mmMaxInventory) bid = 0.001;
      if (net <= -exec.mmMaxInventory) ask = 0.999;
      if (ask <= bid) ask = clamp(bid + 0.01, 0.03, 0.99);

      quotes.push({
        agentId: this.id,
        marketType: s.marketType,
        selectionKey: s.key,
        selId: id,
        bid: round3(bid),
        ask: round3(ask),
        size: Math.max(4, Math.round(exec.baseSize / 2)),
      });
    }

    const rationale = quotes.length
      ? `Quoting ${quotes.length} lines @ desk fair (q=${assessment.quality}${regime !== "normal" ? ` · ${regime}` : ""})`
      : `Quotes pulled: ${pulledReasons.join(", ") || "no desk fair"}`;
    return {
      agentId: this.id,
      seq: tick.seq,
      tsMs: tick.tsMs,
      orders: [],
      quotes,
      rationale,
      kind: quotes.length ? "quote" : "stand_down",
      stoodDown: quotes.length === 0,
      drivingInputs: { hybridProb: model.fairHome, sentinelKind: regime },
    };
  }
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
