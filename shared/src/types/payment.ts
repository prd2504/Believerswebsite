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
  NONE: 'NONE',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export interface PaymentDocument extends BaseDocument {
  id: string;

  studentId: string;
  batchId: string;
  centreId: string;

  /** The fee month this payment applies to, e.g. "2026-04". */
  month: YearMonth;

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
