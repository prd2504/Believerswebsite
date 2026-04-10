/**
 * Batch CRUD service — all Firestore operations for /batches/{batchId}.
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
  type BatchDocument,
  type BatchTimeSlot,
  type SportType,
  type BatchLevel,
  type BatchStatus,
  rupeesToPaise,
} from '@bba/shared';
import type { BatchFormValues } from '@/lib/schemas/batchSchema';

function fromFirestore(id: string, data: DocumentData): BatchDocument {
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
    centreId: data.centreId ?? '',
    name: data.name ?? '',
    description: data.description ?? '',
    sport: data.sport ?? 'BADMINTON',
    level: data.level ?? 'BEGINNER',
    schedule: Array.isArray(data.schedule) ? data.schedule : [],
    maxCapacity: data.maxCapacity ?? 20,
    currentEnrolment: data.currentEnrolment ?? 0,
    monthlyFeePaise: data.monthlyFeePaise ?? 0,
    coachIds: Array.isArray(data.coachIds) ? data.coachIds : [],
    studentIds: Array.isArray(data.studentIds) ? data.studentIds : [],
    status: data.status ?? 'ACTIVE',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

function toFirestoreData(values: BatchFormValues, userId: string) {
  return {
    centreId: values.centreId,
    name: values.name.trim(),
    description: (values.description ?? '').trim(),
    sport: values.sport as SportType,
    level: values.level as BatchLevel,
    schedule: values.schedule as BatchTimeSlot[],
    maxCapacity: values.maxCapacity,
    monthlyFeePaise: rupeesToPaise(values.monthlyFeeRupees),
    coachIds: values.coachIds,
    status: values.status as BatchStatus,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  };
}

/** Fetch all batches, ordered by name. */
export async function getAllBatches(): Promise<BatchDocument[]> {
  const q = query(collection(db, COLLECTIONS.batches), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

/** Fetch batches for a specific centre. */
export async function getBatchesByCentre(centreId: string): Promise<BatchDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.batches),
    where('centreId', '==', centreId),
    orderBy('name', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

/** Fetch batches assigned to a specific coach. */
export async function getBatchesByCoach(coachId: string): Promise<BatchDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.batches),
    where('coachIds', 'array-contains', coachId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

/** Fetch a single batch by id. */
export async function getBatchById(batchId: string): Promise<BatchDocument | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.batches, batchId));
  if (!snap.exists()) return null;
  return fromFirestore(snap.id, snap.data());
}

/** Create a new batch. Returns the new document id. */
export async function createBatch(values: BatchFormValues, userId: string): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.batches), {
    ...toFirestoreData(values, userId),
    currentEnrolment: 0,
    studentIds: [],
    createdAt: serverTimestamp(),
    createdBy: userId,
  });
  return ref.id;
}

/** Update an existing batch. */
export async function updateBatch(
  batchId: string,
  values: BatchFormValues,
  userId: string,
): Promise<void> {
  const ref = doc(db, COLLECTIONS.batches, batchId);
  await updateDoc(ref, toFirestoreData(values, userId));
}

/** Delete a batch. Only admin should call this. */
export async function deleteBatch(batchId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.batches, batchId));
}
