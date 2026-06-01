/**
 * Student CRUD service — Firestore operations for /students/{studentId}.
 *
 * Note: this service no longer manages /batches.studentIds or .currentEnrolment.
 * Those are denormalised mirrors maintained by enrollmentService.enrollStudent /
 * endEnrollment. Creating or editing a student profile here does NOT enrol them
 * into anything — use the dedicated enrolment flow.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  COLLECTIONS,
  type StudentDocument,
  type StudentStatus,
  type StudentStatusHistoryEntry,
  type BloodGroup,
  type BatchLevel,
} from '@bba/shared';
import type { StudentFormValues } from '@/lib/schemas/studentSchema';

function fromFirestore(id: string, data: DocumentData): StudentDocument {
  const toIso = (ts: unknown): string => {
    if (!ts) return new Date().toISOString();
    if (typeof ts === 'string') return ts;
    if (ts && typeof ts === 'object' && 'toDate' in ts) {
      return (ts as Timestamp).toDate().toISOString();
    }
    return new Date().toISOString();
  };

  return {
    id,
    name: data.name ?? '',
    dateOfBirth: data.dateOfBirth ?? '',
    gender: data.gender ?? 'UNDISCLOSED',
    photoPath: data.photoPath ?? null,
    guardianName: data.guardianName ?? '',
    guardianUserId: data.guardianUserId ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    address: data.address ?? '',
    city: data.city ?? '',
    pincode: data.pincode ?? '',
    bloodGroup: (data.bloodGroup ?? 'UNKNOWN') as BloodGroup,
    emergencyContact: data.emergencyContact ?? { name: '', relationship: '', phone: '' },
    primaryCentreId: data.primaryCentreId ?? '',
    batchIds: Array.isArray(data.batchIds) ? data.batchIds : [],
    level: (data.level ?? 'BEGINNER') as BatchLevel,
    status: (data.status ?? 'ACTIVE') as StudentStatus,
    statusHistory: Array.isArray(data.statusHistory)
      ? (data.statusHistory as StudentStatusHistoryEntry[])
      : [],
    joinedDate: data.joinedDate ?? '',
    medicalNotes: data.medicalNotes ?? null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fields written on every save (create + edit). Status is NOT in here — it's
 * managed separately via changeStudentStatus so edits don't reset it. */
function toFirestoreData(values: StudentFormValues, userId: string) {
  return {
    name: values.name.trim(),
    phone: values.phone.trim() || null,
    email: values.email?.trim() || null,
    level: values.level as BatchLevel,
    primaryCentreId: values.primaryCentreId,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  };
}

/** Fields written only on first create. */
function createDefaults() {
  return {
    dateOfBirth: '',
    gender: 'UNDISCLOSED' as const,
    photoPath: null,
    guardianName: '',
    guardianUserId: null,
    address: '',
    city: '',
    pincode: '',
    bloodGroup: 'UNKNOWN' as BloodGroup,
    emergencyContact: { name: '', relationship: '', phone: '' },
    status: 'ACTIVE' as StudentStatus,
    statusHistory: [] as StudentStatusHistoryEntry[],
    batchIds: [] as string[],
    joinedDate: todayStr(),
    medicalNotes: null,
  };
}

export async function getAllStudents(): Promise<StudentDocument[]> {
  const q = query(collection(db, COLLECTIONS.students), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

export async function getStudentsByCentre(centreId: string): Promise<StudentDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.students),
    where('primaryCentreId', '==', centreId),
    orderBy('name', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

export async function getStudentsByBatch(batchId: string): Promise<StudentDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.students),
    where('batchIds', 'array-contains', batchId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

export async function getStudentById(studentId: string): Promise<StudentDocument | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.students, studentId));
  if (!snap.exists()) return null;
  return fromFirestore(snap.id, snap.data());
}

/** Create a new student profile. Returns the new document id. Does NOT enrol. */
export async function createStudent(values: StudentFormValues, userId: string): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.students), {
    ...toFirestoreData(values, userId),
    ...createDefaults(),
    createdAt: serverTimestamp(),
    createdBy: userId,
  });
  return ref.id;
}

/**
 * Change a student's lifecycle status and append an audit-trail entry. This is
 * the *only* way status should change after creation — plain updates leave it
 * untouched.
 */
export async function changeStudentStatus(
  studentId: string,
  newStatus: StudentStatus,
  reason: string | null,
  userId: string,
): Promise<void> {
  const ref = doc(db, COLLECTIONS.students, studentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Student not found');
  const current = snap.data();
  const fromStatus = (current.status ?? 'ACTIVE') as StudentStatus;
  if (fromStatus === newStatus) return; // no-op
  const history: StudentStatusHistoryEntry[] = Array.isArray(current.statusHistory)
    ? current.statusHistory
    : [];
  const entry: StudentStatusHistoryEntry = {
    from: fromStatus,
    to: newStatus,
    changedAt: new Date().toISOString(),
    changedBy: userId,
    reason: reason?.trim() || null,
  };
  await updateDoc(ref, {
    status: newStatus,
    statusHistory: [...history, entry],
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/**
 * Bulk-flip students who don't have a PAID payment for the given month to
 * DORMANT. Skips students already in a terminal/paused state (GRADUATED, LEFT,
 * ON_HOLD, DORMANT). Returns the ids of students whose status changed.
 */
export async function markUnpaidStudentsDormant(
  month: string,
  paidStudentIds: Set<string>,
  userId: string,
): Promise<string[]> {
  const all = await getAllStudents();
  const candidates = all.filter(
    (s) => s.status === 'ACTIVE' && s.batchIds.length > 0 && !paidStudentIds.has(s.id),
  );
  for (const s of candidates) {
    await changeStudentStatus(s.id, 'DORMANT', `Auto-marked dormant for ${month}`, userId);
  }
  return candidates.map((s) => s.id);
}

/** Update an existing student's profile fields. Does NOT touch batch enrolment. */
export async function updateStudent(
  studentId: string,
  values: StudentFormValues,
  userId: string,
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.students, studentId), toFirestoreData(values, userId));
}

/**
 * Delete a student profile. Caller is responsible for ending all enrolments first
 * (use enrollmentService.endEnrollment) — this function does NOT cascade to /enrollments
 * or to batch denormalised counters.
 */
export async function deleteStudent(studentId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.students, studentId));
}
