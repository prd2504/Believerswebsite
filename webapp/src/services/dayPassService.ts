/**
 * One-day gate passes.
 *
 * A day pass admits someone who has not paid for the month — a trial, a
 * guest, or a deliberate extension for a regular who is a day late. That makes
 * it a discretionary admission, which is precisely why it needs two people:
 * the centre manager raises it, a super admin approves it, and both names stay
 * on the record.
 *
 * The split is enforced in the Firestore rules, not here. This service is what
 * the UI talks to; the rules are what makes the separation real.
 */

import {
  collection, doc, addDoc, updateDoc, getDocs, query, where, orderBy,
  serverTimestamp, onSnapshot, type DocumentData, type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS, type DayPassDocument, type DayPassReason } from '@bba/shared';

const COL = COLLECTIONS.dayPasses;

function toIso(ts: unknown): string {
  if (!ts) return '';
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts) return (ts as Timestamp).toDate().toISOString();
  return '';
}

function fromFirestore(id: string, d: DocumentData): DayPassDocument {
  return {
    id,
    centreId: d.centreId ?? '',
    centreCode: d.centreCode ?? '',
    centreName: d.centreName ?? '',
    personName: d.personName ?? '',
    studentId: d.studentId ?? null,
    phone: d.phone ?? null,
    email: d.email ?? null,
    reason: d.reason ?? 'OTHER',
    notes: d.notes ?? null,
    validDate: d.validDate ?? '',
    status: d.status ?? 'PENDING_APPROVAL',
    token: d.token ?? '',
    requestedBy: d.requestedBy ?? '',
    requestedByName: d.requestedByName ?? '',
    requestedAt: toIso(d.requestedAt),
    approvedBy: d.approvedBy ?? null,
    approvedByName: d.approvedByName ?? null,
    approvedAt: toIso(d.approvedAt),
    rejectionReason: d.rejectionReason ?? null,
  };
}

export interface CreateDayPassInput {
  centreId: string;
  centreCode: string;
  centreName: string;
  personName: string;
  studentId?: string | null;
  phone?: string | null;
  email?: string | null;
  reason: DayPassReason;
  notes?: string | null;
  validDate: string;
}

/** Random enough that a pass URL cannot be walked from a neighbouring one. */
function makeToken(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export async function createDayPass(
  input: CreateDayPassInput,
  userId: string,
  userName: string,
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...input,
    studentId: input.studentId ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    notes: input.notes?.trim() || null,
    // Always pending, whoever created it. A super admin raising a pass still
    // gets a second look — the approval is a record, not a permission check.
    status: 'PENDING_APPROVAL',
    token: makeToken(),
    requestedBy: userId,
    requestedByName: userName,
    requestedAt: serverTimestamp(),
    approvedBy: null,
    approvedByName: null,
    approvedAt: null,
    rejectionReason: null,
  });
  return ref.id;
}

export async function approveDayPass(
  passId: string,
  userId: string,
  userName: string,
): Promise<void> {
  await updateDoc(doc(db, COL, passId), {
    status: 'APPROVED',
    approvedBy: userId,
    approvedByName: userName,
    approvedAt: serverTimestamp(),
    rejectionReason: null,
  });
}

export async function rejectDayPass(
  passId: string,
  userId: string,
  userName: string,
  reason: string,
): Promise<void> {
  await updateDoc(doc(db, COL, passId), {
    status: 'REJECTED',
    approvedBy: userId,
    approvedByName: userName,
    approvedAt: serverTimestamp(),
    rejectionReason: reason.trim() || null,
  });
}

/** Live day passes from a date onward — the queue plus what is coming up. */
export function subscribeToDayPasses(
  fromDate: string,
  cb: (rows: DayPassDocument[]) => void,
): () => void {
  return onSnapshot(
    query(collection(db, COL), where('validDate', '>=', fromDate), orderBy('validDate', 'asc')),
    (snap) => cb(snap.docs.map((d) => fromFirestore(d.id, d.data()))),
  );
}

/** Historical passes for a date range — the audit view. */
export async function getDayPasses(from: string, to: string): Promise<DayPassDocument[]> {
  const snap = await getDocs(query(
    collection(db, COL),
    where('validDate', '>=', from),
    where('validDate', '<=', to),
    orderBy('validDate', 'desc'),
  ));
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}
