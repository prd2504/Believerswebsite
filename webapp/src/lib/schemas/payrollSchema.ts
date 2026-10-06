import { z } from 'zod';

export const staffFormSchema = z.object({
  staffCode: z.string().min(1, 'Staff code is required'),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  centreIds: z.array(z.string()).min(1, 'Assign at least one centre'),
  employmentType: z.enum(['SALARIED', 'PER_SESSION']),
  rateRupees: z.number().min(0, 'Rate must be positive'),
  bankAccountLast4: z.string().max(4).optional().or(z.literal('')),
  upiId: z.string().optional().or(z.literal('')),
  dateOfJoining: z.string().optional().or(z.literal('')),
});

export type StaffFormValues = z.infer<typeof staffFormSchema>;

export function defaultStaffFormValues(): StaffFormValues {
  return {
    staffCode: '',
    name: '',
    phone: '',
    email: '',
    centreIds: [],
    employmentType: 'SALARIED',
    rateRupees: 0,
    bankAccountLast4: '',
    upiId: '',
    dateOfJoining: '',
  };
}

export const payrollRunFormSchema = z.object({
  staffId: z.string().min(1, 'Select a staff member'),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM format'),
  sessionsCount: z.number().min(0).default(0),
  basicRupees: z.number().min(0).default(0),
  perSessionPayRupees: z.number().min(0).default(0),
  allowancesRupees: z.number().min(0).default(0),
  professionalTaxRupees: z.number().min(0).default(0),
  tdsRupees: z.number().min(0).default(0),
  advanceRecoveryRupees: z.number().min(0).default(0),
  otherDeductionsRupees: z.number().min(0).default(0),
  notes: z.string().optional(),
});

export type PayrollRunFormValues = z.infer<typeof payrollRunFormSchema>;

export function defaultPayrollRunFormValues(): PayrollRunFormValues {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {
    staffId: '',
    month,
    sessionsCount: 0,
    basicRupees: 0,
    perSessionPayRupees: 0,
    allowancesRupees: 0,
    professionalTaxRupees: 0,
    tdsRupees: 0,
    advanceRecoveryRupees: 0,
    otherDeductionsRupees: 0,
    notes: '',
  };
}
