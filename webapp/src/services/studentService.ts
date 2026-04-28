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
    joinedDate: data.joinedDate ?? '',
    medicalNotes: data.medicalNotes ?? null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

function toFirestoreData(values: StudentFormValues, userId: string) {
  return {
    name: values.name.trim(),
    dateOfBirth: values.dateOfBirth,
    gender: values.gender,
    guardianName: values.guardianName.trim(),
    guardianUserId: values.guardianUserId || null,
    phone: values.phone?.trim() || null,
    email: values.email?.trim() || null,
    address: values.address.trim(),
    city: values.city.trim(),
    pincode: values.pincode.trim(),
    bloodGroup: values.bloodGroup as BloodGroup,
    emergencyContact: {
      name: values.emergencyContact.name.trim(),
      relationship: values.emergencyContact.relationship.trim(),
      phone: values.emergencyContact.phone.trim(),
    },
    primaryCentreId: values.primaryCentreId,
    level: values.level as BatchLevel,
    status: values.status as StudentStatus,
    joinedDate: values.joinedDate,
    medicalNotes: values.medicalNotes?.trim() || null,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
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
    photoPath: null,
    batchIds: [],
    createdAt: serverTimestamp(),
    createdBy: userId,
  });
  return ref.id;
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
