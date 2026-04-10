/**
 * Student CRUD service — all Firestore operations for /students/{studentId}.
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
  arrayUnion,
  arrayRemove,
  increment,
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
    batchIds: values.batchIds,
    level: values.level as BatchLevel,
    status: values.status as StudentStatus,
    joinedDate: values.joinedDate,
    medicalNotes: values.medicalNotes?.trim() || null,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  };
}

/** Fetch all students ordered by name. */
export async function getAllStudents(): Promise<StudentDocument[]> {
  const q = query(collection(db, COLLECTIONS.students), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

/** Fetch students at a specific centre. */
export async function getStudentsByCentre(centreId: string): Promise<StudentDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.students),
    where('primaryCentreId', '==', centreId),
    orderBy('name', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

/** Fetch students enrolled in a specific batch. */
export async function getStudentsByBatch(batchId: string): Promise<StudentDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.students),
    where('batchIds', 'array-contains', batchId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

/** Fetch a single student by id. */
export async function getStudentById(studentId: string): Promise<StudentDocument | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.students, studentId));
  if (!snap.exists()) return null;
  return fromFirestore(snap.id, snap.data());
}

/** Create a new student. Returns the new document id. */
export async function createStudent(values: StudentFormValues, userId: string): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.students), {
    ...toFirestoreData(values, userId),
    photoPath: null,
    createdAt: serverTimestamp(),
    createdBy: userId,
  });

  // Update currentEnrolment on each enrolled batch
  for (const batchId of values.batchIds) {
    const batchRef = doc(db, COLLECTIONS.batches, batchId);
    await updateDoc(batchRef, {
      studentIds: arrayUnion(ref.id),
      currentEnrolment: increment(1),
    });
  }

  return ref.id;
}

/** Update an existing student. Handles batch enrolment changes. */
export async function updateStudent(
  studentId: string,
  values: StudentFormValues,
  previousBatchIds: string[],
  userId: string,
): Promise<void> {
  const ref = doc(db, COLLECTIONS.students, studentId);
  await updateDoc(ref, toFirestoreData(values, userId));

  // Compute added / removed batches
  const added = values.batchIds.filter((id) => !previousBatchIds.includes(id));
  const removed = previousBatchIds.filter((id) => !values.batchIds.includes(id));

  for (const batchId of added) {
    const batchRef = doc(db, COLLECTIONS.batches, batchId);
    await updateDoc(batchRef, {
      studentIds: arrayUnion(studentId),
      currentEnrolment: increment(1),
    });
  }
  for (const batchId of removed) {
    const batchRef = doc(db, COLLECTIONS.batches, batchId);
    await updateDoc(batchRef, {
      studentIds: arrayRemove(studentId),
      currentEnrolment: increment(-1),
    });
  }
}

/** Delete a student and clean up batch enrolments. */
export async function deleteStudent(studentId: string, batchIds: string[]): Promise<void> {
  for (const batchId of batchIds) {
    const batchRef = doc(db, COLLECTIONS.batches, batchId);
    await updateDoc(batchRef, {
      studentIds: arrayRemove(studentId),
      currentEnrolment: increment(-1),
    });
  }
  await deleteDoc(doc(db, COLLECTIONS.students, studentId));
}
