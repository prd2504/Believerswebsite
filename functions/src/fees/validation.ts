import { z } from 'zod';

export const submitFeePaymentSchema = z.object({
  centreCode: z.string().min(2).max(5).transform((s) => s.trim().toUpperCase()),
  studentId: z.string().optional(),
  studentName: z.string().min(1).optional(),
  externalStudentId: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().nullable(),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM format'),
  amountRupees: z.number().positive('Amount must be positive'),
  method: z.enum(['UPI', 'CASH', 'BANK_TRANSFER']),
  screenshotUrl: z.string().url().optional().nullable(),
  coachName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Lets the backend auto-enrol a student with no batch link yet (e.g. just
  // self-registered) into whichever batch at the centre offers this many
  // days/week — see onFeePaymentCreated.ts.
  daysPerWeek: z.number().int().min(1).max(7).optional(),
}).refine(
  (d) => d.studentId || d.studentName || d.externalStudentId || d.phone,
  { message: 'At least one of studentId, studentName, externalStudentId, or phone is required' },
);

export type SubmitFeePaymentInput = z.infer<typeof submitFeePaymentSchema>;

export const lookupStudentSchema = z.object({
  centreCode: z.string().min(2).max(5).transform((s) => s.trim().toUpperCase()),
  phone: z.string().min(10).max(15),
});

export type LookupStudentInput = z.infer<typeof lookupStudentSchema>;

export const searchStudentsSchema = z.object({
  centreCode: z.string().min(2).max(5).transform((s) => s.trim().toUpperCase()),
});

export type SearchStudentsInput = z.infer<typeof searchStudentsSchema>;

export const registerStudentSchema = z.object({
  centreCode: z.string().min(2).max(5).transform((s) => s.trim().toUpperCase()),
  name: z.string().min(2, 'Name is required').max(80).transform((s) => s.trim()),
  phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits'),
  email: z.string().email('Invalid email').optional(),
  // Set true to bypass the "phone already has a player" guard when the parent
  // has confirmed this really is a new player (e.g. a sibling on the same number).
  confirmNew: z.boolean().optional(),
});

export type RegisterStudentInput = z.infer<typeof registerStudentSchema>;
