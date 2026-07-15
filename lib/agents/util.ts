/** Small read helpers shared by the strategy agents. */
import type { OddsMarketType } from "@/lib/txline/types";
import type { MarketTick } from "@/lib/market/ticks";
import type { SelectionFeatures } from "@/lib/market/features";
import type { Side } from "@/lib/agents/types";
import { selId } from "@/lib/market/ids";

export function obsProb(tick: MarketTick, marketType: OddsMarketType, key: string): number | undefined {
  return find(tick, "odds", marketType, key)?.impliedProb;
}
export function obsPrice(tick: MarketTick, marketType: OddsMarketType, key: string): number | undefined {
  return find(tick, "odds", marketType, key)?.price;
}
export function fairProb(tick: MarketTick, marketType: OddsMarketType, key: string): number | undefined {
  return find(tick, "fair", marketType, key)?.impliedProb;
}

function find(tick: MarketTick, which: "odds" | "fair", marketType: OddsMarketType, key: string) {
  const snap = which === "odds" ? tick.odds : tick.fair;
  const m = snap.markets.find((x) => x.type === marketType);
  return m?.selections.find((s) => s.key === key);
}

export function volOf(features: Map<string, SelectionFeatures>, marketType: OddsMarketType, key: string): number {
  return features.get(selId(marketType, key))?.vol ?? 0;
}
export function zOf(features: Map<string, SelectionFeatures>, marketType: OddsMarketType, key: string): number {
  return features.get(selId(marketType, key))?.z ?? 0;
}
export function retOf(features: Map<string, SelectionFeatures>, marketType: OddsMarketType, key: string): number {
  return features.get(selId(marketType, key))?.ret ?? 0;
}
export function samplesOf(features: Map<string, SelectionFeatures>, marketType: OddsMarketType, key: string): number {
  return features.get(selId(marketType, key))?.samples ?? 0;
}

export function decimal(prob: number): number {
  return prob > 0 ? Math.round((1 / prob) * 100) / 100 : 0;
}

/** Trade the delta between current and desired net position, if it clears minTrade. */
export function deltaToOrder(
  currentNet: number,
  desiredNet: number,
  minTrade: number,
): { side: Side; size: number } | null {
  const delta = Math.round(desiredNet) - Math.round(currentNet);
  if (Math.abs(delta) < minTrade) return null;
  return { side: delta > 0 ? "buy" : "sell", size: Math.abs(delta) };
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export const MIN_TRADE = 8;
