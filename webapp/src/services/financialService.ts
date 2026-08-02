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
  setDoc,
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
import {
  recurringAppliesTo,
  postedRecurringExpenseId,
  type CentreExpenseDocument,
  type PartnerPayoutDocument,
  type RecurringExpenseDocument,
  type ExpenseCategory,
  type ExpenseStatus,
  type PayoutStatus,
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
    // Rows predating the approval workflow have no status. They could only ever
    // have been created by a super-admin, so they were already trusted spend —
    // reading them as APPROVED keeps historical P&L intact instead of silently
    // zeroing every past month.
    status: (data.status ?? 'APPROVED') as ExpenseStatus,
    approvedBy: data.approvedBy ?? null,
    approvedAt: data.approvedAt ? toIso(data.approvedAt) : null,
    rejectionReason: data.rejectionReason ?? null,
    submittedBy: data.submittedBy ?? null,
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
    /**
     * PENDING when a centre manager raises it (rules enforce this), APPROVED
     * when a super-admin records it directly — they are the approver, so a
     * second confirmation step would be theatre.
     */
    status?: ExpenseStatus;
  },
  userId: string,
): Promise<CentreExpenseDocument> {
  const status: ExpenseStatus = data.status ?? 'APPROVED';
  const payload: Record<string, unknown> = {
    centreId: data.centreId,
    category: data.category,
    description: data.description,
    amountPaise: data.amountPaise,
    expenseDate: data.expenseDate,
    yearMonth: data.yearMonth,
    receiptPath: data.receiptPath ?? null,
    status,
    approvedBy: status === 'APPROVED' ? userId : null,
    approvedAt: status === 'APPROVED' ? serverTimestamp() : null,
    rejectionReason: null,
    submittedBy: userId,
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

/**
 * Expenses for a set of centres in a month — the centre-manager view.
 *
 * Firestore's `in` operator caps at 30 values, and a query spanning a centre
 * the caller doesn't manage is rejected wholesale by the rules, so this
 * queries one centre at a time and merges.
 */
export async function getExpensesForCentres(
  centreIds: string[],
  yearMonth?: string,
): Promise<CentreExpenseDocument[]> {
  if (centreIds.length === 0) return [];
  const perCentre = await Promise.all(
    centreIds.map((id) => getExpensesByCentre(id, yearMonth)),
  );
  return perCentre
    .flat()
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
}

/** Approve a submitted expense — this is what lets it count toward profit. */
export async function approveExpense(expenseId: string, adminId: string): Promise<void> {
  await updateDoc(expenseRef(expenseId), {
    status: 'APPROVED' satisfies ExpenseStatus,
    approvedBy: adminId,
    approvedAt: serverTimestamp(),
    rejectionReason: null,
    updatedAt: serverTimestamp(),
    updatedBy: adminId,
  });
}

/**
 * Reject a submitted expense. Kept rather than deleted so the manager can see
 * what happened and why, instead of the row silently vanishing.
 */
export async function rejectExpense(
  expenseId: string,
  adminId: string,
  reason: string,
): Promise<void> {
  await updateDoc(expenseRef(expenseId), {
    status: 'REJECTED' satisfies ExpenseStatus,
    approvedBy: adminId,
    approvedAt: serverTimestamp(),
    rejectionReason: reason,
    updatedAt: serverTimestamp(),
    updatedBy: adminId,
  });
}

// ── Recurring expense templates ──

const recurringCol = collection(db, 'recurringExpenses');

function recurringFromFirestore(id: string, data: DocumentData): RecurringExpenseDocument {
  return {
    id,
    centreId: data.centreId ?? '',
    category: (data.category ?? 'OTHER') as ExpenseCategory,
    description: data.description ?? '',
    amountPaise: data.amountPaise ?? 0,
    dayOfMonth: data.dayOfMonth ?? 1,
    startMonth: data.startMonth ?? '',
    endMonth: data.endMonth ?? null,
    active: data.active ?? true,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

export async function getAllRecurringExpenses(): Promise<RecurringExpenseDocument[]> {
  const snap = await getDocs(query(recurringCol, orderBy('centreId', 'asc')));
  return snap.docs.map((d) => recurringFromFirestore(d.id, d.data()));
}

export async function createRecurringExpense(
  data: {
    centreId: string;
    category: ExpenseCategory;
    description: string;
    amountPaise: number;
    dayOfMonth: number;
    startMonth: string;
    endMonth?: string | null;
  },
  userId: string,
): Promise<string> {
  const ref = await addDoc(recurringCol, {
    ...data,
    // Cap at 28 — a template dated the 30th would silently roll into the next
    // month in February and land the expense outside the month it belongs to.
    dayOfMonth: Math.min(28, Math.max(1, data.dayOfMonth)),
    endMonth: data.endMonth ?? null,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  });
  return ref.id;
}

export async function updateRecurringExpense(
  templateId: string,
  data: Partial<Omit<RecurringExpenseDocument, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>>,
  userId: string,
): Promise<void> {
  const patch: Record<string, unknown> = { ...data, updatedAt: serverTimestamp(), updatedBy: userId };
  if (typeof data.dayOfMonth === 'number') {
    patch.dayOfMonth = Math.min(28, Math.max(1, data.dayOfMonth));
  }
  await updateDoc(doc(db, 'recurringExpenses', templateId), patch);
}

export async function deleteRecurringExpense(templateId: string): Promise<void> {
  await deleteDoc(doc(db, 'recurringExpenses', templateId));
}

export interface PostRecurringResult {
  posted: number;
  skipped: number;
}

/**
 * Materialise every applicable template into a real expense for the month.
 *
 * Idempotent: each posted row has a deterministic id derived from the template
 * and month, so running this twice updates the same rows rather than charging
 * a centre twice. That does mean re-posting overwrites hand-edits made to a
 * posted row — the template stays the source of truth for these.
 */
export async function postRecurringExpensesForMonth(
  yearMonth: string,
  templates: RecurringExpenseDocument[],
  userId: string,
): Promise<PostRecurringResult> {
  const applicable = templates.filter((t) => recurringAppliesTo(t, yearMonth));

  let posted = 0;
  for (const t of applicable) {
    const dom = Math.min(28, Math.max(1, t.dayOfMonth));
    const expenseDate = `${yearMonth}-${String(dom).padStart(2, '0')}`;
    const ref = expenseRef(postedRecurringExpenseId(t.id, yearMonth));

    // Preserve the original createdAt on a re-post so the row doesn't look
    // newly created every time the month is re-run.
    const existing = await getDoc(ref);

    await setDoc(
      ref,
      {
        centreId: t.centreId,
        category: t.category,
        description: t.description,
        amountPaise: t.amountPaise,
        expenseDate,
        yearMonth,
        receiptPath: null,
        // Posted by a super-admin from a template they authored — already
        // approved spend, so it counts toward P&L immediately.
        status: 'APPROVED' satisfies ExpenseStatus,
        approvedBy: userId,
        approvedAt: serverTimestamp(),
        rejectionReason: null,
        submittedBy: userId,
        sourceRecurringId: t.id,
        updatedAt: serverTimestamp(),
        updatedBy: userId,
        ...(existing.exists() ? {} : { createdAt: serverTimestamp(), createdBy: userId }),
      },
      { merge: true },
    );
    posted += 1;
  }

  return { posted, skipped: templates.length - applicable.length };
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
