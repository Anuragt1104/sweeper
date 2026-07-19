/**
 * Stale → Reopen Sniper — when the book reopens (or a stale line snaps),
 * fade prints that sit far from robust reference / desk fair for a short window.
 */
import {
  makeOrder,
  standDownDecision,
  TAKER_SELECTIONS,
  type Agent,
  type AgentContext,
  type Decision,
  type Order,
} from "@/lib/agents/types";
import { selId } from "@/lib/market/ids";
import { clamp, deltaToOrder, MIN_TRADE, obsProb, referenceProb } from "@/lib/agents/util";
import { fairForKey } from "@/lib/agents/desk-edge";

const WINDOW_MIN = 3.5;
const EDGE_FLOOR = 0.035;

export class StaleReopenAgent implements Agent {
  readonly id = "stale_reopen";
  readonly name = "Stale Reopen";
  readonly kind = "microstructure";
  readonly blurb =
    "After suspend→reopen (or stale clear), fades misprints toward consensus / desk fair.";
  readonly mode = "taker" as const;

  private windowUntil: number | null = null;
  private lastReopenSeq = -1;

  reset() {
    this.windowUntil = null;
    this.lastReopenSeq = -1;
  }

  onTick(ctx: AgentContext): Decision {
    const { tick, cfg, assessment, desk } = ctx;
    if (ctx.readiness && !ctx.readiness.ready) {
      return standDownDecision(this.id, tick, ctx.readiness.reasons);
    }
    if (tick.suspended) {
      return {
        agentId: this.id,
        seq: tick.seq,
        tsMs: tick.tsMs,
        orders: [],
        quotes: [],
        rationale: "Book suspended — waiting for reopen",
        kind: "hold",
        drivingInputs: { sentinelKind: "suspended" },
      };
    }

    const reopen = assessment.signals.find((s) => s.kind === "reopened");
    if (reopen && reopen.seq !== this.lastReopenSeq) {
      this.lastReopenSeq = reopen.seq;
      this.windowUntil = tick.minute + WINDOW_MIN;
    }
    // Stale clears that coincide with large outlier prints also arm the window.
    const staleOutlier = assessment.signals.find(
      (s) => s.kind === "outlier_print" && (s.evidence.msSinceChange ?? 0) > cfg.sentinel.staleMs * 0.5,
    );
    if (staleOutlier && this.windowUntil == null) {
      this.windowUntil = tick.minute + WINDOW_MIN * 0.7;
    }

    const inWindow = this.windowUntil != null && tick.minute <= this.windowUntil;
    if (!inWindow) {
      if (this.windowUntil != null && tick.minute > this.windowUntil) this.windowUntil = null;
      return {
        agentId: this.id,
        seq: tick.seq,
        tsMs: tick.tsMs,
        orders: [],
        quotes: [],
        rationale: "Waiting for reopen / stale-clear window",
        kind: "hold",
        drivingInputs: { sentinelKind: "reopen_idle" },
      };
    }

    const base = cfg.execution.baseSize;
    const model = desk?.model;
    const orders: Order[] = [];

    for (const s of TAKER_SELECTIONS) {
      if (s.marketType !== "match_result" && s.marketType !== "total_goals") continue;
      const obs = obsProb(tick, s.marketType, s.key);
      if (obs == null) continue;
      const ref =
        s.marketType === "match_result" && model?.ready
          ? fairForKey(model, s.key)
          : referenceProb(tick, s.marketType, s.key);
      if (ref == null) continue;
      const edge = ref - obs; // positive ⇒ buy (underpriced vs consensus)
      if (Math.abs(edge) < EDGE_FLOOR) continue;

      const id = selId(s.marketType, s.key);
      const desired =
        Math.sign(edge) * base * 0.85 * clamp(Math.abs(edge) / EDGE_FLOOR, 1, 2.2);
      const d = deltaToOrder(ctx.book.net(id), desired, MIN_TRADE);
      if (!d) continue;
      orders.push(
        makeOrder(
          this.id,
          tick,
          s.marketType,
          s.key,
          id,
          d.side,
          obs,
          d.size,
          `${d.side} ${d.size} ${s.key}: reopen fade ${(edge * 100).toFixed(1)}pp vs consensus`,
        ),
      );
    }

    const remaining = (this.windowUntil ?? tick.minute) - tick.minute;
    return {
      agentId: this.id,
      seq: tick.seq,
      tsMs: tick.tsMs,
      orders,
      quotes: [],
      rationale: orders.length
        ? orders.map((o) => o.rationale).join("; ")
        : `Reopen window · ${remaining.toFixed(1)}′ left · no misprint`,
      kind: orders.length ? "trade" : "hold",
      drivingInputs: {
        sentinelKind: "reopened",
        hybridProb: model?.fairHome ?? null,
      },
      signalIds: assessment.signals.filter((s) => s.kind === "reopened" || s.kind === "outlier_print").map((s) => s.id),
    };
  }
}
