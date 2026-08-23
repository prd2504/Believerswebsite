/**
 * Court hour bookings.
 *
 * Separate from students, enrollments and fee payments on purpose: this is
 * facility income, not coaching income. Keeping it in its own collection is
 * what lets the P&L report the two separately — mixing it into student
 * payments would blend a coaching margin that isn't real, and would put
 * non-students into the roster, the fee-attendance reconciliation and the
 * invoice sequence.
 *
 * Bookings are per HOUR. The configured windows describe when hours may be
 * sold; they are not themselves the unit of sale.
 */

import type { BaseDocument, IsoDate } from './common.js';

export const CourtBookingStatus = {
  /** Submitted, payment not yet verified. Holds the hour. */
  HELD: 'HELD',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;
export type CourtBookingStatus = (typeof CourtBookingStatus)[keyof typeof CourtBookingStatus];

export const CourtBookingSource = {
  ONLINE: 'ONLINE',
  ADMIN: 'ADMIN',
  MONTHLY_PLAN: 'MONTHLY_PLAN',
} as const;
export type CourtBookingSource = (typeof CourtBookingSource)[keyof typeof CourtBookingSource];

/** Statuses that occupy an hour. A cancelled booking frees it again. */
export const OCCUPYING_STATUSES: readonly CourtBookingStatus[] = ['HELD', 'CONFIRMED'];

/**
 * Optional extras sold with an hour. Priced per unit and snapshotted onto the
 * booking, so a later price change never rewrites what someone already paid.
 */
export interface CourtAddOn {
  key: string;
  label: string;
  pricePaise: number;
}

export const COURT_ADDONS: CourtAddOn[] = [
  { key: 'SHUTTLE', label: 'Mavis 350 shuttle', pricePaise: 10_000 },
  { key: 'RACQUET', label: 'Extra racquet',     pricePaise: 10_000 },
];

/** Total for a set of add-on quantities, e.g. { SHUTTLE: 2, RACQUET: 1 }. */
export function addOnsTotalPaise(qty: Record<string, number> | null | undefined): number {
  if (!qty) return 0;
  return COURT_ADDONS.reduce((t, a) => t + a.pricePaise * Math.max(0, qty[a.key] ?? 0), 0);
}

/** "2 x Mavis 350 shuttle, 1 x Extra racquet" — for emails and the admin grid. */
export function describeAddOns(qty: Record<string, number> | null | undefined): string {
  if (!qty) return '';
  return COURT_ADDONS
    .filter((a) => (qty[a.key] ?? 0) > 0)
    .map((a) => `${qty[a.key]} × ${a.label}`)
    .join(', ');
}

/**
 * Court rules, shown at booking time AND repeated in the confirmation email.
 *
 * One list, two surfaces — a rule someone agreed to on the page must be the
 * same rule that reaches their inbox, or the one they'll quote back is
 * whichever was laxer.
 */
export const COURT_RULES: string[] = [
  'Non-marking shoes are compulsory. You will not be allowed on court without them.',
  'Your slot starts and ends on time. It cannot be extended — the next players need to start on time too.',
  'Please arrive 5 minutes early and warm up off court, so play starts at the hour.',
  'Leave the court clear at the end of your hour, including used shuttles and bottles.',
  'Report any damaged equipment or net issues to the coach on duty before you leave.',
];

export interface CourtBookingDocument extends BaseDocument {
  id: string;
  centreId: string;

  /** YYYY-MM-DD. */
  date: IsoDate;
  /** "09:00" — start of the hour booked. */
  startHour: string;
  /** Consecutive hours from startHour. 1 unless booked as a longer block. */
  hours: number;

  bookerName: string;
  bookerPhone: string;
  bookerEmail: string | null;

  /** Rate actually charged per hour — snapshotted so a later rate change
   *  never rewrites the value of a past booking. */
  hourlyRatePaise: number;
  /** Court time only: hours × hourlyRatePaise. */
  courtPaise: number;
  /** Add-on quantities by key, e.g. { SHUTTLE: 2 }. */
  addOns: Record<string, number>;
  /** Add-ons subtotal, snapshotted at the prices charged. */
  addOnsPaise: number;
  /** What the booker pays: courtPaise + addOnsPaise. */
  amountPaise: number;

  status: CourtBookingStatus;
  source: CourtBookingSource;

  /** Set when this booking came from a monthly plan. */
  planId: string | null;

  screenshotUrl: string | null;
  notes: string | null;

  verifiedBy: string | null;
  verifiedAt: string | null;
}

/** A window during which hours may be sold on a given weekday. */
export interface CourtWindow {
  /** "09:00" inclusive. */
  start: string;
  /** "11:00" exclusive. */
  end: string;
  /** Closed windows still appear in the admin grid so they can be opened. */
  open: boolean;
}

export interface CourtRentalConfig {
  centreId: string;
  /** Master switch — false hides the booking page entirely. */
  isOpen: boolean;
  hourlyRatePaise: number;
  /** Discounted hourly rate inside a monthly plan. */
  planHourlyRatePaise: number;
  /** Weekday (0=Sun … 6=Sat) → bookable windows. Absent = nothing that day. */
  windows: Record<number, CourtWindow[]>;
  /** Weekday → hours reserved for coaching. Never bookable, never overridable. */
  coachingWindows: Record<number, { start: string; end: string }[]>;
  /**
   * Per-date exceptions: 'YYYY-MM-DD' → { '15:00': true }.
   * Opens an hour that is closed by default, or closes one that is open —
   * a one-off holiday, or opening Sunday 3–4 for a particular weekend.
   */
  dateOverrides: Record<string, Record<string, boolean>>;
  /**
   * Day of the month on which NEXT month's dates become bookable.
   *
   * Before this day the page sells the current month only. It matches the
   * slot-booking window, which drops on the 25th, so a regular is dealing with
   * one release date across the whole academy rather than two.
   */
  nextMonthOpensOnDay: number;
  updatedAt: string;
  updatedBy: string | null;
}

/**
 * Dadar's weekend shape. Sunday 15:00 ships CLOSED — it's the hour reserved
 * by default — but it's present in the config rather than absent, so it can
 * be opened from the admin grid without a code change.
 */
export const DEFAULT_COURT_CONFIG: Omit<CourtRentalConfig, 'centreId' | 'updatedAt' | 'updatedBy'> = {
  isOpen: true,
  hourlyRatePaise: 80_000,        // ₹800/hr
  planHourlyRatePaise: 70_000,    // ₹700/hr on a monthly plan
  windows: {
    0: [ // Sunday
      { start: '09:00', end: '11:00', open: true },
      { start: '15:00', end: '16:00', open: false },
      { start: '16:00', end: '17:00', open: true },
    ],
    6: [ // Saturday
      { start: '09:00', end: '11:00', open: true },
      { start: '15:00', end: '17:00', open: true },
    ],
  },
  coachingWindows: {
    0: [{ start: '11:00', end: '15:00' }],
    6: [{ start: '11:00', end: '15:00' }],
  },
  dateOverrides: {},
  nextMonthOpensOnDay: 25,
};

/** Longest block anyone may book in one go. */
export const MAX_BOOKING_HOURS = 4;

// ── The clock ────────────────────────────────────────────────────────────────

/**
 * Wall-clock now at the court, regardless of whose device is asking.
 *
 * A booking page is opened on phones whose timezone is whatever the traveller,
 * the SIM, or a manual setting last left it at. `new Date().getHours()` on one
 * of those would call an hour past that hasn't happened, or — worse — sell an
 * hour that is already underway. The court is in Mumbai, so the only clock
 * that matters is Asia/Kolkata, and Intl gives it to us from any device.
 *
 * Returns wall-clock strings rather than a Date because everything downstream
 * (window bounds, booking ids, availability keys) is already wall-clock text.
 */
export function istNow(at: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  // en-GB gives hour "24" for midnight in some runtimes; normalise it.
  const hh = get('hour') === '24' ? '00' : get('hour');
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hh}:${get('minute')}`,
  };
}

/**
 * Has this hour already started?
 *
 * An hour is spent the moment it begins — 10:00–11:00 stops being sellable at
 * 10:00, not at 11:00. Someone arriving at 10:30 for an hour that ends in
 * thirty minutes is a refund conversation, not a booking.
 */
export function isHourPast(date: string, hour: string, now: { date: string; time: string }): boolean {
  if (date < now.date) return true;
  if (date > now.date) return false;
  return hourToMinutes(hour) <= hourToMinutes(now.time);
}

// ── Time helpers ─────────────────────────────────────────────────────────────
// "HH:mm" sorts lexically, so plain string comparison is safe and avoids
// dragging timezones into what is purely a wall-clock schedule.

export function hourToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function addHour(hhmm: string, n = 1): string {
  const total = hourToMinutes(hhmm) + n * 60;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Expand a window into whole-hour start times: 09:00–11:00 → ['09:00','10:00']. */
export function expandHours(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  let guard = 0;
  while (hourToMinutes(cur) < hourToMinutes(end) && guard++ < 24) {
    out.push(cur);
    cur = addHour(cur);
  }
  return out;
}

/** Weekday for a YYYY-MM-DD, parsed as a local date (no timezone shifting). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export type SlotState = 'AVAILABLE' | 'HELD' | 'BOOKED' | 'CLOSED' | 'COACHING' | 'PAST';

export interface CourtSlot {
  hour: string;
  endHour: string;
  state: SlotState;
  bookingId: string | null;
  bookerName: string | null;
  ratePaise: number;
}

/**
 * Every sellable hour for a date, and what each is doing.
 *
 * Coaching wins over everything: an hour inside a coaching window can never be
 * sold, and a date override cannot open it. That guard is deliberate — the
 * failure mode is a paying stranger arriving mid-session.
 *
 * Pass `now` (from istNow()) to mark elapsed hours PAST. It is optional
 * because the admin grid deliberately does NOT pass it: Jaydeep records a
 * cash walk-in after the fact, and a grid that refuses yesterday would make
 * that impossible. The public page always passes it, and the server checks it
 * again on write — a browser clock is a suggestion, not an authority.
 *
 * An hour that is already booked stays BOOKED even once it has elapsed. PAST
 * only ever replaces a free hour, so history still reads as history.
 */
export function buildDayAvailability(
  config: Pick<CourtRentalConfig, 'windows' | 'coachingWindows' | 'dateOverrides' | 'hourlyRatePaise'>,
  date: string,
  bookings: Pick<CourtBookingDocument, 'id' | 'date' | 'startHour' | 'hours' | 'status' | 'bookerName'>[],
  now?: { date: string; time: string },
): CourtSlot[] {
  const dow = weekdayOf(date);
  const windows = config.windows?.[dow] ?? [];
  const coaching = config.coachingWindows?.[dow] ?? [];
  const overrides = config.dateOverrides?.[date] ?? {};

  const coachingHours = new Set(coaching.flatMap((w) => expandHours(w.start, w.end)));

  // hour → booking occupying it
  const occupied = new Map<string, { id: string; name: string; status: CourtBookingStatus }>();
  bookings
    .filter((b) => b.date === date && OCCUPYING_STATUSES.includes(b.status))
    .forEach((b) => {
      for (let i = 0; i < Math.max(1, b.hours); i++) {
        occupied.set(addHour(b.startHour, i), {
          id: b.id, name: b.bookerName, status: b.status,
        });
      }
    });

  const slots: CourtSlot[] = [];
  windows.forEach((w) => {
    expandHours(w.start, w.end).forEach((hour) => {
      if (coachingHours.has(hour)) {
        slots.push({ hour, endHour: addHour(hour), state: 'COACHING', bookingId: null, bookerName: null, ratePaise: 0 });
        return;
      }
      const taken = occupied.get(hour);
      if (taken) {
        slots.push({
          hour,
          endHour: addHour(hour),
          state: taken.status === 'CONFIRMED' ? 'BOOKED' : 'HELD',
          bookingId: taken.id,
          bookerName: taken.name,
          ratePaise: config.hourlyRatePaise,
        });
        return;
      }
      // Override beats the window default, so a normally-closed hour can be
      // opened for one date and vice versa.
      const isOpen = overrides[hour] ?? w.open;
      const past = now ? isHourPast(date, hour, now) : false;
      slots.push({
        hour,
        endHour: addHour(hour),
        state: past ? 'PAST' : isOpen ? 'AVAILABLE' : 'CLOSED',
        bookingId: null,
        bookerName: null,
        ratePaise: config.hourlyRatePaise,
      });
    });
  });

  return slots.sort((a, b) => hourToMinutes(a.hour) - hourToMinutes(b.hour));
}

/** Hours a booking would occupy — used to detect a clash before writing. */
export function bookingHours(startHour: string, hours: number): string[] {
  return Array.from({ length: Math.max(1, hours) }, (_, i) => addHour(startHour, i));
}

/** Whether every requested hour is currently AVAILABLE. */
export function canBook(slots: CourtSlot[], startHour: string, hours: number): boolean {
  const want = new Set(bookingHours(startHour, hours));
  const byHour = new Map(slots.map((s) => [s.hour, s]));
  for (const h of want) {
    const s = byHour.get(h);
    if (!s || s.state !== 'AVAILABLE') return false;
  }
  return true;
}

// ── Month navigation ─────────────────────────────────────────────────────────

/** "2026-08" → every date in it, as YYYY-MM-DD. */
export function datesInMonth(yearMonth: string): string[] {
  const [y, m] = yearMonth.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${yearMonth}-${String(i + 1).padStart(2, '0')}`);
}

/** "2026-08" → "2026-09". */
export function nextMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * The dates in a month that can still be booked.
 *
 * "Can still" is doing the work: a date with no windows at all (a weekday,
 * here) never appears, and neither does one whose sellable hours have all
 * elapsed. Without the second test, Saturday morning stays in the picker
 * until midnight, and anyone tapping it finds an empty grid and assumes the
 * page is broken.
 */
export function bookableDatesInMonth(
  config: Pick<CourtRentalConfig, 'windows' | 'coachingWindows' | 'dateOverrides' | 'hourlyRatePaise'>,
  yearMonth: string,
  now: { date: string; time: string },
): string[] {
  return datesInMonth(yearMonth)
    .filter((d) => d >= now.date)
    .filter((d) => buildDayAvailability(config, d, [], now).some((s) => s.state === 'AVAILABLE'));
}

/**
 * Which weekdays this centre ever sells hours on — the choices in a monthly
 * plan. Derived from the config rather than hard-coded to Sat/Sun, so a
 * weekday evening window added later shows up on its own.
 */
export function sellableWeekdays(
  config: Pick<CourtRentalConfig, 'windows' | 'coachingWindows'>,
): number[] {
  return Object.keys(config.windows ?? {})
    .map(Number)
    .filter((dow) => (config.windows[dow] ?? []).some((w) => w.open))
    .sort((a, b) => a - b);
}

/**
 * The last date currently on sale.
 *
 * Next month opens on the 25th of this one. Before then the page shows this
 * month only; from the 25th it shows both. Without a rule like this, an empty
 * next month sits there all month looking broken, and someone books a Saturday
 * six weeks out that the coaching timetable hasn't been decided for yet.
 *
 * The admin grid is not subject to this — Jaydeep arranges things ahead of the
 * public release date, which is rather the point of having one.
 */
export function publicBookingHorizon(
  now: { date: string; time: string },
  opensOnDay = 25,
): string {
  const month = now.date.slice(0, 7);
  const day = Number(now.date.slice(8, 10));
  return day >= opensOnDay ? endOfMonthDate(nextMonth(month)) : endOfMonthDate(month);
}

/** "2026-09" → "2026-09-30". */
export function endOfMonthDate(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return `${yearMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}
