/**
 * Collapse Fade — after Horizon SURPRISE (or strong THESIS DEAD), fade the
 * settled / overreacted side for a short path window. Scales with surprise
 * severity and local path vol.
 */
import {
  makeOrder,
  standDownDecision,
  type Agent,
  type AgentContext,
  type Decision,
  type Order,
} from "@/lib/agents/types";
import { selId } from "@/lib/market/ids";
import { clamp, deltaToOrder, MIN_TRADE, obsProb } from "@/lib/agents/util";
import type { OddsMarketType } from "@/lib/txline/types";

const FADE_WINDOW_MIN = 5;
const DECAY = 0.62;

export class CollapseFadeAgent implements Agent {
  readonly id = "collapse_fade";
  readonly name = "Collapse Fade";
  readonly kind = "collapse_fade";
  readonly blurb =
    "After Horizon SURPRISE / THESIS DEAD, fades overreacted odds — path-aware mean reversion.";
  readonly mode = "taker" as const;
  private target = new Map<string, { marketType: OddsMarketType; key: string; size: number }>();
  private lastFadeCollapseId: string | null = null;

  reset() {
    this.target.clear();
    this.lastFadeCollapseId = null;
  }

  onTick(ctx: AgentContext): Decision {
    const { tick, cfg, desk } = ctx;
    if (ctx.readiness && !ctx.readiness.ready) {
      return {
        ...standDownDecision(this.id, tick, ctx.readiness.reasons),
        kind: "stand_down",
      };
    }

    for (const [k, v] of this.target) {
      const nv = v.size * DECAY;
      if (Math.abs(nv) < 1) this.target.delete(k);
      else this.target.set(k, { ...v, size: nv });
    }

    const collapse = desk?.lastCollapse ?? null;
    const path = desk?.path;
    const age = path?.minutesSinceCollapse;

    const actionable =
      collapse &&
      (collapse.surprise || collapse.thesisDead) &&
      age != null &&
      age <= FADE_WINDOW_MIN &&
      collapse.id !== this.lastFadeCollapseId;

    if (actionable && collapse) {
      const sel = winnerToSelection(collapse.winner);
      if (sel) {
        const id = selId(sel.marketType, sel.key);
        const settleP = collapse.settlingProbability;
        const severity =
          collapse.surprise
            ? settleP < 0.1
              ? 1.2
              : settleP < 0.18
                ? 1.0
                : 0.75
            : 0.55; // milder fade on THESIS DEAD
        const volBoost =
          path?.homePathVol != null ? clamp(1 + path.homePathVol * 8, 1, 1.25) : 1;
        const size = -cfg.execution.baseSize * 0.75 * severity * volBoost;
        this.target.set(id, { ...sel, size });
        this.lastFadeCollapseId = collapse.id;
      }
    }

    const orders: Order[] = [];
    for (const [id, t] of this.target) {
      const price = obsProb(tick, t.marketType, t.key);
      if (price == null) continue;
      const d = deltaToOrder(ctx.book.net(id), t.size, MIN_TRADE);
      if (!d) continue;
      const tag = collapse?.surprise ? "SURPRISE" : "THESIS DEAD";
      orders.push(
        makeOrder(
          this.id,
          tick,
          t.marketType,
          t.key,
          id,
          d.side,
          price,
          d.size,
          `${d.side} ${d.size} ${t.key}: fade ${tag} ${collapse?.winner ?? "?"} @${age?.toFixed(1) ?? "?"}′`,
        ),
      );
    }

    const inWindow =
      collapse &&
      (collapse.surprise || collapse.thesisDead) &&
      age != null &&
      age <= FADE_WINDOW_MIN;

    if (orders.length === 0 && !inWindow) {
      return {
        agentId: this.id,
        seq: tick.seq,
        tsMs: tick.tsMs,
        orders: [],
        quotes: [],
        rationale: "No open collapse fade window",
        kind: "hold",
        drivingInputs: {
          horizonThesis: path?.lastCollapseWinner ?? null,
          tempoIntensity: desk?.tempoIntensity ?? null,
        },
      };
    }

    return {
      agentId: this.id,
      seq: tick.seq,
      tsMs: tick.tsMs,
      orders,
      quotes: [],
      rationale: orders.length
        ? orders.map((o) => o.rationale).join("; ")
        : "Holding fade inventory",
      kind: orders.length ? "trade" : "hold",
      drivingInputs: {
        horizonThesis: collapse?.winner ?? null,
        hybridProb: desk?.hybridThesisProb ?? null,
      },
    };
  }
}

function winnerToSelection(
  winner: string,
): { marketType: OddsMarketType; key: string } | null {
  if (winner === "goal_home") return { marketType: "match_result", key: "home" };
  if (winner === "goal_away") return { marketType: "match_result", key: "away" };
  return null;
}
