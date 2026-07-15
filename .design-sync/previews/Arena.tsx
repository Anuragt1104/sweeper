import { Arena } from 'sweeper';

const curveUp = [1000, 1006, 1003, 1012, 1024, 1019, 1031, 1028, 1045, 1052, 1061, 1058, 1072, 1084];
const curveFlat = [1000, 998, 1003, 1001, 1006, 1004, 1009, 1002, 1011, 1008, 1014, 1010, 1018, 1021];
const curveDown = [1000, 1004, 996, 991, 998, 985, 979, 988, 972, 968, 974, 961, 957, 949];
const curveSlow = [1000, 1001, 1000, 1002, 1003, 1002, 1004, 1003, 1005, 1006, 1005, 1007, 1008, 1010];

const agents = [
  {
    id: 'momentum_guarded',
    name: 'Guarded Momentum',
    mode: 'taker' as const,
    lastRationale: 'Sentinel cleared the sharp move @67′ — followed the repricing with full size.',
    curve: curveUp,
    metrics: { equity: 1084, pnl: 84.1, roi: 0.0841, trades: 31, hitRate: 0.58, maxDrawdown: 12.4 },
  },
  {
    id: 'value',
    name: 'Value',
    mode: 'taker' as const,
    lastRationale: 'Fair-prob gap on Over 2.5 exceeded 4% — leaned in, trimmed on convergence.',
    curve: curveFlat,
    metrics: { equity: 1021, pnl: 21.3, roi: 0.0213, trades: 18, hitRate: 0.61, maxDrawdown: 9.1 },
  },
  {
    id: 'maker',
    name: 'Passive Maker',
    mode: 'maker' as const,
    lastRationale: 'Quoted both sides; widened on the stale-line flag, never got run over.',
    curve: curveSlow,
    metrics: { equity: 1010, pnl: 10.4, roi: 0.0104, trades: 44, hitRate: 0.52, maxDrawdown: 4.2 },
  },
  {
    id: 'reversion',
    name: 'Mean Reversion',
    mode: 'taker' as const,
    lastRationale: 'Faded the outlier print @58′ — reverted to the robust reference within 2 ticks.',
    curve: curveFlat,
    metrics: { equity: 1006, pnl: 6.2, roi: 0.0062, trades: 22, hitRate: 0.5, maxDrawdown: 14.7 },
  },
  {
    id: 'momentum_naive',
    name: 'Naive Momentum',
    mode: 'taker' as const,
    lastRationale: 'Chased the same repricing without the sentinel — bought the outlier print.',
    curve: curveDown,
    metrics: { equity: 949, pnl: -51.0, roi: -0.051, trades: 37, hitRate: 0.41, maxDrawdown: 58.3 },
  },
];

/** Five agents ranked by equity; Guarded leads, Naive trails — the sentinel-value story. */
export function Leaderboard() {
  return <Arena agents={agents} leader="momentum_guarded" />;
}

/** Early in a match — agents bunched near the 1000 bankroll, no clear leader yet. */
export function EarlyMatch() {
  const flat = agents.map((a) => ({
    ...a,
    curve: curveSlow,
    metrics: { ...a.metrics, equity: 1000 + a.metrics.pnl * 0.15, pnl: a.metrics.pnl * 0.15, roi: a.metrics.roi * 0.15 },
  }));
  return <Arena agents={flat} leader={null} />;
}
