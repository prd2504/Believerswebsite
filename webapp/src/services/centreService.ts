/**
 * Centre CRUD service — all Firestore operations for /centres/{centreId}.
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
import { COLLECTIONS, type CentreDocument, type SportType, type OperatingHours } from '@bba/shared';
import type { CentreFormValues } from '@/lib/schemas/centreSchema';

function fromFirestore(id: string, data: DocumentData): CentreDocument {
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
    address: data.address ?? '',
    city: data.city ?? '',
    pincode: data.pincode ?? '',
    googleMapsUrl: data.googleMapsUrl ?? null,
    geo: data.geo ?? null,
    courtCount: data.courtCount ?? 0,
    sportTypes: Array.isArray(data.sportTypes) ? data.sportTypes : [],
    operatingHours: Array.isArray(data.operatingHours) ? data.operatingHours : [],
    gstRatePercent: data.gstRatePercent ?? 0,
    active: data.active ?? true,
    contactPhone: data.contactPhone ?? null,
    contactEmail: data.contactEmail ?? null,
    centreCode: data.centreCode ?? null,
    lastStudentNo: data.lastStudentNo ?? 0,
    lastInvoiceNo: data.lastInvoiceNo ?? 0,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

/** Convert form values to the Firestore document shape for write. */
function toFirestoreData(values: CentreFormValues, userId: string) {
  return {
    name: values.name.trim(),
    address: values.address.trim(),
    city: values.city.trim(),
    pincode: values.pincode.trim(),
    googleMapsUrl: values.googleMapsUrl?.trim() || null,
    geo: null,
    courtCount: values.courtCount,
    sportTypes: values.sportTypes as SportType[],
    operatingHours: values.operatingHours as OperatingHours[],
    gstRatePercent: values.gstRatePercent,
    active: values.active,
    contactPhone: values.contactPhone?.trim() || null,
    contactEmail: values.contactEmail?.trim() || null,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  };
}

/** Fetch all centres, ordered by name. */
export async function getAllCentres(): Promise<CentreDocument[]> {
  const q = query(collection(db, COLLECTIONS.centres), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

/** Fetch only active centres. */
export async function getActiveCentres(): Promise<CentreDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.centres),
    where('active', '==', true),
    orderBy('name', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

/** Fetch a single centre by id. */
export async function getCentreById(centreId: string): Promise<CentreDocument | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.centres, centreId));
  if (!snap.exists()) return null;
  return fromFirestore(snap.id, snap.data());
}

/** Create a new centre. Returns the new document id. */
export async function createCentre(values: CentreFormValues, userId: string): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.centres), {
    ...toFirestoreData(values, userId),
    createdAt: serverTimestamp(),
    createdBy: userId,
  });
  return ref.id;
}

/** Update an existing centre. */
export async function updateCentre(
  centreId: string,
  values: CentreFormValues,
  userId: string,
): Promise<void> {
  const ref = doc(db, COLLECTIONS.centres, centreId);
  await updateDoc(ref, toFirestoreData(values, userId));
}

/** Delete a centre. Only SUPER_ADMIN should call this. */
export async function deleteCentre(centreId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.centres, centreId));
}
