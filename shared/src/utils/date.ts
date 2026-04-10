/**
 * Date helpers. The whole platform operates in IST (Asia/Kolkata). UTC ISO strings are
 * used for storage; IST strings are used for anything a human sees.
 *
 * These helpers are deliberately zero-dependency — no date-fns, no dayjs — so both the
 * browser bundle and the Cloud Functions runtime can import them without pulling any
 * tree unexpected into the bundle.
 */

/** IANA zone the entire app operates in. */
export const IST_TIMEZONE = 'Asia/Kolkata';

/** Return the current time as an ISO-8601 UTC string (always ends with 'Z'). */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Parse an ISO-8601 string into a JS Date. Throws on invalid input. */
export function parseIso(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${iso}`);
  }
  return d;
}

/**
 * Format a Date as an IST date string (YYYY-MM-DD). Uses Intl.DateTimeFormat so no
 * external tz library is needed.
 */
export function toIstDateString(d: Date): string {
  // sv-SE gives us the YYYY-MM-DD shape we want; the timeZone option does the actual IST shift.
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Format a Date as an IST YearMonth string (YYYY-MM). */
export function toIstYearMonth(d: Date): string {
  return toIstDateString(d).slice(0, 7);
}

/**
 * Format a Date as a friendly Indian-style display string: "09 Apr 2026".
 * For anywhere in the UI where a user sees a date.
 */
export function formatIstDisplay(d: Date | string): string {
  const date = typeof d === 'string' ? parseIso(d) : d;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** Format a Date as an IST time string, e.g. "06:30 PM". */
export function formatIstTime(d: Date | string): string {
  const date = typeof d === 'string' ? parseIso(d) : d;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/** Compute age in whole years from a YYYY-MM-DD date of birth, referenced to today in IST. */
export function ageFromDob(dob: string): number {
  const [y, m, d] = dob.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const today = new Date();
  const istTodayStr = toIstDateString(today);
  const [ty, tm, td] = istTodayStr.split('-').map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return Math.max(0, age);
}
