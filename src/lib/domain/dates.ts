// Date-only arithmetic. All "dates" are Date objects at 00:00 UTC that
// represent a calendar day in India (IST). Never mix with wall-clock times.

const MS_PER_DAY = 86_400_000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseISODate(s: string): Date {
  if (!ISO_DATE.test(s)) throw new Error(`Invalid date "${s}", expected YYYY-MM-DD`);
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new Error(`Invalid calendar date "${s}"`);
  }
  return date;
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

/** The current calendar day in India, as a date-only value. */
export function istToday(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}
