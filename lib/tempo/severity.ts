import type { MaterialKind, TempoKind, TempoMarkerKind } from "@/lib/tempo/types";

const TEMPO_TXLINE_BASE: Partial<Record<TempoMarkerKind, number>> = {
  goal: 1,
  red: 0.85,
  yellow: 0.45,
  corner: 0.22,
  kickoff: 0.12,
  "half-time": 0.15,
  "full-time": 0.2,
};

const TEMPO_ENRICH_BASE: Record<TempoKind, number> = {
  shot: 0.18,
  shot_on_target: 0.3,
  foul: 0.16,
  offside: 0.14,
  attack: 0.12,
  dangerous_attack: 0.24,
  possession_shift: 0.2,
};

/** Late-match events weigh slightly more (desk cares about endgame shocks). */
function phaseWeight(minute: number): number {
  if (minute >= 75) return 1.12;
  if (minute >= 60) return 1.05;
  return 1;
}

/** Severity for TxLINE score-derived Tempo markers (and legacy MaterialKind callers). */
export function materialSeverity(
  kind: MaterialKind,
  minute: number,
  extras?: { oddsDelta?: number; surprise?: boolean; thesisDead?: boolean },
): number {
  if (kind === "odds_swing") {
    const base =
      extras?.oddsDelta != null ? Math.min(0.95, 0.35 + Math.abs(extras.oddsDelta) * 4) : 0.55;
    return clamp(base * phaseWeight(minute), 0.05, 1);
  }
  if (kind === "horizon_collapse") {
    let base = 0.6;
    if (extras?.surprise) base = 0.92;
    else if (extras?.thesisDead) base = 0.78;
    return clamp(base * phaseWeight(minute), 0.05, 1);
  }
  const base = TEMPO_TXLINE_BASE[kind as TempoMarkerKind] ?? TEMPO_ENRICH_BASE[kind as TempoKind] ?? 0.2;
  return clamp(base * phaseWeight(minute), 0.05, 1);
}

export function tempoSeverity(kind: TempoKind, minute: number): number {
  return clamp((TEMPO_ENRICH_BASE[kind] ?? 0.15) * phaseWeight(minute), 0.05, 0.45);
}

export function hybridCollapseSeverity(
  minute: number,
  extras?: { surprise?: boolean; thesisDead?: boolean },
): number {
  return materialSeverity("horizon_collapse", minute, extras);
}

export function oddsSwingSeverity(minute: number, oddsDelta?: number): number {
  return materialSeverity("odds_swing", minute, { oddsDelta });
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
