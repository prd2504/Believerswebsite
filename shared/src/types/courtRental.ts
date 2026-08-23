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
};

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

export type SlotState = 'AVAILABLE' | 'HELD' | 'BOOKED' | 'CLOSED' | 'COACHING';

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
 */
export function buildDayAvailability(
  config: Pick<CourtRentalConfig, 'windows' | 'coachingWindows' | 'dateOverrides' | 'hourlyRatePaise'>,
  date: string,
  bookings: Pick<CourtBookingDocument, 'id' | 'date' | 'startHour' | 'hours' | 'status' | 'bookerName'>[],
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
      slots.push({
        hour,
        endHour: addHour(hour),
        state: isOpen ? 'AVAILABLE' : 'CLOSED',
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
