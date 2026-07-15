/**
 * Rolling per-selection feature tracker.
 *
 * The sentinel and strategies reason over a small, well-defined feature set
 * computed from the *observed* stream only (so the same code runs unchanged on a
 * live TxLINE feed):
 *
 *  - `ret`        log-return of implied probability since the last change
 *  - `vol`        EWMA volatility of returns (the move's "normal" scale)
 *  - `z`          standardized size of the latest move (ret / vol)
 *  - `msSinceChange`  staleness clock — ms since the price last moved
 *  - `reference`  a slow robust estimate of "where this line should be",
 *                 used to flag outlier prints without a hidden oracle
 *
 * All state is keyed by selection id and updated once per tick.
 */
import type { MarketTick } from "@/lib/market/ticks";
import { selId } from "@/lib/market/ids";
import type { SentinelThresholds } from "@/lib/engine/config";

export interface SelectionFeatures {
  selId: string;
  marketType: string;
  key: string;
  prob: number;
  price: number;
  ret: number;
  vol: number;
  z: number;
  msSinceChange: number;
  reference: number;
  /** total observed updates seen for this selection (warm-up gate). */
  samples: number;
}

interface SelState {
  prob: number;
  price: number;
  lastChangeMs: number;
  emaVar: number;
  ret: number;
  z: number;
  reference: number;
  samples: number;
}

export class FeatureTracker {
  private state = new Map<string, SelState>();
  private th: SentinelThresholds;

  constructor(thresholds: SentinelThresholds) {
    this.th = thresholds;
  }

  /** Update every selection from a tick; return the per-selection feature view. */
  update(tick: MarketTick): Map<string, SelectionFeatures> {
    const out = new Map<string, SelectionFeatures>();
    for (const m of tick.odds.markets) {
      for (const s of m.selections) {
        const id = selId(m.type, s.key);
        const prev = this.state.get(id);
        const f = this.step(id, m.type, s.key, s.impliedProb, s.price, tick.tsMs, prev);
        out.set(id, f);
      }
    }
    return out;
  }

  get(id: string): SelectionFeatures | undefined {
    const st = this.state.get(id);
    if (!st) return undefined;
    const { marketType, key } = splitId(id);
    return view(id, marketType, key, st, 0);
  }

  private step(
    id: string,
    marketType: string,
    key: string,
    prob: number,
    price: number,
    tsMs: number,
    prev: SelState | undefined,
  ): SelectionFeatures {
    if (!prev) {
      const st: SelState = {
        prob,
        price,
        lastChangeMs: tsMs,
        emaVar: this.th.volFloor * this.th.volFloor,
        ret: 0,
        z: 0,
        reference: prob,
        samples: 1,
      };
      this.state.set(id, st);
      return view(id, marketType, key, st, 0);
    }

    const changed = Math.abs(prob - prev.prob) > 1e-9;
    const ret = changed ? Math.log(clampPos(prob) / clampPos(prev.prob)) : 0;
    // z is measured against the volatility BEFORE this move is folded in —
    // otherwise a single spike inflates its own denominator and z saturates
    // near 1/sqrt(alpha), never crossing a sharp threshold.
    const a = this.th.volAlpha;
    const priorVol = Math.max(this.th.volFloor, Math.sqrt(prev.emaVar));
    const z = ret / priorVol;
    const emaVar = a * ret * ret + (1 - a) * prev.emaVar;
    const vol = Math.max(this.th.volFloor, Math.sqrt(emaVar));
    // slow robust reference (resists single bad prints): heavier weight on history
    const reference = 0.12 * prob + 0.88 * prev.reference;

    const st: SelState = {
      prob,
      price,
      lastChangeMs: changed ? tsMs : prev.lastChangeMs,
      emaVar,
      ret,
      z,
      reference,
      samples: prev.samples + 1,
    };
    this.state.set(id, st);

    const msSinceChange = tsMs - st.lastChangeMs;
    return {
      selId: id,
      marketType,
      key,
      prob,
      price,
      ret,
      vol,
      z,
      msSinceChange,
      reference,
      samples: st.samples,
    };
  }
}

function view(id: string, marketType: string, key: string, st: SelState, msSinceChange: number): SelectionFeatures {
  return {
    selId: id,
    marketType,
    key,
    prob: st.prob,
    price: st.price,
    ret: st.ret,
    vol: Math.sqrt(st.emaVar),
    z: st.z,
    msSinceChange,
    reference: st.reference,
    samples: st.samples,
  };
}

function splitId(id: string): { marketType: string; key: string } {
  const i = id.indexOf(":");
  return { marketType: id.slice(0, i), key: id.slice(i + 1) };
}

function clampPos(x: number): number {
  return Math.max(1e-4, Math.min(0.9999, x));
}
