/**
 * Enrollment — links one student to one batch with a chosen frequency plan and the
 * specific days they attend. Lives at /enrollments/{enrollmentId}.
 *
 * The enrollmentId is `{studentId}_{batchId}` — naturally unique, naturally idempotent.
 * A student may only have one ACTIVE enrollment per batch at a time. Historical
 * enrollments (status=ENDED) coexist using a different docId pattern when they retire.
 *
 * Why a separate collection (vs. embedding in batch or student):
 *   - flexible per-student day selection without exploding batch combinations
 *   - clean query paths for "who's coming today at Dadar 4pm" (filter by selectedDays)
 *   - frozen fee snapshot survives batch pricing changes
 */

import type { BaseDocument, IsoDate } from './common.js';
import type { DayOfWeek } from './batch.js';

export const EnrollmentStatus = {
  /** Currently attending. */
  ACTIVE: 'ACTIVE',
  /** Temporarily paused (injury, travel). Fees usually waived for the period. */
  ON_HOLD: 'ON_HOLD',
  /** Closed — student left this batch (may have moved to another). */
  ENDED: 'ENDED',
} as const;
export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export interface EnrollmentDocument extends BaseDocument {
  id: string;

  studentId: string;
  batchId: string;
  /** Denormalised from the batch — used for centre-scoped queries without a join. */
  centreId: string;

  /** Frequency plan the student picked at enrolment (snapshot — immutable). */
  daysPerWeek: number;
  /**
   * Monthly fee in paise — frozen at enrolment time. Changing the batch's frequency
   * plans later does NOT update existing enrollments; the next monthly fee cycle uses
   * this snapshot. Manual upgrade/downgrade flows write a new value explicitly.
   */
  monthlyFeePaise: number;

  /**
   * The exact days the student attends each week. Length must equal daysPerWeek and
   * every entry must be a member of the batch's offeredDays. The attendance roster
   * for a session filters students whose selectedDays includes that session's day.
   */
  selectedDays: DayOfWeek[];

  /** YYYY-MM-DD when the student began attending under this enrollment. */
  startDate: IsoDate;
  /** YYYY-MM-DD when the enrollment ended; null while ACTIVE/ON_HOLD. */
  endDate: IsoDate | null;

  status: EnrollmentStatus;

  /**
   * Which time slot within the batch this student attends. "HH:mm" matching a
   * TimeSlot.startTime on the parent BatchDocument. Null when the batch has no
   * sub-slots (single undivided session). Existing enrollments without this field
   * read as null and are displayed under the batch's main startTime.
   */
  timeSlotStartTime: string | null;

  /** Optional free-text note (e.g. "Switched from 3 to 4 days on 2026-04-15"). */
  notes: string | null;
}

/**
 * Compose the deterministic enrollment id used for ACTIVE rows. Prevents duplicate
 * active enrollments of the same student into the same batch.
 */
export function makeEnrollmentId(studentId: string, batchId: string): string {
  return `${studentId}_${batchId}`;
}
