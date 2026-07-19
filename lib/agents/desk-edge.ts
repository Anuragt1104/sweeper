/**
 * Shared desk-fair → 1X2 order construction for gated specialists.
 * Fair source is always desk-v1; callers only supply edge threshold + size mult + tag.
 */
import {
  makeOrder,
  TAKER_SELECTIONS,
  type AgentContext,
  type Order,
} from "@/lib/agents/types";
import { selId } from "@/lib/market/ids";
import { clamp, deltaToOrder, MIN_TRADE, obsProb } from "@/lib/agents/util";
import type { DeskModelView } from "@/lib/desk/compose";

export function fairForKey(model: DeskModelView, key: string): number | null {
  if (key === "home") return model.fair1x2.home;
  if (key === "away") return model.fair1x2.away;
  if (key === "draw") return model.fair1x2.draw;
  return null;
}

/** Fractional Kelly magnitude from edge vs binary variance proxy. */
export function kellySizeMult(edge: number, fair: number, fraction = 0.3): number {
  const p = clamp(fair, 0.05, 0.95);
  const denom = p * (1 - p);
  if (denom < 1e-4 || Math.abs(edge) < 1e-6) return 0;
  const full = Math.abs(edge) / denom;
  return clamp(full * fraction, 0.55, 2.4);
}

export function deskEdge1x2Orders(opts: {
  agentId: string;
  ctx: AgentContext;
  model: DeskModelView;
  edgeTh: number;
  sizeMult: number;
  tag: string;
  /** When set, blend edge-scale with fractional Kelly instead of pure |edge|/edgeTh. */
  useKelly?: boolean;
  maxClamp?: number;
  includeDraw?: boolean;
}): Order[] {
  const { agentId, ctx, model, edgeTh, sizeMult, tag, useKelly, includeDraw } = opts;
  const maxClamp = opts.maxClamp ?? 3;
  const base = ctx.cfg.execution.baseSize;
  const orders: Order[] = [];

  for (const s of TAKER_SELECTIONS) {
    if (s.marketType !== "match_result") continue;
    if (s.key === "draw" && !includeDraw) continue;
    const obs = obsProb(ctx.tick, s.marketType, s.key);
    if (obs == null) continue;
    const fair = fairForKey(model, s.key);
    if (fair == null) continue;
    const id = selId(s.marketType, s.key);
    const edge = fair - obs;
    const cur = ctx.book.net(id);

    let desired = 0;
    if (Math.abs(edge) >= edgeTh) {
      const edgeScale = clamp(Math.abs(edge) / edgeTh, 1, maxClamp);
      const scale = useKelly
        ? edgeScale * (0.65 + 0.45 * (kellySizeMult(edge, fair) / 1.4))
        : edgeScale;
      desired = Math.sign(edge) * base * sizeMult * scale;
    } else if (Math.abs(edge) >= edgeTh * 0.35) {
      desired = cur;
    }

    const d = deltaToOrder(cur, desired, MIN_TRADE);
    if (!d) continue;
    orders.push(
      makeOrder(
        agentId,
        ctx.tick,
        s.marketType,
        s.key,
        id,
        d.side,
        obs,
        d.size,
        `${d.side} ${d.size} ${s.key}: ${tag} · desk edge ${(edge * 100).toFixed(1)}pp`,
      ),
    );
  }
  return orders;
}

/** Flatten residual 1X2 inventory toward zero. */
export function flatten1x2Orders(agentId: string, ctx: AgentContext): Order[] {
  const orders: Order[] = [];
  for (const s of TAKER_SELECTIONS) {
    if (s.marketType !== "match_result") continue;
    const id = selId(s.marketType, s.key);
    const cur = ctx.book.net(id);
    const d = deltaToOrder(cur, 0, MIN_TRADE);
    if (!d) continue;
    const price = obsProb(ctx.tick, s.marketType, s.key);
    if (price == null) continue;
    orders.push(
      makeOrder(agentId, ctx.tick, s.marketType, s.key, id, d.side, price, d.size, `flatten ${s.key}`),
    );
  }
  return orders;
}
