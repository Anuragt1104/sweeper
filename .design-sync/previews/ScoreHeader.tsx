import { ScoreHeader } from 'sweeper';

const live = {
  status: 'running' as const,
  mode: 'simulation' as const,
  quality: 78,
  fixture: { home: 'Argentina', away: 'France', stage: 'Final', competition: 'World Cup' },
  progress: { tick: 412, total: 540, pct: 76 },
  current: {
    homeGoals: 2,
    awayGoals: 2,
    clock: "78'",
    phaseLabel: 'Second half',
    suspended: false,
  },
};

/** A live final, healthy market quality. */
export function Live() {
  return <ScoreHeader state={live} />;
}

/** Market suspended mid-match with an injected anomaly — degraded quality. */
export function Suspended() {
  return (
    <ScoreHeader
      state={{
        ...live,
        quality: 41,
        current: { ...live.current, suspended: true, anomaly: 'outlier_print', clock: "58'", phaseLabel: 'Second half' },
      }}
    />
  );
}
