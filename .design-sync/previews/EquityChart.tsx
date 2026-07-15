import { EquityChart } from 'sweeper';

const guarded = [1000, 1006, 1003, 1012, 1024, 1019, 1031, 1028, 1045, 1052, 1061, 1058, 1072, 1084];
const value = [1000, 998, 1004, 1001, 1009, 1006, 1013, 1008, 1015, 1012, 1018, 1014, 1019, 1021];
const maker = [1000, 1001, 1000, 1002, 1003, 1002, 1004, 1003, 1005, 1006, 1005, 1007, 1009, 1010];
const naive = [1000, 1004, 996, 991, 998, 985, 979, 988, 972, 968, 974, 961, 957, 949];

const series = [
  { name: 'Guarded Momentum', color: 'var(--color-brand)', equity: guarded },
  { name: 'Value', color: 'var(--color-cyan)', equity: value },
  { name: 'Passive Maker', color: 'var(--color-warn)', equity: maker },
  { name: 'Naive Momentum', color: 'var(--color-down)', equity: naive },
];

/** Four agents' equity over one match, with the starting-bankroll baseline. */
export function AgentRace() {
  return <EquityChart series={series} baseline={1000} width={620} height={240} />;
}

/** A single strategy, compact size. */
export function Single() {
  return <EquityChart series={[series[0]]} baseline={1000} width={420} height={160} />;
}
