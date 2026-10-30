const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const MAX_RANGE_DAYS = 366;

/** True for a real calendar date written as YYYY-MM-DD. */
export function isDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Returns why the inclusive range is invalid, or null when it is fine. */
export function rangeError(from: string, to: string): string | null {
  if (!isDay(from) || !isDay(to)) return "from and to must be dates in YYYY-MM-DD format";
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  if (days < 1) return "from must not be after to";
  if (days > MAX_RANGE_DAYS) return `the range must not exceed ${MAX_RANGE_DAYS} days`;
  return null;
}
