import type { OddsMarket } from "@/lib/txline/types";
import type { ReferencePricingInput, ReferencePricingModel, ReferencePricingState } from "@/lib/pricing/types";

const WINDOW_MS = 5 * 60_000;
const MAX_SAMPLES = 20;
const MIN_CHANGES = 5;
const ALPHA = 0.12;

interface Sample {
  tsMs: number;
  values: Record<string, number>;
  fingerprint: string;
}

/**
 * Robust reference derived exclusively from genuine TxLINE consensus changes.
 * Heartbeats and duplicate vectors do not advance warm-up.
 */
export class TxlineConsensusReference implements ReferencePricingModel {
  private samples = new Map<string, Sample[]>();
  private smoothed = new Map<string, Record<string, number>>();

  update(input: ReferencePricingInput): ReferencePricingState {
    const markets = input.odds.markets.map((market) => this.updateMarket(market, input.tsMs));
    const sampleCount = this.requiredSampleCount();
    const ready = sampleCount >= MIN_CHANGES;
    return {
      snapshot: {
        ...input.odds,
        markets,
      },
      provenance: {
        source: "txline_robust_reference",
        sampleCount,
        ready,
        standDownReason: ready ? null : `reference warm-up ${sampleCount}/${MIN_CHANGES} genuine changes`,
        updatedAtMs: input.tsMs,
      },
    };
  }

  private updateMarket(market: OddsMarket, tsMs: number): OddsMarket {
    const key = marketKey(market);
    const values = Object.fromEntries(market.selections.map((selection) => [selection.key, selection.impliedProb]));
    const fingerprint = market.selections.map((selection) => `${selection.key}:${selection.impliedProb.toFixed(8)}`).join("|");
    const cutoff = tsMs - WINDOW_MS;
    const prior = (this.samples.get(key) ?? []).filter((sample) => sample.tsMs >= cutoff);
    if (prior.at(-1)?.fingerprint !== fingerprint) prior.push({ tsMs, values, fingerprint });
    const retained = prior.slice(-MAX_SAMPLES);
    this.samples.set(key, retained);

    const filtered = Object.fromEntries(
      market.selections.map((selection) => [
        selection.key,
        robustCenter(retained.map((sample) => sample.values[selection.key]).filter(Number.isFinite)),
      ]),
    );
    const previous = this.smoothed.get(key);
    const next = normalize(
      Object.fromEntries(
        market.selections.map((selection) => {
          const center = filtered[selection.key] ?? selection.impliedProb;
          const old = previous?.[selection.key];
          return [selection.key, old === undefined ? center : ALPHA * center + (1 - ALPHA) * old];
        }),
      ),
    );
    this.smoothed.set(key, next);
    return {
      ...market,
      selections: market.selections.map((selection) => ({
        ...selection,
        impliedProb: next[selection.key] ?? selection.impliedProb,
        price: 1 / Math.max(0.001, next[selection.key] ?? selection.impliedProb),
      })),
    };
  }

  private requiredSampleCount(): number {
    const required = [...this.samples.entries()]
      .filter(([key]) => key.startsWith("match_result|"))
      .map(([, samples]) => samples.length);
    return required.length ? Math.min(...required) : 0;
  }
}

function marketKey(market: OddsMarket): string {
  return `${market.type}|${market.line ?? ""}|${market.label}`;
}

function robustCenter(values: number[]): number {
  if (!values.length) return 0;
  const center = median(values);
  const deviations = values.map((value) => Math.abs(value - center));
  const mad = median(deviations);
  if (mad === 0) return center;
  const limit = 3 * 1.4826 * mad;
  const retained = values.filter((value) => Math.abs(value - center) <= limit);
  return median(retained.length ? retained : values);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalize(values: Record<string, number>): Record<string, number> {
  const total = Object.values(values).reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return values;
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Math.max(0, value) / total]));
}

export const REFERENCE_WARMUP_CHANGES = MIN_CHANGES;
