/**
 * Regime gate — when odds path volatility is extreme, directional agents
 * stand down instead of chasing noise.
 */
import type { DeskPathFeatures } from "@/lib/agents/desk-features";
import type { EngineConfig } from "@/lib/engine/config";

export type RegimeKind = "calm" | "normal" | "chaotic";

export function classifyRegime(path: DeskPathFeatures | undefined, cfg: EngineConfig): RegimeKind {
  const vol = path?.homePathVol;
  if (vol == null) return "normal";
  if (vol >= cfg.strategy.pathVolChaotic) return "chaotic";
  if (vol <= cfg.strategy.pathVolCalm) return "calm";
  return "normal";
}

/** Directional takers should stand down in chaotic regimes. */
export function regimeBlocksDirectional(
  path: DeskPathFeatures | undefined,
  cfg: EngineConfig,
): string | null {
  const kind = classifyRegime(path, cfg);
  if (kind !== "chaotic") return null;
  const vol = path?.homePathVol ?? 0;
  return `regime CHAOTIC · home path vol ${(vol * 100).toFixed(2)}pp ≥ ${(cfg.strategy.pathVolChaotic * 100).toFixed(2)}pp`;
}
