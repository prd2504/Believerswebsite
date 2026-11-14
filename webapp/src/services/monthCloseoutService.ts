/**
 * Month close-out — snapshots the totals for a centre's month into
 * /paymentMonthlySummaries/{centreId}_{yearMonth} and marks the month closed.
 *
 * Once closed, the admin UI treats the month as read-only (no Mark Paid /
 * Generate / Delete buttons). Super-admin can still mutate the underlying
 * /payments docs directly if a correction is needed, then reopen the month.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS, type PaymentDocument, type PaymentMonthlySummary } from '@bba/shared';
import { getPaymentsByMonth } from './paymentService';

function summaryDocId(centreId: string, yearMonth: string) {
  return `${centreId}_${yearMonth}`;
}

function toIso(ts: unknown): string | null {
  if (!ts) return null;
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts) {
    return (ts as Timestamp).toDate().toISOString();
  }
  return null;
}

function rollup(payments: PaymentDocument[]) {
  let totalBilledPaise = 0;
  let totalCollectedPaise = 0;
  let totalOverduePaise = 0;
  let countPaid = 0;
  let countPending = 0;
  let countOverdue = 0;
  let countWaived = 0;
  for (const p of payments) {
    totalBilledPaise += p.totalAmountPaise;
    if (p.status === 'PAID') {
      totalCollectedPaise += p.totalAmountPaise;
      countPaid++;
    } else if (p.status === 'OVERDUE') {
      totalOverduePaise += p.totalAmountPaise;
      countOverdue++;
    } else if (p.status === 'PENDING') {
      countPending++;
    } else if (p.status === 'WAIVED') {
      countWaived++;
    }
  }
  return {
    totalBilledPaise,
    totalCollectedPaise,
    totalOverduePaise,
    countPaid,
    countPending,
    countOverdue,
    countWaived,
  };
}

export async function getMonthlySummary(
  centreId: string,
  yearMonth: string,
): Promise<PaymentMonthlySummary | null> {
  const snap = await getDoc(
    doc(db, COLLECTIONS.paymentMonthlySummaries, summaryDocId(centreId, yearMonth)),
  );
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    yearMonth: data.yearMonth ?? yearMonth,
    centreId: data.centreId ?? centreId,
    totalBilledPaise: data.totalBilledPaise ?? 0,
    totalCollectedPaise: data.totalCollectedPaise ?? 0,
    totalOverduePaise: data.totalOverduePaise ?? 0,
    countPaid: data.countPaid ?? 0,
    countPending: data.countPending ?? 0,
    countOverdue: data.countOverdue ?? 0,
    countWaived: data.countWaived ?? 0,
    closedAt: toIso(data.closedAt),
    closedBy: data.closedBy ?? null,
  };
}

export async function isMonthClosed(centreId: string, yearMonth: string): Promise<boolean> {
  const s = await getMonthlySummary(centreId, yearMonth);
  return !!s?.closedAt;
}

/**
 * Snapshot the month's payments and mark closed. Re-running on an already-closed
 * month refreshes the snapshot but preserves the original closedAt/closedBy.
 */
export async function closeMonth(
  centreId: string,
  yearMonth: string,
  userId: string,
): Promise<PaymentMonthlySummary> {
  const allMonth = await getPaymentsByMonth(yearMonth);
  const payments = allMonth.filter((p) => p.centreId === centreId);
  const totals = rollup(payments);

  const ref = doc(db, COLLECTIONS.paymentMonthlySummaries, summaryDocId(centreId, yearMonth));
  const existing = await getDoc(ref);
  const existingClosedAt = existing.exists() ? toIso(existing.data().closedAt) : null;
  const existingClosedBy = existing.exists() ? (existing.data().closedBy as string | null) : null;

  const closedAt = existingClosedAt ?? new Date().toISOString();
  const closedBy = existingClosedBy ?? userId;

  await setDoc(ref, {
    yearMonth,
    centreId,
    ...totals,
    closedAt,
    closedBy,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });

  return {
    yearMonth,
    centreId,
    ...totals,
    closedAt,
    closedBy,
  };
}

/** Reopen a closed month. Super-admin only at the UI layer. */
export async function reopenMonth(
  centreId: string,
  yearMonth: string,
  userId: string,
): Promise<void> {
  const ref = doc(db, COLLECTIONS.paymentMonthlySummaries, summaryDocId(centreId, yearMonth));
  await updateDoc(ref, {
    closedAt: null,
    closedBy: null,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}
