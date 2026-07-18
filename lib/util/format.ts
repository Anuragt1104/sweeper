/** Small formatting helpers shared by server and client. */

export function fmtPrice(price: number): string {
  return price.toFixed(2);
}

export function priceMovement(price: number, prev: number): "up" | "down" | "flat" {
  const d = price - prev;
  if (Math.abs(d) < 0.001) return "flat";
  // Decimal price UP = selection got LONGER (less likely).
  return d > 0 ? "up" : "down";
}

/** Convert a de-margined implied probability to a friendly percentage. */
export function pct(prob: number): number {
  return Math.round(prob * 100);
}

export function fmtClock(minute: number, phase: number): string {
  if (phase === 0) return "—";
  if (phase === 2) return "HT";
  if (phase === 4 || phase === 9) return "FT";
  const rounded = Math.round(minute * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}'` : `${rounded.toFixed(1)}'`;
}

export function relativeKickoff(iso: string, now = new Date()): string {
  const ko = new Date(iso).getTime();
  const diff = ko - now.getTime();
  const mins = Math.round(diff / 60000);
  if (mins <= 0 && mins > -120) return "Live window";
  if (mins <= 0) return "Full-time";
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}
