/**
 * Gate passes for centres where entry is controlled.
 *
 * ── Two kinds, and only one of them is a document ──
 *
 * A STANDING pass is not stored anywhere. It is a view of what a player has
 * already paid: valid because a payment covers today, invalid the moment it
 * stops. Nothing to issue, expire, revoke or reconcile, and no second source
 * of truth to drift from the fees. A quarterly payer's pass is simply valid
 * for the quarter, because their payment is.
 *
 * Storing passes as their own records would mean a lapsed player holding a
 * valid pass until somebody remembered to revoke it — which is the exact
 * failure the gate exists to prevent.
 *
 * A DAY pass IS a document, because it has a life of its own: someone
 * requests it, someone else approves it, and it is good for one named date.
 * That is a decision trail, and a trail has to be stored.
 *
 * ── Why the design leans on colour rather than scanning ──
 * A guard checking forty people at 6 AM will not scan forty codes. So the
 * pass is built to be judged in about a second from arm's length: a large
 * month word, a validity date, and a background colour that changes every
 * month. Last month's pass is then wrong at a glance without anyone reading
 * a date — which is the only check that will actually happen every day.
 */

import type { IsoDate, YearMonth } from './common.js';

export const DayPassStatus = {
  /** Raised by a centre manager, waiting on a super admin. Not valid for entry. */
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type DayPassStatus = (typeof DayPassStatus)[keyof typeof DayPassStatus];

export const DayPassReason = {
  TRIAL: 'TRIAL',
  GUEST: 'GUEST',
  /** Paid late, or paying tomorrow — a deliberate extension rather than a favour. */
  FEE_EXTENSION: 'FEE_EXTENSION',
  MAKEUP: 'MAKEUP',
  OTHER: 'OTHER',
} as const;
export type DayPassReason = (typeof DayPassReason)[keyof typeof DayPassReason];

export const DAY_PASS_REASON_LABELS: Record<DayPassReason, string> = {
  TRIAL: 'Trial session',
  GUEST: 'Guest / friendly',
  FEE_EXTENSION: 'Fee extension',
  MAKEUP: 'Makeup session',
  OTHER: 'Other',
};

export interface DayPassDocument {
  id: string;
  centreId: string;
  centreCode: string;
  centreName: string;

  /** Who is coming in. Need not be a student — a guest usually is not. */
  personName: string;
  /** Set when the pass is for someone already on the books. */
  studentId: string | null;
  phone: string | null;
  email: string | null;

  reason: DayPassReason;
  notes: string | null;

  /** The single date this pass admits on. */
  validDate: IsoDate;

  status: DayPassStatus;
  /** Unguessable id for the public pass page. */
  token: string;

  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
}

// ── Month colours ────────────────────────────────────────────────────────────

/**
 * One colour per month, chosen so ADJACENT months look nothing alike.
 *
 * This is the actual security of the pass. A guard will not read a date forty
 * times a morning, but they cannot miss that today's passes are amber and the
 * one being shown is last month's teal. The palette is therefore ordered for
 * contrast between neighbours, not for prettiness across the year, and every
 * colour is dark enough to carry white text on a phone screen at arm's length
 * in daylight — and to survive a black-and-white printer as a distinct grey.
 */
export const MONTH_COLOURS: { bg: string; fg: string; name: string }[] = [
  { bg: '#1D4ED8', fg: '#FFFFFF', name: 'blue' },      // Jan
  { bg: '#BE123C', fg: '#FFFFFF', name: 'crimson' },   // Feb
  { bg: '#15803D', fg: '#FFFFFF', name: 'green' },     // Mar
  { bg: '#C2410C', fg: '#FFFFFF', name: 'orange' },    // Apr
  { bg: '#6D28D9', fg: '#FFFFFF', name: 'purple' },    // May
  { bg: '#0F766E', fg: '#FFFFFF', name: 'teal' },      // Jun
  { bg: '#B91C1C', fg: '#FFFFFF', name: 'red' },       // Jul
  { bg: '#3730A3', fg: '#FFFFFF', name: 'indigo' },    // Aug
  { bg: '#A16207', fg: '#FFFFFF', name: 'amber' },     // Sep
  { bg: '#9D174D', fg: '#FFFFFF', name: 'magenta' },   // Oct
  { bg: '#4D7C0F', fg: '#FFFFFF', name: 'olive' },     // Nov
  { bg: '#0C4A6E', fg: '#FFFFFF', name: 'navy' },      // Dec
];

/** Colour for a YYYY-MM. */
export function monthColour(yearMonth: string): { bg: string; fg: string; name: string } {
  const m = Number(String(yearMonth).slice(5, 7));
  return MONTH_COLOURS[Math.min(11, Math.max(0, m - 1))] ?? MONTH_COLOURS[0];
}

// ── The pass a page renders ──────────────────────────────────────────────────

export type PassKind = 'STANDING' | 'DAY';
export type PassState = 'VALID' | 'EXPIRED' | 'PENDING' | 'REJECTED' | 'UNKNOWN';

export interface PassView {
  kind: PassKind;
  state: PassState;

  personName: string;
  centreName: string;
  centreCode: string;
  /** Batch and timing, so the guard can see they belong to a session running now. */
  batchLabel: string | null;

  /** Big word across the top: "SEPTEMBER 2026", or a date for a day pass. */
  validLabel: string;
  /** "Valid until 30 Nov 2026" — the small print under it. */
  validUntilLabel: string;
  /** Months this pass covers, for the quarterly strip. Empty for a day pass. */
  coversMonths: YearMonth[];

  /** Drives the colour band. Day passes use their own date's month. */
  colourMonth: YearMonth;
  /** Short human code the office can look up: "DAD-0912-4F7K". */
  code: string;

  reasonLabel: string | null;
  /** Only set when EXPIRED, so the holder knows what to do about it. */
  message: string | null;
}

/**
 * A short code a person can read out over the phone.
 *
 * Not a security measure — the token in the URL is that. This is so Jaydeep
 * can find a pass someone is holding without asking them to spell a 32
 * character string.
 */
export function passCode(centreCode: string, validFrom: string, token: string): string {
  const ddmm = validFrom.slice(8, 10) + validFrom.slice(5, 7);
  return `${centreCode}-${ddmm}-${token.slice(0, 4).toUpperCase()}`;
}

/** Whether a day pass admits someone today. */
export function dayPassState(
  pass: Pick<DayPassDocument, 'status' | 'validDate'>,
  today: string,
): PassState {
  if (pass.status === 'REJECTED') return 'REJECTED';
  if (pass.status === 'PENDING_APPROVAL') return 'PENDING';
  return pass.validDate === today ? 'VALID' : 'EXPIRED';
}
