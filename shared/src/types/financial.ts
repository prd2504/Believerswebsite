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
