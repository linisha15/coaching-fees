import { istToday, parseISODate } from "@/lib/domain/dates";

/**
 * Today's date (IST, date-only). DEMO_TODAY pins the clock so the brief's
 * sample data ("23 days overdue", "due in 13 days") reads correctly.
 */
export function today(): Date {
  const pinned = process.env.DEMO_TODAY;
  return pinned ? parseISODate(pinned) : istToday();
}

/** True when DEMO_TODAY pins the clock (shown as "Demo date" in the UI). */
export function isDemoClock(): boolean {
  return !!process.env.DEMO_TODAY;
}

/** A timestamp on the clock's day, keeping the real time of day. */
export function nowOnClock(): Date {
  const t = today();
  const real = new Date();
  const msIntoDay = (real.getTime() + 5.5 * 3_600_000) % 86_400_000;
  return new Date(t.getTime() + msIntoDay - 5.5 * 3_600_000);
}
