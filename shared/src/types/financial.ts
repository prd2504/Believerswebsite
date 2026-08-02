import type { BaseDocument, IsoDate, IsoTimestamp, YearMonth } from './common.js';

export const ExpenseCategory = {
  RENT: 'RENT',
  EQUIPMENT: 'EQUIPMENT',
  MAINTENANCE: 'MAINTENANCE',
  UTILITIES: 'UTILITIES',
  COACH_SALARY: 'COACH_SALARY',
  MARKETING: 'MARKETING',
  OTHER: 'OTHER',
} as const;
export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];

export interface CentreExpenseDocument extends BaseDocument {
  id: string;
  centreId: string;
  category: ExpenseCategory;
  description: string;
  amountPaise: number;
  expenseDate: IsoDate;
  yearMonth: YearMonth;
  receiptPath: string | null;
  approvedBy: string | null;
}

/**
 * A fixed cost that recurs every month for a centre — rent, utilities, internet.
 * Defined once, then materialised into a real CentreExpenseDocument per month so
 * the P&L reads from one place (centreExpenses) and a posted month stays
 * editable without disturbing the template it came from.
 */
export interface RecurringExpenseDocument extends BaseDocument {
  id: string;
  centreId: string;
  category: ExpenseCategory;
  description: string;
  amountPaise: number;
  /** Day of month to date the posted expense. Capped at 28 so every month has it. */
  dayOfMonth: number;
  /** First month this applies to, inclusive. */
  startMonth: YearMonth;
  /** Last month this applies to, inclusive. null = ongoing. */
  endMonth: YearMonth | null;
  active: boolean;
}

/** Sortable rank for a YYYY-MM, so months compare correctly across a year boundary. */
export function yearMonthRank(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
}

/** Whether a template should produce an expense for the given month. */
export function recurringAppliesTo(
  t: Pick<RecurringExpenseDocument, 'active' | 'startMonth' | 'endMonth'>,
  yearMonth: string,
): boolean {
  if (!t.active) return false;
  const target = yearMonthRank(yearMonth);
  if (target < yearMonthRank(t.startMonth)) return false;
  if (t.endMonth && target > yearMonthRank(t.endMonth)) return false;
  return true;
}

/**
 * Deterministic id for the expense a template produces in a month. Posting is
 * therefore idempotent — re-running a month updates the same rows instead of
 * charging the centre twice.
 */
export function postedRecurringExpenseId(templateId: string, yearMonth: string): string {
  return `recurring_${templateId}_${yearMonth}`;
}

export const PayoutStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  DISPUTED: 'DISPUTED',
} as const;
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];

export interface PartnerPayoutDocument extends BaseDocument {
  id: string;
  centreId: string;
  partnerName: string;
  amountPaise: number;
  yearMonth: YearMonth;
  payoutDate: IsoDate | null;
  status: PayoutStatus;
  method: string;
  referenceNumber: string | null;
  notes: string | null;
}
