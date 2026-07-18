/**
 * Build sparse MarketTicks from TxLINE historical score records + a frozen
 * odds snapshot. Used to warm DeskFeatureStore / Horizon / Shock Strip when
 * joining a live match mid-game (TxLINE has score history; no odds history).
 */
import type { MarketTick } from "@/lib/market/ticks";
import type { Fixture, OddsSnapshot } from "@/lib/txline/types";
import type { NormalizedScoreRecord } from "@/lib/txline/normalize";

export function ticksFromHistoricalScores(
  fixture: Fixture,
  scores: NormalizedScoreRecord[],
  odds: OddsSnapshot,
  opts?: { maxTicks?: number },
): MarketTick[] {
  if (scores.length === 0) return [];
  const maxTicks = opts?.maxTicks ?? 120;
  const step = Math.max(1, Math.ceil(scores.length / maxTicks));
  const out: MarketTick[] = [];
  for (let i = 0; i < scores.length; i += step) {
    const rec = scores[i]!;
    const snap = rec.snapshot;
    const minute = snap.minute;
    const tsMs = Date.parse(snap.ts) || i * 1000;
    out.push({
      fixtureId: fixture.id,
      seq: snap.seq || i,
      tsMs,
      minute,
      phase: snap.phase,
      score: snap,
      suspended: false,
      odds,
      reference: odds,
      pricing: {
        source: "txline_robust_reference",
        sampleCount: 1,
        ready: true,
        standDownReason: null,
        updatedAtMs: tsMs,
      },
      events: rec.explicitEvent ? [rec.explicitEvent] : [],
      upstream: {
        scoreSeq: snap.seq,
        scoreTsMs: tsMs,
        oddsTsMs: tsMs,
      },
    });
  }
  return out;
}
