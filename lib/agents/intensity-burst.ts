/**
 * Intensity Burst — desk-fair taker gated by MatchIntensity / path tempo.
 *
 * Enrichment and intensity never become fair value. They only open a window:
 * when the match is flurrying (goals, cards, red-card state, tempo accel),
 * trade the same desk-v1 edge Value would, with a slightly tighter threshold.
 * Quiet matches → flat. This keeps pricing technically honest while using the
 * new intensity surface the Observation/Analysis rails already show.
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
import { classifyRegime, regimeBlocksDirectional } from "@/lib/agents/regime";
import { selId } from "@/lib/market/ids";
import { clamp, deltaToOrder, MIN_TRADE, obsProb } from "@/lib/agents/util";
import { DESK_WEIGHTS } from "@/lib/desk/weights";
import type { MatchIntensity } from "@/lib/desk/match-intensity";

export class IntensityBurstAgent implements Agent {
  readonly id = "intensity_burst";
  readonly name = "Intensity Burst";
  readonly kind = "intensity";
  readonly blurb =
    "Trades desk fair only during match-intensity windows; enrichment is a gate, never a price.";
  readonly mode = "taker" as const;

  reset() {}

  onTick(ctx: AgentContext): Decision {
    const { tick, cfg, desk } = ctx;
    if (ctx.readiness && !ctx.readiness.ready) {
      return standDownDecision(this.id, tick, ctx.readiness.reasons);
    }
    const model = desk?.model;
    if (!model?.ready) {
      return standDownDecision(this.id, tick, ["desk model not ready"]);
    }
    const regimeBlock = regimeBlocksDirectional(desk?.path, cfg);
    if (regimeBlock) return standDownDecision(this.id, tick, [regimeBlock]);

    const gate = intensityGate(desk?.intensity ?? null, desk?.path?.tempoAccel3 ?? null);
    if (!gate.open) {
      return {
        agentId: this.id,
        seq: tick.seq,
        tsMs: tick.tsMs,
        orders: [],
        quotes: [],
        rationale: gate.reason,
        kind: "hold",
        drivingInputs: {
          hybridProb: model.fairHome,
          tempoIntensity: desk?.tempoIntensity ?? null,
          sentinelKind: "intensity_quiet",
        },
      };
    }

    // Slightly tighter than Value so intensity is the differentiator, not looser edge.
    const edgeTh = Math.max(cfg.strategy.valueEdge * 0.85, DESK_WEIGHTS.modelEdgeFloor);
    const base = cfg.execution.baseSize;
    const regime = classifyRegime(desk?.path, cfg);
    const burstBump = gate.strength * (regime === "chaotic" ? 0.85 : 1.1);
    const orders: Order[] = [];

    for (const s of TAKER_SELECTIONS) {
      if (s.marketType !== "match_result") continue;
      const obs = obsProb(tick, s.marketType, s.key);
      if (obs == null) continue;
      const fair =
        s.key === "home"
          ? model.fair1x2.home
          : s.key === "away"
            ? model.fair1x2.away
            : model.fair1x2.draw;
      const id = selId(s.marketType, s.key);
      const edge = fair - obs;
      const cur = ctx.book.net(id);

      let desired = 0;
      if (Math.abs(edge) >= edgeTh) {
        desired =
          Math.sign(edge) *
          base *
          burstBump *
          clamp(Math.abs(edge) / edgeTh, 1, 2.5);
      } else if (Math.abs(edge) >= edgeTh * 0.4) {
        desired = cur;
      }

      const d = deltaToOrder(cur, desired, MIN_TRADE);
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
          `${d.side} ${d.size} ${s.key}: intensity ${gate.label} · desk edge ${(edge * 100).toFixed(1)}pp`,
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
        : `Intensity open (${gate.label}) · no desk edge`,
      kind: orders.length ? "trade" : "hold",
      drivingInputs: {
        hybridProb: model.fairHome,
        tempoIntensity: desk?.tempoIntensity ?? null,
        sentinelKind: gate.label,
      },
    };
  }
}

function intensityGate(
  intensity: MatchIntensity | null,
  tempoAccel3: number | null,
): { open: boolean; strength: number; label: string; reason: string } {
  if (intensity?.majorEvent) {
    const label = intensity.flurrySummary ?? (intensity.redCardActive ? "red-card" : "major event");
    return { open: true, strength: 1.25, label, reason: "" };
  }
  if (intensity && intensity.goalsLast10Min >= 2) {
    return {
      open: true,
      strength: 1.15,
      label: `${intensity.goalsLast10Min} goals/10′`,
      reason: "",
    };
  }
  if (tempoAccel3 != null && tempoAccel3 >= 0.12) {
    return {
      open: true,
      strength: 1.05,
      label: `tempo accel ${(tempoAccel3 * 100).toFixed(0)}`,
      reason: "",
    };
  }
  return {
    open: false,
    strength: 0,
    label: "quiet",
    reason: "Waiting for intensity window (flurry / cards / tempo accel)",
  };
}
