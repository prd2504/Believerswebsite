/**
 * Tournament service — Firestore CRUD for /tournaments/{id}.
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
  setDoc,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { rupeesToPaise, COLLECTIONS } from '@bba/shared';
import type {
  TournamentDocument,
  TournamentRegistration,
  TournamentStatus,
} from '@bba/shared';
import type { TournamentFormValues } from '@/lib/schemas/tournamentSchema';

function toIso(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts)
    return (ts as Timestamp).toDate().toISOString();
  return new Date().toISOString();
}

function fromFirestore(id: string, d: DocumentData): TournamentDocument {
  return {
    id,
    name: d.name ?? '',
    description: d.description ?? '',
    sport: d.sport ?? 'BADMINTON',
    hostCentreId: d.hostCentreId ?? null,
    venueName: d.venueName ?? null,
    venueAddress: d.venueAddress ?? null,
    startDate: d.startDate ?? '',
    endDate: d.endDate ?? '',
    registrationDeadline: d.registrationDeadline ?? null,
    categories: Array.isArray(d.categories) ? d.categories : [],
    status: (d.status ?? 'UPCOMING') as TournamentStatus,
    entryFeePaise: d.entryFeePaise ?? null,
    coverImagePath: d.coverImagePath ?? null,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    createdBy: d.createdBy ?? null,
    updatedBy: d.updatedBy ?? null,
  };
}

function toFirestoreData(v: TournamentFormValues, userId: string) {
  return {
    name: v.name.trim(),
    description: v.description?.trim() ?? '',
    sport: v.sport,
    hostCentreId: v.hostCentreId || null,
    venueName: v.venueName?.trim() || null,
    venueAddress: v.venueAddress?.trim() || null,
    startDate: v.startDate,
    endDate: v.endDate,
    registrationDeadline: v.registrationDeadline || null,
    categories: v.categories,
    status: v.status,
    entryFeePaise: v.entryFeeRupees != null ? rupeesToPaise(v.entryFeeRupees) : null,
    coverImagePath: null,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  };
}

export async function getAllTournaments(): Promise<TournamentDocument[]> {
  const q = query(collection(db, COLLECTIONS.tournaments), orderBy('startDate', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

export async function getTournamentById(id: string): Promise<TournamentDocument | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.tournaments, id));
  if (!snap.exists()) return null;
  return fromFirestore(snap.id, snap.data());
}

export async function createTournament(v: TournamentFormValues, userId: string): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.tournaments), {
    ...toFirestoreData(v, userId),
    createdAt: serverTimestamp(),
    createdBy: userId,
  });
  return ref.id;
}

export async function updateTournament(id: string, v: TournamentFormValues, userId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.tournaments, id), toFirestoreData(v, userId));
}

export async function deleteTournament(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.tournaments, id));
}

// ── Registrations ──

function regFromFirestore(id: string, d: DocumentData): TournamentRegistration {
  return {
    id,
    tournamentId: d.tournamentId ?? '',
    studentId: d.studentId ?? id,
    categoryId: d.categoryId ?? '',
    registeredBy: d.registeredBy ?? '',
    confirmed: d.confirmed ?? false,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    createdBy: d.createdBy ?? null,
    updatedBy: d.updatedBy ?? null,
  };
}

export async function getRegistrations(tournamentId: string): Promise<TournamentRegistration[]> {
  const col = collection(db, COLLECTIONS.tournaments, tournamentId, COLLECTIONS.registrations);
  const snap = await getDocs(col);
  return snap.docs.map((d) => regFromFirestore(d.id, d.data()));
}

export async function registerStudent(
  tournamentId: string,
  studentId: string,
  categoryId: string,
  registeredBy: string,
): Promise<void> {
  const ref = doc(db, COLLECTIONS.tournaments, tournamentId, COLLECTIONS.registrations, studentId);
  await setDoc(ref, {
    tournamentId,
    studentId,
    categoryId,
    registeredBy,
    confirmed: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: registeredBy,
    updatedBy: registeredBy,
  });
}

export async function unregisterStudent(tournamentId: string, studentId: string): Promise<void> {
  await deleteDoc(
    doc(db, COLLECTIONS.tournaments, tournamentId, COLLECTIONS.registrations, studentId),
  );
}
