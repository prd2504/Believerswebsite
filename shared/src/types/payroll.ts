import type { BaseDocument, YearMonth, IsoTimestamp } from './common.js';

export const EmploymentType = {
  SALARIED: 'SALARIED',
  PER_SESSION: 'PER_SESSION',
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];

export const PayrollRunStatus = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  PAID: 'PAID',
} as const;
export type PayrollRunStatus = (typeof PayrollRunStatus)[keyof typeof PayrollRunStatus];

export interface StaffDocument extends BaseDocument {
  id: string;
  staffCode: string;
  name: string;
  phone: string | null;
  email: string | null;
  authUid: string | null;
  centreIds: string[];
  employmentType: EmploymentType;
  /** Monthly basic salary in paise (salaried) or per-session rate in paise (per-session). */
  ratePaise: number;
  bankAccountLast4: string | null;
  upiId: string | null;
  dateOfJoining: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface PayrollRunDocument extends BaseDocument {
  id: string;
  staffId: string;
  staffName: string;
  centreIds: string[];
  month: YearMonth;
  employmentType: EmploymentType;

  sessionsCount: number;
  basicPaise: number;
  perSessionPayPaise: number;
  allowancesPaise: number;

  professionalTaxPaise: number;
  tdsPaise: number;
  advanceRecoveryPaise: number;
  otherDeductionsPaise: number;

  grossPayPaise: number;
  totalDeductionsPaise: number;
  netPayPaise: number;

  status: PayrollRunStatus;
  approvedBy: string | null;
  approvedAt: IsoTimestamp | null;
  paymentRef: string | null;
  paidAt: IsoTimestamp | null;
  notes: string | null;
}
