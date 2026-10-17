/**
 * Data-health checks — pure, so they can be tested without Firebase.
 * Each check names what it breaks and how the centre manager fixes it.
 */

import { addMonths, formatMonthLabel } from '@bba/shared';
import type {
  BatchDocument, EnrollmentDocument, StudentDocument, UserDocument,
} from '@bba/shared';

export type Severity = 'high' | 'medium' | 'low';

export interface Item { key: string; name: string; centreId: string; detail: string; phone?: string | null }

export interface Check {
  id: string;
  title: string;
  why: string;
  fix: string;
  severity: Severity;
  items: Item[];
}

export const SEVERITY_STYLE: Record<Severity, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-gray-100 text-gray-600',
};

function phoneDigits(p: string | null | undefined): string {
  const d = (p ?? '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
}

function normName(n: string): string {
  return n.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildChecks(input: {
  students: StudentDocument[];
  enrollments: EnrollmentDocument[];
  batches: BatchDocument[];
  coaches: UserDocument[];
  month: string;
}): Check[] {
  const { students, enrollments, batches, coaches, month } = input;
  const active = students.filter((s) => s.status === 'ACTIVE');
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const studentById = new Map(students.map((s) => [s.id, s]));
  const enrolByStudent = new Map<string, EnrollmentDocument[]>();
  enrollments.forEach((e) => {
    const list = enrolByStudent.get(e.studentId) ?? [];
    list.push(e);
    enrolByStudent.set(e.studentId, list);
  });
  const item = (s: StudentDocument, detail: string): Item =>
    ({ key: s.id, name: s.name, centreId: s.primaryCentreId, detail, phone: s.phone });

  const paidNotEnrolled = active
    .filter((s) => s.feeMonths?.includes(month) && !(enrolByStudent.get(s.id)?.length))
    .map((s) => item(s, `Paid for ${formatMonthLabel(month)}`));

  const inactiveBatch: Item[] = [];
  const dayMismatch: Item[] = [];
  enrollments.forEach((e) => {
    const s = studentById.get(e.studentId);
    if (!s || s.status !== 'ACTIVE') return;
    const b = batchById.get(e.batchId);
    if (!b || b.status !== 'ACTIVE') {
      inactiveBatch.push({ ...item(s, b ? `${b.name} (${b.status})` : 'Batch deleted'), key: `${s.id}_${e.batchId}` });
      return;
    }
    const offDays = e.selectedDays.filter((d) => !b.offeredDays.includes(d));
    if (e.selectedDays.length !== e.daysPerWeek || offDays.length) {
      dayMismatch.push({
        ...item(s, `${b.name}: ${e.selectedDays.length} day(s) picked for a ${e.daysPerWeek}-day plan${offDays.length ? ', some on days the batch does not run' : ''}`),
        key: `${s.id}_${e.batchId}`,
      });
    }
  });

  const prev = addMonths(month, -1);
  const lapsed = active
    .filter((s) => s.feeMonths && (enrolByStudent.get(s.id)?.length ?? 0) > 0
      && !s.feeMonths.includes(month) && !s.feeMonths.includes(prev))
    .map((s) => item(s, s.feeCoveredThrough ? `Last paid ${formatMonthLabel(s.feeCoveredThrough)}` : 'Never paid'));

  const noPhone = active.filter((s) => !phoneDigits(s.phone)).map((s) => item(s, 'No phone number'));
  const badPhone = active
    .filter((s) => { const d = phoneDigits(s.phone); return d && d.length !== 10; })
    .map((s) => item(s, `“${s.phone}” is not a 10-digit mobile`));
  const noEmail = active.filter((s) => !s.email?.trim()).map((s) => item(s, 'No email'));
  const noId = active.filter((s) => !s.externalStudentId).map((s) => item(s, 'No BBA ID'));

  const groups = new Map<string, StudentDocument[]>();
  active.forEach((s) => {
    const k = `${s.primaryCentreId}|${normName(s.name)}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  });
  const duplicates: Item[] = [];
  groups.forEach((list) => {
    if (list.length < 2) return;
    list.forEach((s) => duplicates.push(item(s, `${list.length} active records with this name${s.externalStudentId ? ` · ${s.externalStudentId}` : ''}`)));
  });

  const assigned = new Set(batches.filter((b) => b.status === 'ACTIVE').flatMap((b) => b.coachIds));
  const coachNoEmail = coaches
    .filter((c) => assigned.has(c.id) && !c.email?.trim())
    .map((c) => ({ key: c.id, name: c.name, centreId: c.centreIds?.[0] ?? '', detail: 'Coach — no email', phone: c.phone }));
  const batchNoCoach = batches
    .filter((b) => b.status === 'ACTIVE' && b.coachIds.length === 0)
    .map((b) => ({ key: b.id, name: b.name, centreId: b.centreId, detail: `${b.startTime}–${b.endTime}` }));

  return [
    { id: 'paidNotEnrolled', severity: 'high', items: paidNotEnrolled,
      title: 'Paid but not in any batch',
      why: 'They have paid this month but appear on no register, so their attendance is never taken.',
      fix: 'Roster → enrol them in the right batch and days.' },
    { id: 'inactiveBatch', severity: 'high', items: inactiveBatch,
      title: 'Enrolled in a closed or deleted batch',
      why: 'That batch no longer runs, so they are on no register.',
      fix: 'Roster → move them to a running batch.' },
    { id: 'batchNoCoach', severity: 'high', items: batchNoCoach,
      title: 'Batches with no coach assigned',
      why: 'Nobody gets the reminder when its register is missing; it goes straight to the manager.',
      fix: 'Coaches → assign a coach to the batch.' },
    { id: 'coachNoEmail', severity: 'high', items: coachNoEmail,
      title: 'Coaches with no email',
      why: 'Attendance reminders cannot reach them.',
      fix: 'Coaches → add their email.' },
    { id: 'dayMismatch', severity: 'medium', items: dayMismatch,
      title: 'Attendance days don’t match their plan',
      why: 'They are missing from the register on days they should come (or listed on days the batch doesn’t run).',
      fix: 'Roster → edit the student’s days.' },
    { id: 'lapsed', severity: 'medium', items: lapsed,
      title: 'Enrolled but unpaid for 2+ months',
      why: 'Already off the register. If they have left, end the enrolment so batch capacity is freed.',
      fix: 'Call the family; if they’ve left, Roster → end enrolment.' },
    { id: 'noPhone', severity: 'medium', items: noPhone,
      title: 'No phone number',
      why: 'No way to chase fees, absences or renewals.',
      fix: 'Students → edit → add the parent’s mobile.' },
    { id: 'badPhone', severity: 'medium', items: badPhone,
      title: 'Phone number looks wrong',
      why: 'Calls and messages will fail.',
      fix: 'Students → edit → correct the mobile.' },
    { id: 'noEmail', severity: 'medium', items: noEmail,
      title: 'No email',
      why: 'Fee receipts and gate passes are sent by email — these families get neither.',
      fix: 'Students → edit → add the parent’s email.' },
    { id: 'duplicates', severity: 'low', items: duplicates,
      title: 'Possible duplicates',
      why: 'Fees and attendance can be split across two records of the same child.',
      fix: 'Check if it’s the same child; if so, merge or set one inactive.' },
    { id: 'noId', severity: 'low', items: noId,
      title: 'No BBA student ID',
      why: 'The spreadsheet matches by ID; without one, sheet fee status may not line up.',
      fix: 'Assigned automatically on their next payment — no action unless it persists.' },
  ];
}
