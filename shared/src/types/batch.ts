/**
 * Batch — a recurring time slot at a centre. Lives at /batches/{batchId}.
 *
 * A batch is the (Centre + TimeSlot) container. It defines:
 *   - which days of the week the slot is offered (e.g. Mon–Fri)
 *   - the fixed daily time window (e.g. 16:00–17:00 IST)
 *   - which frequency plans are available (2/3/4/5 days per week, each with its own fee)
 *
 * Students don't enrol "into" a batch with a fixed schedule. Instead, an Enrollment
 * picks one frequency plan and the specific subset of days the student attends.
 * See /shared/src/types/enrollment.ts.
 *
 * Attendance and progress are still anchored to batchId + sessionDate.
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

/**
 * Day-of-week indices matching JavaScript Date.getDay(): 0 = Sunday, 6 = Saturday.
 * Use the named constants instead of magic numbers in UI code.
 */
export const DayOfWeek = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
} as const;
export type DayOfWeek = (typeof DayOfWeek)[keyof typeof DayOfWeek];

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export const DAY_OF_WEEK_SHORT: Record<DayOfWeek, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

/**
 * One pricing tier within a batch. The student picks a daysPerWeek when enrolling and
 * pays the corresponding monthlyFeePaise. Snapshot of (daysPerWeek, monthlyFeePaise) is
 * frozen onto the EnrollmentDocument so historical fees stay intact if the batch's
 * pricing changes later.
 */
export interface FrequencyPlan {
  /** Number of weekly sessions the student commits to (must be <= offeredDays.length). */
  daysPerWeek: number;
  /** Monthly fee in paise for this plan. */
  monthlyFeePaise: number;
}

export interface BatchDocument extends BaseDocument {
  id: string;

  /** Parent centre. Denormalised for fast filtering. */
  centreId: string;

  /** Display name, e.g. "Dadar 4–5 PM Beginner". Admin-defined. */
  name: string;
  /** Longer description shown on the batch detail page. */
  description: string;

  sport: SportType;
  level: BatchLevel;

  /** Fixed daily start time, "HH:mm" 24-hour IST. Same every offered day. */
  startTime: string;
  /** Fixed daily end time, "HH:mm" 24-hour IST. */
  endTime: string;

  /**
   * Days of the week on which this batch runs. Students choose a subset of these
   * (sized by the frequency plan they pick). For a typical weekday batch this is
   * [MON, TUE, WED, THU, FRI].
   */
  offeredDays: DayOfWeek[];

  /**
   * Available pricing tiers. Most centres will define 4 plans (2/3/4/5 days/week)
   * but the structure supports any combination as long as daysPerWeek <= offeredDays.length.
   */
  frequencyPlans: FrequencyPlan[];

  /** Maximum total enrolled students across all plans. Drives capacity checks. */
  maxCapacity: number;
  /** Current enrolment count — denormalised for dashboard speed. */
  currentEnrolment: number;

  /** Coach user ids assigned to this batch. At least one on active batches. */
  coachIds: string[];

  /**
   * All actively enrolled student ids (derived from /enrollments). Denormalised mirror
   * for fast batch detail reads. Updated by the enrollment service in a transaction.
   */
  studentIds: string[];

  status: BatchStatus;

  /**
   * Optional sub-slots within the batch's overall startTime–endTime window.
   * Use when one continuous block (e.g. 6–9 AM) hosts multiple 1-hour groups.
   * Each enrolled student picks one slot; attendance view groups by slot.
   * Empty array = single undivided slot. Existing docs without this field read as [].
   */
  timeSlots: TimeSlot[];
}

/**
 * A sub-slot within a batch's overall time window — e.g. "6:00–7:00 AM" inside
 * a "Morning 6–9 AM" batch. Students enrol into one specific slot.
 */
export interface TimeSlot {
  /** "HH:mm" 24-hour IST. */
  startTime: string;
  /** "HH:mm" 24-hour IST. */
  endTime: string;
  /** Display label shown in the roster/attendance view. E.g. "Junior Group". */
  label: string;
}
