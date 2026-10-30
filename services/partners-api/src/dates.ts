import { badRequest } from "./errors.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const MAX_RANGE_DAYS = 366;
export const DEFAULT_RANGE_DAYS = 30;

/** Inclusive range of UTC dates, YYYY-MM-DD. */
export interface DateRange {
  from: string;
  to: string;
}

export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10);
}

export function isDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Reads ?from=&to=. Without them: the last 30 days up to today. Throws a 400 HttpError when invalid. */
export function parseRange(query: { from?: string | undefined; to?: string | undefined }, now: Date = new Date()): DateRange {
  const to = query.to ?? todayUtc(now);
  const from = query.from ?? (isDay(to) ? addDays(to, -(DEFAULT_RANGE_DAYS - 1)) : to);
  if (!isDay(from) || !isDay(to)) throw badRequest("from and to must be dates in YYYY-MM-DD format");
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  if (days < 1) throw badRequest("from must not be after to");
  if (days > MAX_RANGE_DAYS) throw badRequest(`the range must not exceed ${MAX_RANGE_DAYS} days`);
  return { from, to };
}

export function includesToday(range: DateRange, now: Date = new Date()): boolean {
  return range.to >= todayUtc(now);
}
