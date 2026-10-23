/**
 * Payments / Fees. Lives at /payments/{paymentId} as a flat top-level collection. Queries
 * by studentId / batchId / status / month use composite indexes.
 *
 * Monetary amounts are stored in paise (INR × 100) as integers. Never use floats for
 * money — rounding errors compound over a year of monthly receipts.
 */

import type { BaseDocument, YearMonth } from './common.js';

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  WAIVED: 'WAIVED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethod = {
  CASH: 'CASH',
  RAZORPAY: 'RAZORPAY',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CHEQUE: 'CHEQUE',
  UPI: 'UPI',
  NONE: 'NONE',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentSource = {
  SHEETS_FORM: 'SHEETS_FORM',
  PUBLIC_FEES_PAGE: 'PUBLIC_FEES_PAGE',
  ADMIN_MANUAL: 'ADMIN_MANUAL',
  RAZORPAY: 'RAZORPAY',
} as const;
export type PaymentSource = (typeof PaymentSource)[keyof typeof PaymentSource];

// ── Billing cycle ────────────────────────────────────────────────────────────

export const BillingCycle = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
} as const;
export type BillingCycle = (typeof BillingCycle)[keyof typeof BillingCycle];

/** Months of coverage each cycle buys. */
export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
};

/**
 * Quarterly price = monthly × this. 2.8 means "pay for 2.8 months, get 3" —
 * a 6.67% discount that happens to land every current plan on a clean ₹200
 * multiple, which matters for UPI amounts people type by hand.
 *
 * THE single source of the discount. Never hardcode a quarterly price
 * anywhere; derive it, so changing this one number reprices every plan at
 * every centre consistently.
 */
export const QUARTERLY_MULTIPLIER = 2.8;

/**
 * The first fee month quarterly may be bought for. Before this, the option is
 * hidden entirely — lets the whole feature ship and be tested ahead of launch
 * without changing anything for parents paying for an earlier month.
 */
export const QUARTERLY_LAUNCH_MONTH = '2026-09';

/** Quarterly price in paise, rounded to whole rupees so no stray paise appear. */
export function quarterlyAmountPaise(monthlyPaise: number): number {
  return Math.round((monthlyPaise * QUARTERLY_MULTIPLIER) / 100) * 100;
}

/** What a cycle costs, given the monthly rate. */
export function cycleAmountPaise(monthlyPaise: number, cycle: BillingCycle): number {
  return cycle === 'QUARTERLY' ? quarterlyAmountPaise(monthlyPaise) : monthlyPaise;
}

/** What the payer saves vs paying month-by-month. Zero for monthly. */
export function cycleSavingPaise(monthlyPaise: number, cycle: BillingCycle): number {
  return monthlyPaise * CYCLE_MONTHS[cycle] - cycleAmountPaise(monthlyPaise, cycle);
}

// ── Coverage maths ───────────────────────────────────────────────────────────
// Quarters roll from whenever the payment is made (Oct → Oct/Nov/Dec), rather
// than snapping to fixed calendar quarters. Renewals then spread across the
// year instead of stacking into one mass-renewal cliff.

/** Sortable rank for a YYYY-MM, so months compare correctly across a year end. */
export function monthRank(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  return y * 12 + (m - 1);
}

/** Shift a YYYY-MM by n months. */
export function addMonths(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Last month covered, inclusive. 2026-09 + 3 months → 2026-11 (not 2026-12). */
export function coverageEndMonth(startMonth: string, months: number): string {
  return addMonths(startMonth, Math.max(1, months) - 1);
}

/** Every month a payment covers, inclusive of both ends. */
export function coveredMonths(startMonth: string, months: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.max(1, months); i++) out.push(addMonths(startMonth, i));
  return out;
}

/**
 * Coverage of a payment, tolerant of legacy rows.
 *
 * Payments written before quarterly existed have no cycle fields at all. They
 * were all single-month, so they read as monthly covering exactly their own
 * month — leaving every historical figure unchanged.
 */
export function paymentCoverage(p: {
  month: string;
  coverageMonths?: number | null;
  coverageEndMonth?: string | null;
}): { start: string; end: string; months: number } {
  const months = p.coverageMonths && p.coverageMonths > 0 ? p.coverageMonths : 1;
  return {
    start: p.month,
    end: p.coverageEndMonth || coverageEndMonth(p.month, months),
    months,
  };
}

/** Whether a payment's coverage includes the given month. */
export function paymentCoversMonth(
  p: { month: string; coverageMonths?: number | null; coverageEndMonth?: string | null },
  yearMonth: string,
): boolean {
  const c = paymentCoverage(p);
  const r = monthRank(yearMonth);
  return r >= monthRank(c.start) && r <= monthRank(c.end);
}

/**
 * Whether two coverage windows overlap at all.
 *
 * This is what stops a double charge: today's duplicate check is
 * studentId + month + batchId, which a quarterly payment walks straight
 * past — pay quarterly in September, then monthly in October, and the months
 * differ so nothing clashes. Overlap detection catches it.
 */
export function coverageOverlaps(
  a: { month: string; coverageMonths?: number | null; coverageEndMonth?: string | null },
  b: { month: string; coverageMonths?: number | null; coverageEndMonth?: string | null },
): boolean {
  const ca = paymentCoverage(a);
  const cb = paymentCoverage(b);
  return monthRank(ca.start) <= monthRank(cb.end) && monthRank(cb.start) <= monthRank(ca.end);
}

/**
 * Month abbreviations, spelled explicitly rather than via toLocaleDateString.
 *
 * en-IN renders September as "Sept", not "Sep" — so a locale-derived label
 * would silently disagree with the Sheets Month column and the Cloud
 * Function's formatMonth, both of which use these exact three-letter forms.
 * A locale-dependent month string is precisely what broke the Sheets
 * rollover for two months; don't reintroduce one.
 */
export const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** "Sep 2026" for a single month. */
export function formatMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const abbr = MONTH_ABBR[m - 1];
  return abbr ? `${abbr} ${y}` : yearMonth;
}

/** "Sep 2026" / "Sep – Nov 2026" for UI and emails. */
export function formatCoverage(startMonth: string, months: number): string {
  if (months <= 1) return formatMonthLabel(startMonth);
  const end = coverageEndMonth(startMonth, months);
  const startAbbr = MONTH_ABBR[Number(startMonth.split('-')[1]) - 1] ?? startMonth;
  return `${startAbbr} – ${formatMonthLabel(end)}`;
}



export interface PaymentDocument extends BaseDocument {
  id: string;

  studentId: string;
  batchId: string;
  centreId: string;

  /**
   * The fee month this payment applies to, e.g. "2026-04". For a quarterly
   * payment this is the FIRST month covered; see coverageEndMonth.
   */
  month: YearMonth;

  /**
   * Monthly or quarterly. Absent on payments written before quarterly
   * existed — those read as MONTHLY, so historical data is unaffected.
   */
  billingCycle?: BillingCycle | null;
  /** Months covered: 1 for monthly, 3 for quarterly. Absent → 1. */
  coverageMonths?: number | null;
  /**
   * Last month covered, inclusive. Stored rather than derived because
   * "who expires in November" has to be a Firestore query, and Firestore
   * cannot compute it at read time.
   */
  coverageEndMonth?: YearMonth | null;

  /** Base amount in paise — excludes GST. */
  baseAmountPaise: number;
  /** GST amount in paise. Computed at creation time from the centre's GST rate. */
  gstAmountPaise: number;
  /** Total the customer is billed — baseAmountPaise + gstAmountPaise. */
  totalAmountPaise: number;

  /** The rate used at creation, snapshotted so historical receipts stay correct. */
  gstRatePercentSnapshot: number;

  status: PaymentStatus;
  method: PaymentMethod;

  /** YYYY-MM-DD — when the customer must pay by. Nullable for ad-hoc payments. */
  dueDate: string | null;
  /** ISO UTC timestamp — when the payment was actually received. */
  paidAt: string | null;

  /**
   * Razorpay integration fields. Always present in the schema but null until a live
   * Razorpay order is created. Gated by the RAZORPAY_LIVE feature flag.
   */
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpaySignature: string | null;

  /** Free-text note. For CASH payments admin typically writes "Received cash". */
  notes: string | null;

  /** GST-compliant receipt number — generated on mark-as-paid. Format: BBA/YYYY-YY/NNNNN. */
  receiptNumber: string | null;
  /** Storage path (not public URL) of the rendered PDF receipt. Lazy-generated. */
  receiptPdfPath: string | null;

  /** Sheets-compatible external invoice number, e.g. "BBA-DAD-001". Null for legacy payments. */
  externalInvoiceNo: string | null;
  /** Storage path or URL to the payment proof screenshot. Null when not provided. */
  screenshotUrl: string | null;
  /** Name of the coach who collected this payment, if applicable. */
  coachName: string | null;
  /** Where this payment originated. Null for legacy payments. */
  paymentSource: PaymentSource | null;
}

/**
 * A lightweight monthly rollup snapshot, written when an admin "closes" the month.
 * Doc id is `${centreId}_${yearMonth}` so a centre's months are easy to fetch.
 * Once `closedAt` is set the UI treats the month as read-only (the underlying
 * /payments docs are still mutable by super-admin, but the close prevents normal
 * collection workflows from accidentally backdating).
 */
export interface PaymentMonthlySummary {
  yearMonth: YearMonth;
  centreId: string;
  totalBilledPaise: number;
  totalCollectedPaise: number;
  totalOverduePaise: number;
  countPaid: number;
  countPending: number;
  countOverdue: number;
  countWaived: number;

  /** ISO timestamp when this month was closed. Null while still open. */
  closedAt: string | null;
  /** uid of admin who closed the month. Null while open. */
  closedBy: string | null;
}
