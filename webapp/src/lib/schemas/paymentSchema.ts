/**
 * Zod schema for payment/fee forms. Monetary values in the form are in rupees;
 * the service layer converts to paise before writing to Firestore.
 */

import { z } from 'zod';

export const paymentFormSchema = z.object({
  studentId: z.string().min(1, 'Select a student'),
  batchId: z.string().min(1, 'Select a batch'),
  centreId: z.string().min(1, 'Select a centre'),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM format'),
  baseAmountRupees: z.number().min(0, 'Amount must be positive'),
  gstRatePercent: z.number().min(0).max(100),
  method: z.enum(['CASH', 'RAZORPAY', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'NONE']),
  status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'WAIVED', 'REFUNDED']),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format').nullable().or(z.literal('')),
  notes: z.string().optional(),
});

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export function defaultPaymentFormValues(centreId?: string, gstRate?: number): PaymentFormValues {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {
    studentId: '',
    batchId: '',
    centreId: centreId ?? '',
    month,
    baseAmountRupees: 0,
    gstRatePercent: gstRate ?? 18,
    method: 'CASH',
    status: 'PENDING',
    dueDate: '',
    notes: '',
  };
}
