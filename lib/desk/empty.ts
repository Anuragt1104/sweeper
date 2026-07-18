import type { DeskModelView } from "@/lib/desk/compose";

/** Empty model for unit tests that construct DeskSignals by hand. */
export function emptyDeskModel(partial?: Partial<DeskModelView>): DeskModelView {
  const fair = { home: 0.4, draw: 0.28, away: 0.32 };
  return {
    fair1x2: fair,
    scoreState1x2: fair,
    hybrid: {
      homeTilt: 0,
      tempoIntensity: 0,
      tempoDifferential: 0,
      signedOddsVelocityHome: 0,
      pressure: 0,
    },
    horizonHomeTilt: 0,
    horizonDrive: null,
    fairHome: fair.home,
    edgeVsObs: { home: 0, draw: 0, away: 0 },
    weightsVersion: "desk-v1",
    ready: false,
    detail: "empty",
    ...partial,
  };
}
