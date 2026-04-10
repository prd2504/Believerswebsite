/**
 * Attendance records. Stored under the nested path:
 *
 *   /attendance/{batchId}/sessions/{sessionId}/records/{studentId}
 *
 * The session id is the IST date of the session (YYYY-MM-DD) plus optional "-am" / "-pm"
 * suffix when a batch runs multiple slots per day. This makes sessions idempotent.
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
 * A single coaching session — one batch meeting on one date. Holds the session-level
 * metadata (who ran it, start/end, any cancellation note); the per-student marks live in
 * the `records` subcollection below.
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

/** Per-student attendance mark for a single session. */
export interface AttendanceRecord extends BaseDocument {
  /** Document id = studentId. One mark per student per session. */
  id: string;

  studentId: string;
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
  /** Attendance % rounded to 1 decimal place: (present+late) / totalSessions * 100. */
  attendancePercent: number;
}
