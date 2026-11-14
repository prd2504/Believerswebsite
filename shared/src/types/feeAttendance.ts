/**
 * Fee-vs-attendance reconciliation.
 *
 * Answers the question nobody could answer before: "who is training but
 * hasn't paid this month?" Attendance and payments were tracked in entirely
 * separate places, so a student could attend all month with no payment on
 * record and nothing would surface it.
 *
 * Computed server-side once per month and stored, rather than derived in the
 * browser. Deriving it client-side would mean reading every attendance record
 * for every batch on every page load; the stored report is a single document
 * read instead.
 */

import type { BaseDocument, YearMonth } from './common.js';

/** Doc id for a centre's report in a given month. */
export function feeAttendanceReportId(centreId: string, yearMonth: YearMonth): string {
  return `${centreId}_${yearMonth}`;
}

export interface FeeAttendanceRow {
  studentId: string;
  studentName: string;
  externalStudentId: string | null;
  phone: string | null;
  batchName: string;

  /** Sessions actually attended this month (PRESENT or LATE). */
  sessionsAttended: number;

  /** Whether a payment covers this month — quarterly coverage included. */
  isPaid: boolean;
  /**
   * Last month this student's furthest payment reaches, e.g. "2026-11" for
   * someone on quarterly. Null when they have no covering payment at all.
   */
  coveredThrough: YearMonth | null;
  /** MONTHLY / QUARTERLY of the covering payment. Null when unpaid. */
  billingCycle: string | null;

  /** The fee they'd be expected to pay, from their enrolment. 0 if unknown. */
  expectedFeePaise: number;
}

export interface FeeAttendanceReport extends BaseDocument {
  id: string;
  centreId: string;
  centreName: string;
  yearMonth: YearMonth;
  /** ISO timestamp the report was computed. */
  generatedAt: string;

  /**
   * Students who attended at least once this month. Trials and walk-ins are
   * deliberately excluded — they are not enrolled and owe no monthly fee, so
   * including them would make the unpaid list wrong.
   */
  rows: FeeAttendanceRow[];

  totals: {
    studentsAttended: number;
    paidCount: number;
    unpaidCount: number;
    /** Sessions consumed by unpaid students — the actual revenue leakage. */
    unpaidSessions: number;
    /** Sum of expected fees for unpaid students. */
    estimatedDuePaise: number;
  };
}

/** Unpaid rows, worst offenders (most sessions consumed) first. */
export function unpaidRows(report: Pick<FeeAttendanceReport, 'rows'>): FeeAttendanceRow[] {
  return report.rows
    .filter((r) => !r.isPaid)
    .sort((a, b) => b.sessionsAttended - a.sessionsAttended || a.studentName.localeCompare(b.studentName));
}
