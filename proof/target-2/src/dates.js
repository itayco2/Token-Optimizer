// Date helpers. All calendar math is in UTC.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Month key "YYYY-MM" for a date, in UTC, with the month as 01–12.
 * monthKey(new Date('2026-01-15T00:00:00Z')) → "2026-01".
 * @param {Date} date
 */
export function monthKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth()).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Whole calendar days from `a` to `b` in UTC, ignoring the time of day.
 * Negative when `b` is before `a`. daysBetween(Jan 1 23:00, Jan 2 01:00) → 1.
 */
export function daysBetween(a, b) {
  const start = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const end = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((end - start) / DAY_MS);
}

/** True on Saturday and Sunday, in UTC. */
export function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** The same instant plus `n` whole days (n may be negative). */
export function addDays(date, n) {
  return new Date(date.getTime() + n * DAY_MS);
}
