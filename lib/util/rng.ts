/**
 * Tiny seeded PRNG (mulberry32) + string hashing.
 *
 * Simulated matches are seeded by fixture id, so a given fixture always plays
 * out the same way. That determinism is what makes "replay mode" reliable for
 * the demo: judges see the exact same dramatic sequence every time.
 */

export function hashStringToSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export type Rng = {
  /** float in [0, 1) */
  next(): number;
  /** int in [min, max] inclusive */
  int(min: number, max: number): number;
  /** true with probability p */
  chance(p: number): boolean;
  /** pick one element */
  pick<T>(arr: T[]): T;
};

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}
