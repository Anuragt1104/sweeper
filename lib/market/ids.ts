/** Stable identity for a single tradeable selection across the engine. */
import type { OddsMarketType } from "@/lib/txline/types";

export function selId(marketType: OddsMarketType, key: string): string {
  return `${marketType}:${key}`;
}

export function parseSelId(id: string): { marketType: OddsMarketType; key: string } {
  const i = id.indexOf(":");
  return { marketType: id.slice(0, i) as OddsMarketType, key: id.slice(i + 1) };
}
