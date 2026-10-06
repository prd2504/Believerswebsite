/**
 * Zod schemas for attendance forms.
 */

import { z } from 'zod';

/** Schema for a single student's attendance mark. */
export const attendanceMarkSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  note: z.string().optional(),
});

/** Schema for the session-level attendance form (marks all students at once). */
export const sessionAttendanceSchema = z.object({
  batchId: z.string().min(1, 'Select a batch'),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  marks: z.array(attendanceMarkSchema).min(1, 'At least one student required'),
});

export type AttendanceMarkValues = z.infer<typeof attendanceMarkSchema>;
export type SessionAttendanceValues = z.infer<typeof sessionAttendanceSchema>;
