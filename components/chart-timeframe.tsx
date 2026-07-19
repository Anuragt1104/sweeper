"use client";

export type ChartTimeframe = 5 | 15 | 30 | "full";

export const CHART_TIMEFRAMES: readonly ChartTimeframe[] = [5, 15, 30, "full"];

export function TimeframeControl({
  value,
  onChange,
  label = "Chart timeframe",
}: {
  value: ChartTimeframe;
  onChange: (value: ChartTimeframe) => void;
  label?: string;
}) {
  return (
    <div className="chart-timeframe" role="group" aria-label={label}>
      {CHART_TIMEFRAMES.map((timeframe) => (
        <button
          type="button"
          key={timeframe}
          className={value === timeframe ? "is-active" : ""}
          aria-pressed={value === timeframe}
          onClick={() => onChange(timeframe)}
        >
          {timeframe === "full" ? "FULL" : `${timeframe}m`}
        </button>
      ))}
    </div>
  );
}

export function windowMinutePoints<T extends { minute: number }>(
  points: readonly T[],
  timeframe: ChartTimeframe,
  latestMinute = points.at(-1)?.minute ?? 0,
): T[] {
  if (timeframe === "full" || points.length < 2) return [...points];
  const cutoff = latestMinute - timeframe;
  const firstVisible = points.findIndex((point) => point.minute >= cutoff);
  if (firstVisible === -1) return [];
  if (firstVisible === 0) return [...points];
  return points.slice(Math.max(0, firstVisible - 1));
}

export function windowTimedValues(
  values: readonly number[],
  minutes: readonly number[] | undefined,
  timeframe: ChartTimeframe,
): { values: number[]; minutes?: number[]; offset: number } {
  if (minutes?.length !== values.length) return { values: [...values], offset: 0 };
  if (timeframe === "full" || values.length < 2) return { values: [...values], minutes: [...minutes], offset: 0 };
  const points = values.map((value, index) => ({ value, minute: minutes[index] }));
  const visible = windowMinutePoints(points, timeframe);
  return {
    values: visible.map((point) => point.value),
    minutes: visible.map((point) => point.minute),
    offset: values.length - visible.length,
  };
}

export function timeframeStart(latestMinute: number, timeframe: ChartTimeframe): number {
  return timeframe === "full" ? Number.NEGATIVE_INFINITY : latestMinute - timeframe;
}

export function timeframeLabel(timeframe: ChartTimeframe): string {
  return timeframe === "full" ? "full match to live" : `rolling ${timeframe} minutes`;
}
