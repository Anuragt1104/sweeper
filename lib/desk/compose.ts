/**
 * Compose the desk pricing model agents trade against.
 * Fair 1X2 = score-state prior ⊕ hybrid tilt ⊕ (optional) Horizon-mapped tilt.
 */
import type { MarketTick } from "@/lib/market/ticks";
import type { HorizonPublication } from "@/lib/horizon/machine";
import type { TempoCounts } from "@/lib/tempo/types";
import { DESK_WEIGHTS, type DeskWeights } from "@/lib/desk/weights";
import { applyTilt1x2, scoreState1x2, type Match1x2 } from "@/lib/desk/score-state";
import { computeHybridLayer, type HybridLayerResult } from "@/lib/desk/hybrid-layer";
import { horizonHazardTo1x2Tilt } from "@/lib/desk/horizon-map";
import { obsProb } from "@/lib/agents/util";

export interface DeskModelView {
  /** Our fair 1X2 (score-state + hybrid ± horizon map). */
  fair1x2: Match1x2;
  /** Score-state only (no hybrid / horizon). */
  scoreState1x2: Match1x2;
  hybrid: HybridLayerResult;
  horizonHomeTilt: number;
  horizonDrive: "goal_home" | "goal_away" | null;
  /** Convenience: fair home used by UI legacy hybridThesisProb field. */
  fairHome: number;
  edgeVsObs: { home: number; draw: number; away: number };
  weightsVersion: "desk-v1";
  ready: boolean;
  detail: string;
}

export interface ComposeDeskModelInput {
  tick: MarketTick;
  horizon: HorizonPublication | null;
  tempo: TempoCounts | null;
  /** Home implied ~3′ ago for signed velocity. */
  homeProbPrior: number | null;
  markerSeverities?: number[];
  /** Include Horizon-mapped tilt in fair (Hybrid Thesis / full desk). */
  includeHorizonMap?: boolean;
  weights?: DeskWeights;
}

export function composeDeskModel(input: ComposeDeskModelInput): DeskModelView {
  const weights = input.weights ?? DESK_WEIGHTS;
  const base = scoreState1x2(input.tick.minute, input.tick.score, weights);
  const homeObs = obsProb(input.tick, "match_result", "home");
  const drawObs = obsProb(input.tick, "match_result", "draw");
  const awayObs = obsProb(input.tick, "match_result", "away");

  const hybrid = computeHybridLayer(
    {
      tempo: input.tempo,
      homeProb: homeObs ?? null,
      homeProbPrior: input.homeProbPrior,
      markerSeverities: input.markerSeverities,
    },
    weights,
  );

  const hz = horizonHazardTo1x2Tilt(
    input.includeHorizonMap === false ? null : input.horizon,
    input.tick.minute,
    weights,
  );

  // Blend score-state toward (obs + hybrid tilt) so we respect live book information
  // without treating the book as oracle fair.
  const alpha = weights.hybridBlendAlpha;
  const obsHome = homeObs ?? base.home;
  const blendedBase = {
    home: (1 - alpha) * base.home + alpha * obsHome,
    draw: (1 - alpha) * base.draw + alpha * (drawObs ?? base.draw),
    away: (1 - alpha) * base.away + alpha * (awayObs ?? base.away),
  };
  // Renormalize after blend
  const sum = blendedBase.home + blendedBase.draw + blendedBase.away;
  const normBase: Match1x2 = {
    home: blendedBase.home / sum,
    draw: blendedBase.draw / sum,
    away: blendedBase.away / sum,
  };

  const totalTilt = hybrid.homeTilt + hz.homeTilt;
  const fair1x2 = applyTilt1x2(normBase, totalTilt);

  const edgeVsObs = {
    home: homeObs != null ? fair1x2.home - homeObs : 0,
    draw: drawObs != null ? fair1x2.draw - drawObs : 0,
    away: awayObs != null ? fair1x2.away - awayObs : 0,
  };

  const ready = homeObs != null && drawObs != null && awayObs != null;

  return {
    fair1x2,
    scoreState1x2: base,
    hybrid,
    horizonHomeTilt: hz.homeTilt,
    horizonDrive: hz.drive,
    fairHome: fair1x2.home,
    edgeVsObs,
    weightsVersion: "desk-v1",
    ready,
    detail: ready
      ? `desk-v1 · hybrid tilt ${(hybrid.homeTilt * 100).toFixed(1)}pp · hz ${(hz.homeTilt * 100).toFixed(1)}pp`
      : "desk-v1 · waiting for 1X2",
  };
}
