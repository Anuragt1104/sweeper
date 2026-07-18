/**
 * Hybrid Thesis — trades full-match 1X2 using desk-model fair only.
 *
 * Horizon hazards are mapped to 1X2 tilts inside composeDeskModel (never compared
 * raw class P to 1X2). Edge = model.fair − observed.
 */
import {
  makeOrder,
  standDownDecision,
  type Agent,
  type AgentContext,
  type Decision,
  type Order,
} from "@/lib/agents/types";
import { regimeBlocksDirectional } from "@/lib/agents/regime";
import { selId } from "@/lib/market/ids";
import { clamp, deltaToOrder, MIN_TRADE, obsProb } from "@/lib/agents/util";
import { DESK_WEIGHTS } from "@/lib/desk/weights";
import type { OddsMarketType } from "@/lib/txline/types";

export class HybridThesisAgent implements Agent {
  readonly id = "hybrid_thesis";
  readonly name = "Hybrid Thesis";
  readonly kind = "hybrid_thesis";
  readonly blurb =
    "Trades 1X2 vs desk-v1 fair (score-state ⊕ hybrid ⊕ Horizon-mapped tilt).";
  readonly mode = "taker" as const;

  reset() {}

  onTick(ctx: AgentContext): Decision {
    const { tick, cfg, desk } = ctx;
    if (ctx.readiness && !ctx.readiness.ready) {
      return {
        ...standDownDecision(this.id, tick, ctx.readiness.reasons),
        kind: "stand_down",
        drivingInputs: deskInputs(desk),
      };
    }

    const model = desk?.model;
    if (!model?.ready) {
      return flattenOrStandDown(this.id, ctx, ["desk model not ready"], desk);
    }

    const regimeBlock = regimeBlocksDirectional(desk?.path, cfg);
    if (regimeBlock) return flattenOrStandDown(this.id, ctx, [regimeBlock], desk);

    if (!desk?.horizon) {
      return flattenOrStandDown(this.id, ctx, ["no open Horizon"], desk);
    }

    const collapse = desk.lastCollapse;
    if (collapse && (collapse.surprise || collapse.thesisDead)) {
      const age = desk.path?.minutesSinceCollapse ?? tick.minute - collapse.minute;
      if (age >= 0 && age <= cfg.strategy.hybridThesisCollapseCooldownMin) {
        return flattenOrStandDown(
          this.id,
          ctx,
          [
            collapse.surprise
              ? `post-SURPRISE cooldown (${collapse.winner})`
              : `post-THESIS DEAD cooldown (${collapse.winner})`,
          ],
          desk,
        );
      }
    }

    const drive = model.horizonDrive;
    if (!drive) {
      return flattenOrStandDown(
        this.id,
        ctx,
        [`THESIS ${desk.horizon.thesis} / ACTION ${desk.horizon.action} — no directional map`],
        desk,
      );
    }

    // Path confirm for Quiet→ACTION-mapped drives.
    const thesis = desk.horizon.thesis;
    if (thesis === "quiet" && cfg.strategy.hybridThesisRequireMaterialOrSlope) {
      const slopeOk = (desk.path?.hybridSlope5 ?? 0) > 0.002;
      const pressureRising = (desk.path?.pressureDelta5 ?? 0) > 0.04;
      const tempoRising = (desk.path?.tempoAccel3 ?? 0) > 0.05;
      const pathConfirm =
        slopeOk ||
        (pressureRising && tempoRising) ||
        Boolean(desk.path?.tempoOddsDivergence) ||
        Math.abs(model.hybrid.homeTilt) >= 0.01;
      if (!pathConfirm) {
        return flattenOrStandDown(
          this.id,
          ctx,
          ["Quiet map without path/hybrid confirmation"],
          desk,
        );
      }
    }

    const target = thesisToSelection(drive);
    if (!target) return flattenOrStandDown(this.id, ctx, ["no selection map"], desk);

    const obs = obsProb(tick, target.marketType, target.key);
    if (obs == null) {
      return flattenOrStandDown(this.id, ctx, [`missing ${target.marketType}/${target.key}`], desk);
    }

    const fair =
      target.key === "home"
        ? model.fair1x2.home
        : target.key === "away"
          ? model.fair1x2.away
          : model.fair1x2.draw;
    let edge = fair - obs;

    const path = desk.path;
    if (drive === "goal_home" && (path?.homeRet5 ?? 0) < -0.055) {
      return flattenOrStandDown(this.id, ctx, ["home path −5′ strongly against"], desk);
    }
    if (drive === "goal_away" && (path?.homeRet5 ?? 0) > 0.055) {
      return flattenOrStandDown(this.id, ctx, ["home path +5′ strongly against away"], desk);
    }

    const edgeFloor = Math.max(cfg.strategy.hybridThesisEdge, DESK_WEIGHTS.modelEdgeFloor);
    if (edge < edgeFloor) {
      return {
        agentId: this.id,
        seq: tick.seq,
        tsMs: tick.tsMs,
        orders: [],
        quotes: [],
        rationale: `Hold · desk fair ${(fair * 100).toFixed(0)}% vs book ${(obs * 100).toFixed(0)}% (edge ${(edge * 100).toFixed(1)}pp)`,
        kind: "hold",
        drivingInputs: {
          ...deskInputs(desk),
          horizonThesis: drive,
          hybridProb: model.fairHome,
        },
      };
    }

    const id = selId(target.marketType, target.key);
    const base = cfg.execution.baseSize * cfg.strategy.hybridThesisSizeMult;
    const pathVolPenalty =
      path?.homePathVol != null ? clamp(1 - path.homePathVol * 10, 0.45, 1) : 1;
    const calmBump = (path?.homePathVol ?? 1) <= cfg.strategy.pathVolCalm ? 1.15 : 1;
    const materialBump = thesis === "goal_home" || thesis === "goal_away" ? 1.15 : 0.75;
    const scale =
      clamp(edge / edgeFloor, 1, 2.0) * pathVolPenalty * calmBump * materialBump;
    const desired = base * scale * (1 + 0.15 * model.hybrid.pressure);
    const cur = ctx.book.net(id);
    const d = deltaToOrder(cur, desired, MIN_TRADE);
    const orders: Order[] = [];
    if (d) {
      orders.push(
        makeOrder(
          this.id,
          tick,
          target.marketType,
          target.key,
          id,
          d.side,
          obs,
          d.size,
          `${d.side} ${d.size} ${target.key}: desk fair ${(fair * 100).toFixed(0)}% vs ${(obs * 100).toFixed(0)}% · edge ${(edge * 100).toFixed(1)}pp · ${model.detail}`,
        ),
      );
    }

    return {
      agentId: this.id,
      seq: tick.seq,
      tsMs: tick.tsMs,
      orders,
      quotes: [],
      rationale: orders.length
        ? orders.map((o) => o.rationale).join("; ")
        : `Hold · already sized for ${drive}`,
      kind: orders.length ? "trade" : "hold",
      drivingInputs: {
        horizonThesis: drive,
        hybridProb: model.fairHome,
        tempoIntensity: model.hybrid.tempoIntensity,
      },
    };
  }
}

function thesisToSelection(
  thesis: "goal_home" | "goal_away",
): { marketType: OddsMarketType; key: string } | null {
  if (thesis === "goal_home") return { marketType: "match_result", key: "home" };
  if (thesis === "goal_away") return { marketType: "match_result", key: "away" };
  return null;
}

function deskInputs(desk: AgentContext["desk"]) {
  if (!desk) return {};
  return {
    horizonThesis: desk.horizon?.thesis ?? null,
    hybridProb: desk.model?.fairHome ?? desk.hybridThesisProb,
    tempoIntensity: desk.model?.hybrid.tempoIntensity ?? desk.tempoIntensity,
  };
}

function flattenOrStandDown(
  agentId: string,
  ctx: AgentContext,
  reasons: string[],
  desk: AgentContext["desk"],
): Decision {
  const { tick } = ctx;
  const orders: Order[] = [];
  for (const key of ["home", "away"] as const) {
    const id = selId("match_result", key);
    const net = ctx.book.net(id);
    if (Math.abs(net) < MIN_TRADE) continue;
    const price = obsProb(tick, "match_result", key);
    if (price == null) continue;
    const d = deltaToOrder(net, 0, MIN_TRADE);
    if (!d) continue;
    orders.push(
      makeOrder(
        agentId,
        tick,
        "match_result",
        key,
        id,
        d.side,
        price,
        d.size,
        `${d.side} ${d.size} ${key}: flatten · ${reasons[0]}`,
      ),
    );
  }
  if (orders.length) {
    return {
      agentId,
      seq: tick.seq,
      tsMs: tick.tsMs,
      orders,
      quotes: [],
      rationale: `Flatten · ${reasons.join("; ")}`,
      kind: "trade",
      drivingInputs: deskInputs(desk),
    };
  }
  return {
    ...standDownDecision(agentId, tick, reasons),
    kind: "stand_down",
    drivingInputs: deskInputs(desk),
  };
}
