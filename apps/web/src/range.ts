export const RANGE_KEYS = ["7d", "30d", "90d"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export const DEFAULT_RANGE: RangeKey = "30d";

export const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "7 дней",
  "30d": "30 дней",
  "90d": "90 дней",
};

export interface DateRange {
  from: string;
  to: string;
}

const DAY_MS = 86_400_000;

/** The last N UTC days including today, as the API expects them. */
export function rangeDates(key: RangeKey, now: Date = new Date()): DateRange {
  const days = Number.parseInt(key, 10);
  const to = now.toISOString().slice(0, 10);
  const from = new Date(Date.parse(to) - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  return { from, to };
}
