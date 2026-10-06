/**
 * Who belongs on a register, and whether a register was taken on time.
 *
 * The register used to list every ACTIVE enrolment, and nothing ever ended an
 * enrolment when fees stopped — so a child who left two months ago was still
 * marked absent every day, inflating every count built on attendance. Fee
 * standing now decides who is expected; enrolment only decides where and when.
 *
 * Pure functions, shared by the register UI, the 30-minute watchdog and the
 * nightly digest, so all three always agree on who is expected.
 */

import type { IsoDate, YearMonth } from './common.js';
import { addMonths, coveredMonths, paymentCoverage } from './payment.js';

/** Fees for a month are due by this day; until then last month's payers stay on the register. */
export const FEE_GRACE_DAY = 7;
/** A new enrolment stays on the register this many days while its first fee is collected. */
export const NEW_JOINER_GRACE_DAYS = 14;

export const RegisterFeeState = {
  /** Has a paid payment covering the session's month. */
  PAID: 'PAID',
  /** Paid last month, not yet this month, and still inside the grace window. */
  DUE: 'DUE',
  /** Enrolled recently, first fee not yet recorded. */
  NEW: 'NEW',
  /** Enrolment paused for this month. */
  PAUSED: 'PAUSED',
  /** None of the above — not expected; off the register unless they turn up. */
  UNPAID: 'UNPAID',
} as const;
export type RegisterFeeState = (typeof RegisterFeeState)[keyof typeof RegisterFeeState];

export function isExpectedOnRegister(state: RegisterFeeState): boolean {
  return state === 'PAID' || state === 'DUE' || state === 'NEW';
}

function dayNumber(isoDate: IsoDate): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000);
}

export function registerFeeState(input: {
  /** Months covered by the student's paid payments (student.feeMonths). */
  feeMonths: readonly YearMonth[] | null | undefined;
  /** Enrolment start date (enrollment.startDate). */
  enrolledOn: IsoDate | null | undefined;
  pausedMonths?: readonly YearMonth[] | null;
  sessionDate: IsoDate;
}): RegisterFeeState {
  const month = input.sessionDate.slice(0, 7);
  const months = input.feeMonths ?? [];
  if (months.includes(month)) return 'PAID';
  if (input.pausedMonths?.includes(month)) return 'PAUSED';
  if (input.enrolledOn) {
    const age = dayNumber(input.sessionDate) - dayNumber(input.enrolledOn);
    if (age >= 0 && age <= NEW_JOINER_GRACE_DAYS) return 'NEW';
  }
  const dayOfMonth = Number(input.sessionDate.slice(8, 10));
  if (dayOfMonth <= FEE_GRACE_DAY && months.includes(addMonths(month, -1))) return 'DUE';
  return 'UNPAID';
}

/**
 * Every month a student's paid payments cover, sorted. Refunded, waived and
 * pending payments hold no months. Legacy payments without coverage fields
 * read as single-month, exactly as everywhere else.
 */
export function feeStandingFromPayments(
  payments: ReadonlyArray<{
    month: string;
    status: string;
    coverageMonths?: number | null;
    coverageEndMonth?: string | null;
  }>,
): { months: YearMonth[]; coveredThrough: YearMonth | null } {
  const set = new Set<string>();
  for (const p of payments) {
    if (p.status !== 'PAID' || !/^\d{4}-\d{2}$/.test(p.month ?? '')) continue;
    const cov = paymentCoverage(p);
    coveredMonths(cov.start, cov.months).forEach((m) => set.add(m));
  }
  const months = Array.from(set).sort();
  return { months, coveredThrough: months.length ? months[months.length - 1] : null };
}

// ── Register punctuality ────────────────────────────────────────────────────

/** Nudge the coach this long after a session ends with no register. */
export const REGISTER_REMINDER_AFTER_MINUTES = 30;
/** A register taken within this long of the session ending counts as on time. */
export const REGISTER_ON_TIME_MINUTES = 60;
/** Tell the centre manager if a register is still missing this long after the end. */
export const REGISTER_ESCALATE_AFTER_MINUTES = 120;

export const RegisterStatus = {
  ON_TIME: 'ON_TIME',
  LATE: 'LATE',
  /** Not taken yet, but still inside the on-time window. */
  PENDING: 'PENDING',
  MISSING: 'MISSING',
  NOT_HELD: 'NOT_HELD',
} as const;
export type RegisterStatus = (typeof RegisterStatus)[keyof typeof RegisterStatus];

/** Epoch ms of an IST wall-clock date + "HH:mm". */
export function istWallClockMs(date: IsoDate, time: string): number {
  return Date.parse(`${date}T${time || '23:59'}:00+05:30`);
}

/** When a batch's last slot ends ("HH:mm"). */
export function batchEndTime(batch: {
  endTime?: string | null;
  timeSlots?: ReadonlyArray<{ endTime?: string | null }> | null;
}): string {
  const ends = [batch.endTime ?? '', ...(batch.timeSlots ?? []).map((s) => s.endTime ?? '')]
    .filter((t) => /^\d{2}:\d{2}$/.test(t));
  return ends.sort().pop() ?? '23:59';
}

export function registerStatus(input: {
  sessionDate: IsoDate;
  endTime: string;
  /** When the register was first saved (ISO). Null if never. */
  takenAt: string | null;
  cancelled: boolean;
  nowMs: number;
}): { status: RegisterStatus; minutesAfterEnd: number | null } {
  if (input.cancelled) return { status: 'NOT_HELD', minutesAfterEnd: null };
  const endMs = istWallClockMs(input.sessionDate, input.endTime);
  if (input.takenAt) {
    const mins = Math.round((Date.parse(input.takenAt) - endMs) / 60_000);
    return { status: mins <= REGISTER_ON_TIME_MINUTES ? 'ON_TIME' : 'LATE', minutesAfterEnd: mins };
  }
  const mins = Math.round((input.nowMs - endMs) / 60_000);
  return { status: mins <= REGISTER_ON_TIME_MINUTES ? 'PENDING' : 'MISSING', minutesAfterEnd: mins };
}

/** Reasons a coach can give for a session that did not happen. */
export const SESSION_NOT_HELD_REASONS = [
  'Rain / weather',
  'Holiday',
  'Court unavailable',
  'Coach unavailable',
  'Other',
] as const;

/**
 * One day's register outcome per batch, written nightly to
 * /attendanceDaily/{YYYY-MM-DD}. Keeps a durable record of punctuality so a
 * month of compliance is one query, not a re-derivation from edited sessions.
 */
export interface AttendanceDailySession {
  batchId: string;
  batchName: string;
  centreId: string;
  coachIds: string[];
  endTime: string;
  status: RegisterStatus;
  minutesAfterEnd: number | null;
  expected: number;
  present: number;
  absent: number;
  unpaidPresent: number;
  trials: number;
  notHeldReason: string | null;
}

export interface AttendanceDailyDocument {
  date: IsoDate;
  generatedAt: string;
  sessions: AttendanceDailySession[];
}
