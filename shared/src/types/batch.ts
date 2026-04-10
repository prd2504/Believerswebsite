/**
 * Batch — a recurring coaching slot within a centre. Lives at /batches/{batchId}.
 *
 * A batch is the operational unit coaches teach and students enrol into. It defines
 * schedule, capacity, fee, and level. Attendance and progress are always anchored to a
 * batchId + sessionDate.
 */

import type { BaseDocument } from './common.js';
import type { SportType } from './centre.js';

export const BatchLevel = {
  BEGINNER: 'BEGINNER',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
} as const;
export type BatchLevel = (typeof BatchLevel)[keyof typeof BatchLevel];

export const BatchStatus = {
  /** Normal operation — new enrolments allowed. */
  ACTIVE: 'ACTIVE',
  /** Running, but not accepting new enrolments. */
  PAUSED: 'PAUSED',
  /** Ended / retired — read-only historical record. */
  INACTIVE: 'INACTIVE',
} as const;
export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];

/** Day-of-week indices matching JavaScript Date.getDay(): 0 = Sunday. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A recurring weekly time slot for the batch. */
export interface BatchTimeSlot {
  dayOfWeek: DayOfWeek;
  /** "HH:mm" in 24-hour IST. */
  startTime: string;
  /** "HH:mm" in 24-hour IST. */
  endTime: string;
}

export interface BatchDocument extends BaseDocument {
  id: string;

  /** Parent centre. Denormalised for fast filtering. */
  centreId: string;

  /** Display name, e.g. "Morning Juniors". Admin-defined. */
  name: string;
  /** Longer description shown on the batch detail page. */
  description: string;

  sport: SportType;
  level: BatchLevel;

  /** Weekly recurring schedule — at least one slot required. */
  schedule: BatchTimeSlot[];

  /** Maximum number of enrolled students. Drives capacity checks on enrolment. */
  maxCapacity: number;

  /** Current enrolment count — denormalised for dashboard speed. */
  currentEnrolment: number;

  /** Monthly fee in paise (smallest INR unit). Always integer — avoid float rounding. */
  monthlyFeePaise: number;

  /** Coach user ids assigned to this batch. At least one on active batches. */
  coachIds: string[];

  /** Student ids currently enrolled. Mirrors the `/students/{id}.batchIds` field. */
  studentIds: string[];

  status: BatchStatus;
}
