/**
 * Shock Fade — red-card panic and equalizer emotion.
 * Uses MatchIntensity.redCardActive / isComeback as gates; prices from desk-v1 only.
 */
import {
  standDownDecision,
  type Agent,
  type AgentContext,
  type Decision,
} from "@/lib/agents/types";
import { deskEdge1x2Orders } from "@/lib/agents/desk-edge";
import { DESK_WEIGHTS } from "@/lib/desk/weights";
import type { MatchIntensity } from "@/lib/desk/match-intensity";

export class ShockFadeAgent implements Agent {
  readonly id = "shock_fade";
  readonly name = "Shock Fade";
  readonly kind = "event_shock";
  readonly blurb =
    "Fades red-card panic and comeback emotion toward desk fair while the shock window is open.";
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

    const gate = shockGate(desk?.intensity ?? null, tick.score?.goals ?? null);
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
          sentinelKind: "shock_quiet",
        },
      };
    }

    // Shock fades intentionally trade through elevated vol — only hard-block extreme chaos.
    const pathVol = desk?.path?.homePathVol;
    if (pathVol != null && pathVol >= cfg.strategy.pathVolChaotic * 1.35) {
      return standDownDecision(this.id, tick, [
        `extreme chaos · path vol ${(pathVol * 100).toFixed(2)}pp`,
      ]);
    }

    const edgeTh = Math.max(cfg.strategy.valueEdge * 0.65, DESK_WEIGHTS.modelEdgeFloor * 0.9);
    const orders = deskEdge1x2Orders({
      agentId: this.id,
      ctx,
      model,
      edgeTh,
      sizeMult: gate.strength,
      tag: gate.label,
      maxClamp: 2.8,
      includeDraw: gate.label.startsWith("comeback"),
    });

    return {
      agentId: this.id,
      seq: tick.seq,
      tsMs: tick.tsMs,
      orders,
      quotes: [],
      rationale: orders.length
        ? orders.map((o) => o.rationale).join("; ")
        : `Shock open (${gate.label}) · no desk edge`,
      kind: orders.length ? "trade" : "hold",
      drivingInputs: {
        hybridProb: model.fairHome,
        sentinelKind: gate.label,
        tempoIntensity: desk?.tempoIntensity ?? null,
      },
    };
  }
}

function shockGate(
  intensity: MatchIntensity | null,
  goals?: { home: number; away: number } | null,
): { open: boolean; strength: number; label: string; reason: string } {
  if (!intensity) {
    return { open: false, strength: 0, label: "quiet", reason: "Waiting for red-card or comeback shock" };
  }
  if (intensity.redCardActive) {
    const fresh = intensity.cardsLast5Min > 0 || intensity.majorEvent || intensity.scoreJustChanged;
    return {
      open: true,
      strength: fresh ? 1.25 : 1.0,
      label: fresh ? "red-card fade" : "red-card state",
      reason: "",
    };
  }
  if (intensity.isComeback && intensity.scoreJustChanged) {
    return {
      open: true,
      strength: 1.15,
      label: "comeback fade",
      reason: "",
    };
  }
  // Open-game emotion: both sides on the board and a fresh goal — not pure post-goal
  // scalp (that is Goal Overreaction); this fades the emotional premium on the board.
  const openGame =
    intensity.scoreJustChanged &&
    goals != null &&
    goals.home > 0 &&
    goals.away > 0;
  if (openGame) {
    return {
      open: true,
      strength: 1.05,
      label: "open-game fade",
      reason: "",
    };
  }
  if (intensity.cardsLast5Min >= 2) {
    return {
      open: true,
      strength: 0.9,
      label: "card flurry",
      reason: "",
    };
  }
  return {
    open: false,
    strength: 0,
    label: "quiet",
    reason: "Waiting for red-card, comeback, or open-game shock",
  };
}
