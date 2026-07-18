/**
 * Market maker — quotes two-sided prices around model fair, managed by the
 * sentinel. This is the In-Play Market Maker from the sponsor's idea list, with
 * the sentinel wired into its risk controls:
 *
 *  - spread WIDENS with rolling volatility and as market quality degrades,
 *  - quotes are PULLED entirely when the book is suspended, a line goes stale,
 *    or quality collapses (avoiding adverse selection / toxic flow),
 *  - quotes SKEW against inventory so the book mean-reverts to flat.
 *
 * It earns the spread from uninformed flow and survives informed flow by getting
 * out of the way — which is precisely what the sentinel tells it to do.
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
import { clamp, referenceProb, volOf } from "@/lib/agents/util";

const QUALITY_PULL = 40;

export class MarketMakerAgent implements Agent {
  readonly id = "maker";
  readonly name = "Market Maker";
  readonly kind = "maker";
  readonly blurb = "Quotes around the robust reference; sentinel widens, skews, and pulls shadow quotes.";
  readonly mode = "maker" as const;

  reset() {}

  onTick(ctx: AgentContext): Decision {
    const { tick, cfg, assessment, features } = ctx;
    if (ctx.readiness && !ctx.readiness.ready) return standDownDecision(this.id, tick, ctx.readiness.reasons);
    const exec = cfg.execution;
    const quotes: Quote[] = [];
    const pulledReasons: string[] = [];

    const globalPull = tick.suspended || assessment.quality < QUALITY_PULL;
    if (globalPull) {
      pulledReasons.push(tick.suspended ? "book suspended" : `quality ${assessment.quality}`);
    }

    for (const s of MAKER_SELECTIONS) {
      const id = selId(s.marketType, s.key);
      const fair = referenceProb(tick, s.marketType, s.key);
      if (fair == null) continue;

      if (globalPull || assessment.staleSelections.includes(id)) {
        if (!globalPull) pulledReasons.push(`${s.key} stale`);
        continue; // pull this quote
      }

      const vol = volOf(features, s.marketType, s.key);
      let half = exec.mmBaseHalfSpread + exec.mmVolSpreadK * vol;
      half *= 1 + (100 - assessment.quality) / 120; // widen as quality drops
      half = clamp(half, 0.006, 0.12);

      const net = ctx.book.net(id);
      const skew = clamp(net / exec.mmMaxInventory, -1, 1) * half * 0.8;
      const center = clamp(fair - skew, 0.05, 0.95);

      let bid = clamp(center - half, 0.01, 0.97);
      let ask = clamp(center + half, 0.03, 0.99);
      // inventory caps: stop quoting the side that would breach the limit
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
      ? `Quoting ${quotes.length} lines (q=${assessment.quality})`
      : `Quotes pulled: ${pulledReasons.join(", ") || "no reference price"}`;
    return { agentId: this.id, seq: tick.seq, tsMs: tick.tsMs, orders: [], quotes, rationale };
  }
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
