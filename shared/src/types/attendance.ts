/**
 * Attendance records. Stored under the nested path:
 *
 *   /attendance/{batchId}/sessions/{sessionId}/records/{recordId}
 *
 * The session id is the IST date of the session (YYYY-MM-DD) plus optional "-am" / "-pm"
 * suffix when a batch runs multiple slots per day. This makes sessions idempotent.
 *
 * Note on recordId: for REGULAR/MAKEUP/EXTRA records (where studentId is set) we use
 * the studentId as the record id — guarantees one mark per student per session.
 * For pure TRIAL walk-ins (no Student doc yet) we use a generated id.
 */

import type { BaseDocument, IsoDate, IsoTimestamp } from './common.js';

export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  LATE: 'LATE',
  EXCUSED: 'EXCUSED',
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

/**
 * Why this person is in today's attendance roster. Only REGULAR + MAKEUP count toward
 * the student's attendance percentage in the monthly summary; EXTRA and TRIAL are
 * tracked separately so they don't distort the headline metric.
 */
export const AttendeeType = {
  /** Enrolled student whose selectedDays includes this session's day. */
  REGULAR: 'REGULAR',
  /** Enrolled student making up a previously missed regular session. */
  MAKEUP: 'MAKEUP',
  /**
   * Existing student in the system attending an extra session beyond their plan
   * (e.g. coach invited them to scrimmage with a higher batch).
   */
  EXTRA: 'EXTRA',
  /**
   * Walk-in / trial — a prospect trying out the academy. May or may not already exist
   * as a Student document. Captured here for follow-up by the centre manager.
   */
  TRIAL: 'TRIAL',
} as const;
export type AttendeeType = (typeof AttendeeType)[keyof typeof AttendeeType];

/**
 * A single coaching session — one batch meeting on one date. Holds the session-level
 * metadata (who ran it, start/end, any cancellation note); the per-attendee marks live
 * in the `records` subcollection below.
 */
export interface SessionDocument extends BaseDocument {
  id: string;

  batchId: string;
  centreId: string;

  /** IST calendar date of the session. */
  sessionDate: IsoDate;

  /** Coach user ids who ran this session. Usually 1, sometimes 2 for co-coaching. */
  coachIds: string[];

  /** Actual start time if recorded (ISO UTC). Useful for the 24h edit window. */
  startedAt: IsoTimestamp | null;
  /** Actual end time if recorded (ISO UTC). */
  endedAt: IsoTimestamp | null;

  /**
   * The cutoff after which only admin/manager can edit attendance. Set to startedAt + 24h
   * on session start. If null the session has not yet been opened.
   */
  editLockAt: IsoTimestamp | null;

  /** Optional cancellation. If cancelled, no records are expected. */
  cancelled: boolean;
  cancellationReason: string | null;
}

/**
 * Per-attendee attendance mark for a single session. Record id = studentId for
 * student-linked records; auto-generated for pure trial walk-ins.
 */
export interface AttendanceRecord extends BaseDocument {
  id: string;

  /** Existing student id. NULL only for pure trial walk-ins not yet in the system. */
  studentId: string | null;

  attendeeType: AttendeeType;

  /**
   * Walk-in info — populated only when attendeeType=TRIAL and studentId is null.
   * Captured so the centre manager can follow up to convert the prospect.
   */
  walkInName: string | null;
  walkInPhone: string | null;
  walkInNotes: string | null;

  batchId: string;
  sessionId: string;
  sessionDate: IsoDate;

  status: AttendanceStatus;

  /** Optional free-text note the coach may attach to the mark. */
  note: string | null;

  /** User id of whoever marked it. */
  markedBy: string;
}

/**
 * A denormalised monthly rollup. Computed by a Cloud Function on session close and stored
 * at /students/{id}/attendanceMonthly/{YYYY-MM} for fast dashboard reads.
 *
 * Only REGULAR + MAKEUP records contribute to the percent; EXTRA and TRIAL records are
 * counted separately under `extras` so the numbers stay meaningful.
 */
export interface AttendanceMonthlySummary {
  studentId: string;
  /** YYYY-MM */
  yearMonth: string;
  totalSessions: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** Bonus / makeup / extra sessions the student attended this month. */
  extras: number;
  /** Attendance % rounded to 1 decimal place: (present+late) / totalSessions * 100. */
  attendancePercent: number;
}
