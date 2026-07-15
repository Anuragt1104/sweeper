import { Sparkline } from 'sweeper';

const rising = [100, 101, 100.4, 103, 105, 104, 107, 106, 110, 113, 112, 116, 119, 121, 120, 124, 127, 131];
const falling = [131, 130, 132, 128, 124, 125, 119, 121, 114, 110, 112, 106, 103, 104, 99, 96, 97, 92];
const choppy = [100, 108, 96, 112, 90, 118, 102, 121, 95, 116, 104, 124, 99, 119, 110, 128];

/** A winning agent's equity, drawn in the "up" token color. */
export function Rising() {
  return <Sparkline values={rising} color="var(--color-up)" />;
}

/** A losing run, in the "down" token color. */
export function Falling() {
  return <Sparkline values={falling} color="var(--color-down)" />;
}

/** A volatile curve at a larger size. */
export function Volatile() {
  return <Sparkline values={choppy} color="var(--color-cyan)" width={220} height={48} />;
}
