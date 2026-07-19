import type { Severity, SignalKind } from "@/lib/sentinel/types";
import type { RunProvenance } from "@/lib/engine/state";

export function pnlColor(x: number): string {
  return x > 0.0001 ? "text-up" : x < -0.0001 ? "text-down" : "text-muted";
}

export function signFmt(x: number, dp = 2): string {
  return `${x >= 0 ? "+" : ""}${x.toFixed(dp)}`;
}

export function pct(x: number, dp = 0): string {
  return `${(x * 100).toFixed(dp)}%`;
}

export const SEVERITY_COLOR: Record<Severity, string> = {
  info: "text-info",
  warning: "text-warn",
  critical: "text-crit",
};

export const SEVERITY_DOT: Record<Severity, string> = {
  info: "bg-info",
  warning: "bg-warn",
  critical: "bg-crit",
};

export const SIGNAL_LABEL: Record<SignalKind, string> = {
  sharp_move: "Sharp move",
  stale_line: "Stale line",
  outlier_print: "Outlier print",
  suspended: "Suspended",
  reopened: "Reopened",
  settlement_hold: "Settlement hold",
};

export function qualityColor(q: number): string {
  if (q >= 75) return "text-up";
  if (q >= 50) return "text-warn";
  return "text-crit";
}

export function shortHash(h?: string, n = 8): string {
  if (!h) return "—";
  return `${h.slice(0, n)}…${h.slice(-4)}`;
}

export function clockFromMs(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(11, 19);
}

export function feedStreamLabel(accepted: boolean, provenance: RunProvenance): string {
  if (provenance === "recorded_live") return "N/A · replay";
  if (provenance === "simulation") return "N/A · simulation";
  return accepted ? "Accepted" : "Waiting";
}
