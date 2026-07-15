import { OddsBoard } from 'sweeper';

const tick = {
  markets: [
    {
      type: 'match_result',
      label: 'Match Result',
      selections: [
        { key: 'home', label: 'Argentina', prob: 0.46, decimal: 2.12, fairProb: 0.44, z: 1.2, prevPrice: 2.2, stale: false },
        { key: 'draw', label: 'Draw', prob: 0.27, decimal: 3.65, fairProb: 0.28, z: 0.3, prevPrice: 3.6, stale: false },
        { key: 'away', label: 'France', prob: 0.27, decimal: 3.7, fairProb: 0.21, z: 3.4, prevPrice: 3.1, stale: false },
      ],
    },
    {
      type: 'total_goals',
      label: 'Total Goals',
      line: 2.5,
      selections: [
        { key: 'over', label: 'Over 2.5', prob: 0.58, decimal: 1.72, fairProb: 0.55, z: 2.1, prevPrice: 1.8, stale: false },
        { key: 'under', label: 'Under 2.5', prob: 0.42, decimal: 2.38, fairProb: 0.45, z: 0.8, prevPrice: 2.3, stale: true },
      ],
    },
  ],
  events: [
    { kind: 'goal', label: "⚽ 78' Messi", minute: 78 },
    { kind: 'corner', label: "78' Corner ARG", minute: 78 },
  ],
};

/** A live two-market board: prob, decimal, fair, z-score, movement arrows; one stale line, one outlier (z≥3). */
export function Live() {
  return (
    <div style={{ width: 420 }}>
      <OddsBoard tick={tick} />
    </div>
  );
}

/** Before the feed connects. */
export function Awaiting() {
  return (
    <div style={{ width: 420 }}>
      <OddsBoard tick={null} />
    </div>
  );
}
