import type { MaterialKind, TempoKind } from "@/lib/tempo/types";

const MATERIAL_BASE: Record<MaterialKind, number> = {
  goal: 1,
  red: 0.85,
  yellow: 0.45,
  corner: 0.22,
  odds_swing: 0.55,
  horizon_collapse: 0.6,
  kickoff: 0.12,
  "half-time": 0.15,
  "full-time": 0.2,
};

const TEMPO_BASE: Record<TempoKind, number> = {
  shot: 0.18,
  shot_on_target: 0.3,
};

/** Late-match events weigh slightly more (desk cares about endgame shocks). */
function phaseWeight(minute: number): number {
  if (minute >= 75) return 1.12;
  if (minute >= 60) return 1.05;
  return 1;
}

export function materialSeverity(
  kind: MaterialKind,
  minute: number,
  extras?: { oddsDelta?: number; surprise?: boolean; thesisDead?: boolean },
): number {
  let base = MATERIAL_BASE[kind] ?? 0.2;
  if (kind === "odds_swing" && extras?.oddsDelta != null) {
    base = Math.min(0.95, 0.35 + Math.abs(extras.oddsDelta) * 4);
  }
  if (kind === "horizon_collapse") {
    if (extras?.surprise) base = 0.92;
    else if (extras?.thesisDead) base = 0.78;
  }
  return clamp(base * phaseWeight(minute), 0.05, 1);
}

export function tempoSeverity(kind: TempoKind, minute: number): number {
  return clamp((TEMPO_BASE[kind] ?? 0.15) * phaseWeight(minute), 0.05, 0.45);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
