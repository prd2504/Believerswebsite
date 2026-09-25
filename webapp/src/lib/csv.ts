/**
 * CSV export utilities. Generates RFC-4180-compliant CSVs and triggers a browser
 * download — no server round-trip needed. Files open cleanly in Excel and Sheets.
 *
 * The exporters here are typed to specific domain shapes so columns stay consistent.
 * For new exports, prefer adding a typed helper here over inline string-building.
 */

import {
  type StudentDocument,
  type EnrollmentDocument,
  type PaymentDocument,
  type AttendanceRecord,
  DAY_OF_WEEK_SHORT,
  paiseToRupees,
} from '@bba/shared';

/** Escape a single field according to RFC 4180 — wrap in quotes if it contains special chars. */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowsToCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvField).join(','));
  }
  // Prepend BOM so Excel detects UTF-8 — needed for ₹, accented names, etc.
  return '﻿' + lines.join('\r\n');
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain-specific exporters

/**
 * Export students grouped/segregated by centre. The CSV has a "Centre" column so
 * downstream tools (Sheets pivot, Excel filter) can group by it.
 */
export function exportStudentsCsv(
  students: StudentDocument[],
  centreNameById: Map<string, string>,
): void {
  const headers = [
    'Centre',
    'Name',
    'Guardian',
    'Phone',
    'Email',
    'DOB',
    'Gender',
    'Level',
    'Status',
    'City',
    'Pincode',
    'Joined',
    'Blood group',
    'Emergency name',
    'Emergency phone',
    'Active enrolments',
  ];
  // Sort by centre name first so rows for the same centre appear together.
  const sorted = [...students].sort((a, b) => {
    const centreA = centreNameById.get(a.primaryCentreId) ?? '';
    const centreB = centreNameById.get(b.primaryCentreId) ?? '';
    if (centreA !== centreB) return centreA.localeCompare(centreB);
    return a.name.localeCompare(b.name);
  });
  const rows = sorted.map((s) => [
    centreNameById.get(s.primaryCentreId) ?? '',
    s.name,
    s.guardianName,
    s.phone ?? '',
    s.email ?? '',
    s.dateOfBirth,
    s.gender,
    s.level,
    s.status,
    s.city,
    s.pincode,
    s.joinedDate,
    s.bloodGroup,
    s.emergencyContact.name,
    s.emergencyContact.phone,
    s.batchIds.length,
  ]);
  downloadCsv(`bba-students-${todayStamp()}.csv`, rowsToCsv(headers, rows));
}

/**
 * Export enrolments — one row per (student, batch) with the chosen plan + days.
 * Useful for the centre coordinator to see who's signed up to what.
 */
export function exportEnrollmentsCsv(
  enrollments: EnrollmentDocument[],
  studentNameById: Map<string, string>,
  batchNameById: Map<string, string>,
  centreNameById: Map<string, string>,
): void {
  const headers = [
    'Centre',
    'Batch',
    'Student',
    'Days/week',
    'Selected days',
    'Monthly fee (₹)',
    'Status',
    'Start date',
    'End date',
    'Notes',
  ];
  const sorted = [...enrollments].sort((a, b) => {
    const cA = centreNameById.get(a.centreId) ?? '';
    const cB = centreNameById.get(b.centreId) ?? '';
    if (cA !== cB) return cA.localeCompare(cB);
    const bA = batchNameById.get(a.batchId) ?? '';
    const bB = batchNameById.get(b.batchId) ?? '';
    if (bA !== bB) return bA.localeCompare(bB);
    const sA = studentNameById.get(a.studentId) ?? '';
    const sB = studentNameById.get(b.studentId) ?? '';
    return sA.localeCompare(sB);
  });
  const rows = sorted.map((e) => [
    centreNameById.get(e.centreId) ?? '',
    batchNameById.get(e.batchId) ?? '',
    studentNameById.get(e.studentId) ?? '',
    e.daysPerWeek,
    e.selectedDays.map((d) => DAY_OF_WEEK_SHORT[d]).join(' '),
    paiseToRupees(e.monthlyFeePaise),
    e.status,
    e.startDate,
    e.endDate ?? '',
    e.notes ?? '',
  ]);
  downloadCsv(`bba-enrollments-${todayStamp()}.csv`, rowsToCsv(headers, rows));
}

/** Export payments. Always tagged with the centre so coordinators can filter. */
export function exportPaymentsCsv(
  payments: PaymentDocument[],
  studentNameById: Map<string, string>,
  batchNameById: Map<string, string>,
  centreNameById: Map<string, string>,
): void {
  const headers = [
    'Centre',
    'Month',
    'Student',
    'Batch',
    'Base (₹)',
    'GST (₹)',
    'Total (₹)',
    'Status',
    'Method',
    'Due date',
    'Paid at',
    'Receipt #',
    'Notes',
  ];
  const sorted = [...payments].sort((a, b) => {
    const cA = centreNameById.get(a.centreId) ?? '';
    const cB = centreNameById.get(b.centreId) ?? '';
    if (cA !== cB) return cA.localeCompare(cB);
    if (a.month !== b.month) return a.month.localeCompare(b.month);
    const sA = studentNameById.get(a.studentId) ?? '';
    const sB = studentNameById.get(b.studentId) ?? '';
    return sA.localeCompare(sB);
  });
  const rows = sorted.map((p) => [
    centreNameById.get(p.centreId) ?? '',
    p.month,
    studentNameById.get(p.studentId) ?? '',
    batchNameById.get(p.batchId) ?? '',
    paiseToRupees(p.baseAmountPaise),
    paiseToRupees(p.gstAmountPaise),
    paiseToRupees(p.totalAmountPaise),
    p.status,
    p.method,
    p.dueDate ?? '',
    p.paidAt ?? '',
    p.receiptNumber ?? '',
    p.notes ?? '',
  ]);
  downloadCsv(`bba-payments-${todayStamp()}.csv`, rowsToCsv(headers, rows));
}

/**
 * Export attendance records for one batch + date range. Shows attendeeType so
 * regular vs makeup vs trial can be distinguished in Sheets.
 */
export function exportAttendanceCsv(
  records: AttendanceRecord[],
  studentNameById: Map<string, string>,
  batchName: string,
  centreName: string,
): void {
  const headers = [
    'Centre',
    'Batch',
    'Date',
    'Attendee',
    'Type',
    'Status',
    'Note',
    'Walk-in phone',
  ];
  const sorted = [...records].sort((a, b) => {
    if (a.sessionDate !== b.sessionDate) return a.sessionDate.localeCompare(b.sessionDate);
    return (a.studentId ?? a.id).localeCompare(b.studentId ?? b.id);
  });
  const rows = sorted.map((r) => [
    centreName,
    batchName,
    r.sessionDate,
    r.studentId ? (studentNameById.get(r.studentId) ?? r.studentId) : (r.walkInName ?? 'Walk-in'),
    r.attendeeType,
    r.status,
    r.note ?? '',
    r.walkInPhone ?? '',
  ]);
  downloadCsv(`bba-attendance-${todayStamp()}.csv`, rowsToCsv(headers, rows));
}
