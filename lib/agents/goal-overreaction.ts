/**
 * Goal Overreaction Scalp — after a goal, wait for the chaotic snap to cool,
 * then fade obs toward desk fair inside a short post-goal window.
 *
 * Gate = MatchIntensity.scoreJustChanged (+ cool-off). Price = desk-v1 only.
 */
import {
  standDownDecision,
  type Agent,
  type AgentContext,
  type Decision,
} from "@/lib/agents/types";
import { classifyRegime, regimeBlocksDirectional } from "@/lib/agents/regime";
import { deskEdge1x2Orders } from "@/lib/agents/desk-edge";
import { DESK_WEIGHTS } from "@/lib/desk/weights";

const COOL_MIN = 0.75;
const WINDOW_MIN = 5.0;

export class GoalOverreactionAgent implements Agent {
  readonly id = "goal_overreaction";
  readonly name = "Goal Overreaction";
  readonly kind = "event_shock";
  readonly blurb =
    "Fades post-goal book overshoot toward desk fair after a short cool-off.";
  readonly mode = "taker" as const;

  private armedGoalMinute: number | null = null;
  private windowStartMinute: number | null = null;

  reset() {
    this.armedGoalMinute = null;
    this.windowStartMinute = null;
  }

  onTick(ctx: AgentContext): Decision {
    const { tick, cfg, desk } = ctx;
    if (ctx.readiness && !ctx.readiness.ready) {
      return standDownDecision(this.id, tick, ctx.readiness.reasons);
    }
    const model = desk?.model;
    if (!model?.ready) {
      return standDownDecision(this.id, tick, ["desk model not ready"]);
    }

    const intensity = desk?.intensity ?? null;
    const goalMin = intensity?.lastGoalMinute ?? null;
    if (
      intensity?.scoreJustChanged &&
      goalMin != null &&
      goalMin !== this.armedGoalMinute
    ) {
      this.armedGoalMinute = goalMin;
      this.windowStartMinute = tick.minute;
    }

    const age =
      this.windowStartMinute != null ? tick.minute - this.windowStartMinute : null;
    const cooling = age != null && age < COOL_MIN;
    const inWindow = age != null && age >= COOL_MIN && age <= WINDOW_MIN;

    if (!inWindow) {
      if (this.windowStartMinute != null && age != null && age > WINDOW_MIN) {
        this.windowStartMinute = null;
      }
      return {
        agentId: this.id,
        seq: tick.seq,
        tsMs: tick.tsMs,
        orders: [],
        quotes: [],
        rationale: cooling
          ? `Post-goal cool-off · ${(COOL_MIN - (age ?? 0)).toFixed(1)}′ left`
          : "Waiting for post-goal window",
        kind: "hold",
        drivingInputs: {
          hybridProb: model.fairHome,
          tempoIntensity: desk?.tempoIntensity ?? null,
          sentinelKind: cooling ? "goal_cool" : "goal_idle",
        },
      };
    }

    // Allow trading through brief chaos once cool-off elapsed; still block extreme regime.
    const regime = classifyRegime(desk?.path, cfg);
    if (regime === "chaotic" && age != null && age < COOL_MIN + 1.5) {
      const block = regimeBlocksDirectional(desk?.path, cfg);
      if (block) {
        return {
          ...standDownDecision(this.id, tick, [`still chaotic after goal · ${block}`]),
          kind: "stand_down",
          drivingInputs: { sentinelKind: "goal_chaotic", hybridProb: model.fairHome },
        };
      }
    }

    const edgeTh = Math.max(cfg.strategy.valueEdge * 0.8, DESK_WEIGHTS.modelEdgeFloor);
    const strength = intensity?.goalsLast10Min && intensity.goalsLast10Min >= 2 ? 1.15 : 1.0;
    const orders = deskEdge1x2Orders({
      agentId: this.id,
      ctx,
      model,
      edgeTh,
      sizeMult: strength,
      tag: `goal fade @+${age?.toFixed(1)}′`,
      maxClamp: 2.6,
    });

    return {
      agentId: this.id,
      seq: tick.seq,
      tsMs: tick.tsMs,
      orders,
      quotes: [],
      rationale: orders.length
        ? orders.map((o) => o.rationale).join("; ")
        : `Post-goal window open · no desk overshoot`,
      kind: orders.length ? "trade" : "hold",
      drivingInputs: {
        hybridProb: model.fairHome,
        tempoIntensity: desk?.tempoIntensity ?? null,
        sentinelKind: `goal_${intensity?.lastScorer ?? "fade"}`,
      },
    };
  }
}
