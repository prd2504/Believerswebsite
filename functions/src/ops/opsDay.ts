/**
 * One day of operations, read once and shared by the watchdog and the nightly
 * digest so both agree on what was expected and what happened.
 *
 * A session is EXPECTED when an active batch runs that weekday and at least
 * one active enrolment attends it. Each one resolves to ON_TIME / LATE /
 * PENDING / MISSING / NOT_HELD via the shared registerStatus().
 */

import { db } from '../admin.js';
import {
  batchEndTime,
  isExpectedOnRegister,
  registerFeeState,
  registerStatus,
  type RegisterStatus,
} from '@bba/shared';

export interface Person { id: string; name: string; email: string | null; role: string; centreIds: string[] }

export interface StudentLite {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  primaryCentreId: string;
  externalStudentId: string | null;
  feeMonths: string[];
}

export interface EnrollmentLite {
  studentId: string;
  batchId: string;
  centreId: string;
  selectedDays: number[];
  startDate: string | null;
  pausedMonths: string[];
}

export interface DaySession {
  batchId: string;
  batchName: string;
  centreId: string;
  startTime: string;
  endTime: string;
  coachIds: string[];
  status: RegisterStatus;
  minutesAfterEnd: number | null;
  takenAt: string | null;
  notHeldReason: string | null;
  /** Students the register expects today (paid, due or new). */
  expected: number;
  present: number;
  absent: number;
  /** Present with no fee covering the month. */
  unpaidPresent: { studentId: string; name: string }[];
  trials: { name: string; phone: string | null }[];
}

export interface DayContext {
  date: string;
  nowMs: number;
  centres: Map<string, { id: string; name: string; code: string }>;
  students: Map<string, StudentLite>;
  enrollments: EnrollmentLite[];
  people: Map<string, Person>;
  sessions: DaySession[];
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The fee state of a student in a batch on a date, from loaded data. */
export function feeStateFor(
  ctx: Pick<DayContext, 'students' | 'enrollments'>,
  studentId: string,
  batchId: string,
  date: string,
) {
  const s = ctx.students.get(studentId);
  const e = ctx.enrollments.find((x) => x.studentId === studentId && x.batchId === batchId);
  return registerFeeState({
    feeMonths: s?.feeMonths ?? [],
    enrolledOn: e?.startDate ?? null,
    pausedMonths: e?.pausedMonths ?? [],
    sessionDate: date,
  });
}

export async function loadDay(date: string, nowMs: number, opts: { withRecords: boolean }): Promise<DayContext> {
  const [centresSnap, batchesSnap, enrollSnap, studentsSnap, usersSnap] = await Promise.all([
    db.collection('centres').get(),
    db.collection('batches').where('status', '==', 'ACTIVE').get(),
    db.collection('enrollments').where('status', '==', 'ACTIVE').get(),
    db.collection('students').get(),
    db.collection('users').where('role', 'in', ['COACH', 'CENTRE_MANAGER', 'SUPER_ADMIN']).get(),
  ]);

  const centres = new Map(centresSnap.docs.map((d) => {
    const c = d.data();
    return [d.id, { id: d.id, name: (c.name as string) ?? d.id, code: (c.centreCode as string) ?? '' }] as const;
  }));

  const students = new Map(studentsSnap.docs.map((d) => {
    const s = d.data();
    return [d.id, {
      id: d.id,
      name: (s.name as string) ?? d.id,
      phone: (s.phone as string) ?? null,
      status: (s.status as string) ?? 'ACTIVE',
      primaryCentreId: (s.primaryCentreId as string) ?? '',
      externalStudentId: (s.externalStudentId as string) ?? null,
      feeMonths: Array.isArray(s.feeMonths) ? (s.feeMonths as string[]) : [],
    }] as const;
  }));

  const enrollments: EnrollmentLite[] = enrollSnap.docs.map((d) => {
    const e = d.data();
    return {
      studentId: (e.studentId as string) ?? '',
      batchId: (e.batchId as string) ?? '',
      centreId: (e.centreId as string) ?? '',
      selectedDays: Array.isArray(e.selectedDays) ? (e.selectedDays as number[]) : [],
      startDate: (e.startDate as string) ?? null,
      pausedMonths: Array.isArray(e.pausedMonths) ? (e.pausedMonths as string[]) : [],
    };
  }).filter((e) => students.get(e.studentId)?.status === 'ACTIVE');

  const people = new Map(usersSnap.docs.map((d) => {
    const u = d.data();
    return [d.id, {
      id: d.id,
      name: (u.name as string) ?? d.id,
      email: (u.email as string) ?? null,
      role: (u.role as string) ?? '',
      centreIds: Array.isArray(u.centreIds) ? (u.centreIds as string[]) : [],
    }] as const;
  }));

  const ctx: DayContext = { date, nowMs, centres, students, enrollments, people, sessions: [] };
  const weekday = weekdayOf(date);

  const perBatch = await Promise.all(batchesSnap.docs.map(async (batchDoc) => {
    const b = batchDoc.data();
    const offered = Array.isArray(b.offeredDays) ? (b.offeredDays as number[]) : [];
    const todays = enrollments.filter((e) => e.batchId === batchDoc.id && e.selectedDays.includes(weekday));
    const expected = todays.filter((e) => isExpectedOnRegister(feeStateFor(ctx, e.studentId, batchDoc.id, date))).length;
    const sessionSnap = await db.doc(`attendance/${batchDoc.id}/sessions/${date}`).get();
    // Nobody paid → nobody should be there → not an expected session.
    const runsToday = offered.includes(weekday) && expected > 0;
    if (!runsToday && !sessionSnap.exists) return null;

    const ses = sessionSnap.exists ? sessionSnap.data()! : null;
    const endTime = batchEndTime(b);
    const takenAt = (ses?.firstTakenAt as string) ?? (ses?.endedAt as string) ?? null;
    const { status, minutesAfterEnd } = registerStatus({
      sessionDate: date, endTime, takenAt, cancelled: !!ses?.cancelled, nowMs,
    });

    let present = 0;
    let absent = 0;
    const unpaidPresent: DaySession['unpaidPresent'] = [];
    const trials: DaySession['trials'] = [];
    if (opts.withRecords && ses && !ses.cancelled) {
      const recSnap = await sessionSnap.ref.collection('records').get();
      recSnap.docs.forEach((r) => {
        const rec = r.data();
        const here = rec.status === 'PRESENT' || rec.status === 'LATE';
        if (rec.attendeeType === 'TRIAL') {
          if (here) trials.push({ name: (rec.walkInName as string) ?? 'Trial', phone: (rec.walkInPhone as string) ?? null });
          return;
        }
        if (here) present++;
        else if (rec.status === 'ABSENT') absent++;
        const sid = rec.studentId as string | null;
        if (here && sid && feeStateFor(ctx, sid, batchDoc.id, date) === 'UNPAID') {
          unpaidPresent.push({ studentId: sid, name: students.get(sid)?.name ?? sid });
        }
      });
    }

    const session: DaySession = {
      batchId: batchDoc.id,
      batchName: (b.name as string) ?? batchDoc.id,
      centreId: (b.centreId as string) ?? '',
      startTime: (b.startTime as string) ?? '',
      endTime,
      coachIds: Array.isArray(b.coachIds) ? (b.coachIds as string[]) : [],
      status,
      minutesAfterEnd,
      takenAt,
      notHeldReason: ses?.cancelled ? ((ses.cancellationReason as string) ?? 'Not held') : null,
      expected,
      present,
      absent,
      unpaidPresent,
      trials,
    };
    return session;
  }));

  ctx.sessions = perBatch
    .filter((s): s is DaySession => s !== null)
    .sort((a, b) => a.centreId.localeCompare(b.centreId) || a.startTime.localeCompare(b.startTime));
  return ctx;
}

/** Centre managers responsible for a centre (all centres when none listed). */
export function managersFor(ctx: Pick<DayContext, 'people'>, centreId: string): Person[] {
  return Array.from(ctx.people.values()).filter((p) =>
    p.role === 'CENTRE_MANAGER' && !!p.email && (p.centreIds.length === 0 || p.centreIds.includes(centreId)));
}

export function fmtTime12(hhmm: string): string {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function istClock(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export const APP_URL = 'https://bba-sports-prod.web.app';
