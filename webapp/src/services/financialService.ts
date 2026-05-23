/**
 * Financial service — Firestore operations for centre expenses and partner payouts.
 *
 * Collections:
 *   /centreExpenses/{expenseId}   — operational expenses logged per centre
 *   /partnerPayouts/{payoutId}   — payments made to venue / franchise partners
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  CentreExpenseDocument,
  PartnerPayoutDocument,
  ExpenseCategory,
  PayoutStatus,
} from '@bba/shared';

// ── Path helpers ──

const expensesCol = collection(db, 'centreExpenses');
const payoutsCol = collection(db, 'partnerPayouts');

function expenseRef(expenseId: string) {
  return doc(db, 'centreExpenses', expenseId);
}

function payoutRef(payoutId: string) {
  return doc(db, 'partnerPayouts', payoutId);
}

// ── Converters ──

function toIso(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts) {
    return (ts as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

function expenseFromFirestore(id: string, data: DocumentData): CentreExpenseDocument {
  return {
    id,
    centreId: data.centreId ?? '',
    category: (data.category ?? 'OTHER') as ExpenseCategory,
    description: data.description ?? '',
    amountPaise: data.amountPaise ?? 0,
    expenseDate: data.expenseDate ?? '',
    yearMonth: data.yearMonth ?? '',
    receiptPath: data.receiptPath ?? null,
    approvedBy: data.approvedBy ?? null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

function payoutFromFirestore(id: string, data: DocumentData): PartnerPayoutDocument {
  return {
    id,
    centreId: data.centreId ?? '',
    partnerName: data.partnerName ?? '',
    amountPaise: data.amountPaise ?? 0,
    yearMonth: data.yearMonth ?? '',
    payoutDate: data.payoutDate ?? null,
    status: (data.status ?? 'PENDING') as PayoutStatus,
    method: data.method ?? '',
    referenceNumber: data.referenceNumber ?? null,
    notes: data.notes ?? null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

// ── Expense CRUD ──

/** Create a new centre expense record. */
export async function createExpense(
  data: {
    centreId: string;
    category: ExpenseCategory;
    description: string;
    amountPaise: number;
    expenseDate: string;
    yearMonth: string;
    receiptPath?: string;
  },
  userId: string,
): Promise<CentreExpenseDocument> {
  const payload: Record<string, unknown> = {
    centreId: data.centreId,
    category: data.category,
    description: data.description,
    amountPaise: data.amountPaise,
    expenseDate: data.expenseDate,
    yearMonth: data.yearMonth,
    receiptPath: data.receiptPath ?? null,
    approvedBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  };

  const docRef = await addDoc(expensesCol, payload);
  const now = new Date().toISOString();
  return expenseFromFirestore(docRef.id, {
    ...payload,
    createdAt: now,
    updatedAt: now,
  });
}

/** Update an existing expense record. */
export async function updateExpense(
  expenseId: string,
  data: Partial<{
    centreId: string;
    category: ExpenseCategory;
    description: string;
    amountPaise: number;
    expenseDate: string;
    yearMonth: string;
    receiptPath: string | null;
    approvedBy: string | null;
  }>,
  userId: string,
): Promise<void> {
  const ref = expenseRef(expenseId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/** Delete an expense record. */
export async function deleteExpense(expenseId: string): Promise<void> {
  await deleteDoc(expenseRef(expenseId));
}

/** Get all expenses for a centre, optionally filtered by yearMonth. */
export async function getExpensesByCentre(
  centreId: string,
  yearMonth?: string,
): Promise<CentreExpenseDocument[]> {
  const constraints = [
    where('centreId', '==', centreId),
    ...(yearMonth ? [where('yearMonth', '==', yearMonth)] : []),
    orderBy('expenseDate', 'desc'),
  ];
  const q = query(expensesCol, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => expenseFromFirestore(d.id, d.data()));
}

/** Get all expenses, optionally filtered by yearMonth. */
export async function getAllExpenses(
  yearMonth?: string,
): Promise<CentreExpenseDocument[]> {
  const constraints = [
    ...(yearMonth ? [where('yearMonth', '==', yearMonth)] : []),
    orderBy('expenseDate', 'desc'),
  ];
  const q = query(expensesCol, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => expenseFromFirestore(d.id, d.data()));
}

// ── Payout CRUD ──

/** Create a new partner payout record. */
export async function createPayout(
  data: {
    centreId: string;
    partnerName: string;
    amountPaise: number;
    yearMonth: string;
    payoutDate?: string;
    status: PayoutStatus;
    method: string;
    referenceNumber?: string;
    notes?: string;
  },
  userId: string,
): Promise<PartnerPayoutDocument> {
  const payload: Record<string, unknown> = {
    centreId: data.centreId,
    partnerName: data.partnerName,
    amountPaise: data.amountPaise,
    yearMonth: data.yearMonth,
    payoutDate: data.payoutDate ?? null,
    status: data.status,
    method: data.method,
    referenceNumber: data.referenceNumber ?? null,
    notes: data.notes ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  };

  const docRef = await addDoc(payoutsCol, payload);
  const now = new Date().toISOString();
  return payoutFromFirestore(docRef.id, {
    ...payload,
    createdAt: now,
    updatedAt: now,
  });
}

/** Update an existing payout record. */
export async function updatePayout(
  payoutId: string,
  data: Partial<{
    centreId: string;
    partnerName: string;
    amountPaise: number;
    yearMonth: string;
    payoutDate: string | null;
    status: PayoutStatus;
    method: string;
    referenceNumber: string | null;
    notes: string | null;
  }>,
  userId: string,
): Promise<void> {
  const ref = payoutRef(payoutId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/** Delete a payout record. */
export async function deletePayout(payoutId: string): Promise<void> {
  await deleteDoc(payoutRef(payoutId));
}

/** Get all payouts for a centre, optionally filtered by yearMonth. */
export async function getPayoutsByCentre(
  centreId: string,
  yearMonth?: string,
): Promise<PartnerPayoutDocument[]> {
  const constraints = [
    where('centreId', '==', centreId),
    ...(yearMonth ? [where('yearMonth', '==', yearMonth)] : []),
    orderBy('createdAt', 'desc'),
  ];
  const q = query(payoutsCol, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => payoutFromFirestore(d.id, d.data()));
}

/** Get all payouts, optionally filtered by yearMonth. */
export async function getAllPayouts(
  yearMonth?: string,
): Promise<PartnerPayoutDocument[]> {
  const constraints = [
    ...(yearMonth ? [where('yearMonth', '==', yearMonth)] : []),
    orderBy('createdAt', 'desc'),
  ];
  const q = query(payoutsCol, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => payoutFromFirestore(d.id, d.data()));
}
