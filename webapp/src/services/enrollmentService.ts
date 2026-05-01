/**
 * Enrollment service — Firestore operations for /enrollments/{enrollmentId}.
 *
 * Each enrollment ties one student to one batch with a chosen frequency plan and
 * the specific days they attend. Mutations also keep the denormalised mirrors on
 * the batch (`studentIds`, `currentEnrolment`) and student (`batchIds`) in sync via
 * a write batch — they're a single logical operation.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  writeBatch,
  arrayUnion,
  arrayRemove,
  increment,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  COLLECTIONS,
  type EnrollmentDocument,
  type EnrollmentStatus,
  type DayOfWeek,
  makeEnrollmentId,
} from '@bba/shared';

function toIso(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts) {
    return (ts as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

function fromFirestore(id: string, data: DocumentData): EnrollmentDocument {
  return {
    id,
    studentId: data.studentId ?? '',
    batchId: data.batchId ?? '',
    centreId: data.centreId ?? '',
    daysPerWeek: data.daysPerWeek ?? 0,
    monthlyFeePaise: data.monthlyFeePaise ?? 0,
    selectedDays: Array.isArray(data.selectedDays) ? (data.selectedDays as DayOfWeek[]) : [],
    startDate: data.startDate ?? '',
    endDate: data.endDate ?? null,
    status: (data.status ?? 'ACTIVE') as EnrollmentStatus,
    timeSlotStartTime: data.timeSlotStartTime ?? null,
    notes: data.notes ?? null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

export interface EnrollInput {
  studentId: string;
  batchId: string;
  centreId: string;
  daysPerWeek: number;
  monthlyFeePaise: number;
  selectedDays: DayOfWeek[];
  startDate: string; // YYYY-MM-DD
  /** "HH:mm" start time of the sub-slot the student attends. Null for single-slot batches. */
  timeSlotStartTime?: string | null;
  notes?: string;
}

/**
 * Create an enrolment. Also mirrors to batch.studentIds / batch.currentEnrolment and
 * student.batchIds in a write batch so the three documents stay consistent.
 */
export async function enrollStudent(input: EnrollInput, userId: string): Promise<string> {
  if (input.selectedDays.length !== input.daysPerWeek) {
    throw new Error(
      `selectedDays count (${input.selectedDays.length}) must equal daysPerWeek (${input.daysPerWeek})`,
    );
  }

  const enrollmentId = makeEnrollmentId(input.studentId, input.batchId);
  const enrollmentRef = doc(db, COLLECTIONS.enrollments, enrollmentId);
  const batchRef = doc(db, COLLECTIONS.batches, input.batchId);
  const studentRef = doc(db, COLLECTIONS.students, input.studentId);

  // Idempotency — refuse if an active row already exists.
  const existing = await getDoc(enrollmentRef);
  if (existing.exists() && existing.data()?.status === 'ACTIVE') {
    throw new Error('Student is already actively enrolled in this batch.');
  }

  const batch = writeBatch(db);

  batch.set(enrollmentRef, {
    studentId: input.studentId,
    batchId: input.batchId,
    centreId: input.centreId,
    daysPerWeek: input.daysPerWeek,
    monthlyFeePaise: input.monthlyFeePaise,
    selectedDays: input.selectedDays,
    startDate: input.startDate,
    endDate: null,
    status: 'ACTIVE' satisfies EnrollmentStatus,
    timeSlotStartTime: input.timeSlotStartTime ?? null,
    notes: input.notes?.trim() || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  });

  batch.update(batchRef, {
    studentIds: arrayUnion(input.studentId),
    currentEnrolment: increment(1),
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });

  batch.update(studentRef, {
    batchIds: arrayUnion(input.batchId),
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });

  await batch.commit();
  return enrollmentId;
}

/**
 * End an enrolment. Marks status=ENDED, sets endDate, removes from denormalised mirrors.
 * The document is kept (not deleted) for historical attendance/payment correlation.
 */
export async function endEnrollment(
  enrollmentId: string,
  endDate: string,
  userId: string,
): Promise<void> {
  const enrollmentRef = doc(db, COLLECTIONS.enrollments, enrollmentId);
  const snap = await getDoc(enrollmentRef);
  if (!snap.exists()) throw new Error('Enrollment not found');

  const data = snap.data();
  const batchRef = doc(db, COLLECTIONS.batches, data.batchId as string);
  const studentRef = doc(db, COLLECTIONS.students, data.studentId as string);

  const batch = writeBatch(db);
  batch.update(enrollmentRef, {
    status: 'ENDED' satisfies EnrollmentStatus,
    endDate,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
  batch.update(batchRef, {
    studentIds: arrayRemove(data.studentId as string),
    currentEnrolment: increment(-1),
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
  batch.update(studentRef, {
    batchIds: arrayRemove(data.batchId as string),
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
  await batch.commit();
}

/** Update just the time slot on an existing enrollment (for migrating pre-slot students). */
export async function updateEnrollmentTimeSlot(
  enrollmentId: string,
  timeSlotStartTime: string | null,
  userId: string,
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.enrollments, enrollmentId), {
    timeSlotStartTime,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/**
 * Update plan / selectedDays for an existing active enrolment (e.g. student switches
 * from 2 days/week to 3 days/week, or changes which days they attend).
 */
export async function updateEnrollmentPlan(
  enrollmentId: string,
  daysPerWeek: number,
  monthlyFeePaise: number,
  selectedDays: DayOfWeek[],
  userId: string,
  notes?: string,
): Promise<void> {
  if (selectedDays.length !== daysPerWeek) {
    throw new Error('selectedDays count must equal daysPerWeek');
  }
  await updateDoc(doc(db, COLLECTIONS.enrollments, enrollmentId), {
    daysPerWeek,
    monthlyFeePaise,
    selectedDays,
    notes: notes?.trim() || null,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/** Set the enrolment to ON_HOLD or back to ACTIVE without ending it. */
export async function setEnrollmentStatus(
  enrollmentId: string,
  status: Exclude<EnrollmentStatus, 'ENDED'>,
  userId: string,
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.enrollments, enrollmentId), {
    status,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/** Get one enrolment by composite id. */
export async function getEnrollment(
  studentId: string,
  batchId: string,
): Promise<EnrollmentDocument | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.enrollments, makeEnrollmentId(studentId, batchId)));
  if (!snap.exists()) return null;
  return fromFirestore(snap.id, snap.data());
}

/** All enrolments for a batch (active + historical). */
export async function getEnrollmentsByBatch(batchId: string): Promise<EnrollmentDocument[]> {
  const q = query(collection(db, COLLECTIONS.enrollments), where('batchId', '==', batchId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

/** All enrolments for a student. */
export async function getEnrollmentsByStudent(studentId: string): Promise<EnrollmentDocument[]> {
  const q = query(collection(db, COLLECTIONS.enrollments), where('studentId', '==', studentId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

/** All enrolments for a centre — used by Centre Manager dashboards & exports. */
export async function getEnrollmentsByCentre(centreId: string): Promise<EnrollmentDocument[]> {
  const q = query(collection(db, COLLECTIONS.enrollments), where('centreId', '==', centreId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

/**
 * Active enrolments in a batch whose selectedDays includes the given day-of-week.
 * This is the function attendance pages use to compute today's expected roster.
 */
export async function getEnrollmentsForBatchOnDay(
  batchId: string,
  dayOfWeek: DayOfWeek,
): Promise<EnrollmentDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.enrollments),
    where('batchId', '==', batchId),
    where('selectedDays', 'array-contains', dayOfWeek),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data())).filter((e) => e.status === 'ACTIVE');
}
