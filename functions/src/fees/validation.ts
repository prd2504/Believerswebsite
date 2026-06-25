import { z } from 'zod';

export const submitFeePaymentSchema = z.object({
  centreCode: z.string().min(2).max(5).transform((s) => s.trim().toUpperCase()),
  studentName: z.string().min(1).optional(),
  externalStudentId: z.string().optional(),
  phone: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM format'),
  amountRupees: z.number().positive('Amount must be positive'),
  method: z.enum(['UPI', 'CASH', 'BANK_TRANSFER']),
  screenshotUrl: z.string().url().optional().nullable(),
  coachName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine(
  (d) => d.studentName || d.externalStudentId || d.phone,
  { message: 'At least one of studentName, externalStudentId, or phone is required' },
);

export type SubmitFeePaymentInput = z.infer<typeof submitFeePaymentSchema>;

export const lookupStudentSchema = z.object({
  centreCode: z.string().min(2).max(5).transform((s) => s.trim().toUpperCase()),
  phone: z.string().min(10).max(15),
});

export type LookupStudentInput = z.infer<typeof lookupStudentSchema>;
