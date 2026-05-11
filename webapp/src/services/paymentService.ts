/**
 * Payment service — Firestore CRUD for /payments/{paymentId}.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS, PAYMENT, rupeesToPaise } from '@bba/shared';
import type { PaymentDocument, PaymentStatus, PaymentMethod } from '@bba/shared';
import type { PaymentFormValues } from '@/lib/schemas/paymentSchema';

function toIso(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts)
    return (ts as Timestamp).toDate().toISOString();
  return new Date().toISOString();
}

function fromFirestore(id: string, d: DocumentData): PaymentDocument {
  return {
    id,
    studentId: d.studentId ?? '',
    batchId: d.batchId ?? '',
    centreId: d.centreId ?? '',
    month: d.month ?? '',
    baseAmountPaise: d.baseAmountPaise ?? 0,
    gstAmountPaise: d.gstAmountPaise ?? 0,
    totalAmountPaise: d.totalAmountPaise ?? 0,
    gstRatePercentSnapshot: d.gstRatePercentSnapshot ?? 0,
    status: d.status ?? 'PENDING',
    method: d.method ?? 'NONE',
    dueDate: d.dueDate ?? null,
    paidAt: d.paidAt ?? null,
    razorpayOrderId: d.razorpayOrderId ?? null,
    razorpayPaymentId: d.razorpayPaymentId ?? null,
    razorpaySignature: d.razorpaySignature ?? null,
    notes: d.notes ?? null,
    receiptNumber: d.receiptNumber ?? null,
    receiptPdfPath: d.receiptPdfPath ?? null,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    createdBy: d.createdBy ?? null,
    updatedBy: d.updatedBy ?? null,
  };
}

export async function getAllPayments(): Promise<PaymentDocument[]> {
  const q = query(collection(db, COLLECTIONS.payments), orderBy('month', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

export async function getPaymentsByMonth(month: string): Promise<PaymentDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.payments),
    where('month', '==', month),
    orderBy('studentId', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

export async function getPaymentsByStudent(studentId: string): Promise<PaymentDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.payments),
    where('studentId', '==', studentId),
    orderBy('month', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

function toFirestoreData(values: PaymentFormValues, userId: string) {
  const basePaise = rupeesToPaise(values.baseAmountRupees);
  const gstPaise = Math.round((basePaise * values.gstRatePercent) / 100);
  const totalPaise = basePaise + gstPaise;

  return {
    studentId: values.studentId,
    batchId: values.batchId,
    centreId: values.centreId,
    month: values.month,
    baseAmountPaise: basePaise,
    gstAmountPaise: gstPaise,
    totalAmountPaise: totalPaise,
    gstRatePercentSnapshot: values.gstRatePercent,
    status: values.status as PaymentStatus,
    method: values.method as PaymentMethod,
    dueDate: values.dueDate || null,
    paidAt: values.status === 'PAID' ? new Date().toISOString() : null,
    razorpayOrderId: null,
    razorpayPaymentId: null,
    razorpaySignature: null,
    notes: values.notes?.trim() || null,
    receiptNumber: null,
    receiptPdfPath: null,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  };
}

export async function createPayment(values: PaymentFormValues, userId: string): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.payments), {
    ...toFirestoreData(values, userId),
    createdAt: serverTimestamp(),
    createdBy: userId,
  });
  return ref.id;
}

export async function updatePayment(
  paymentId: string,
  values: PaymentFormValues,
  userId: string,
): Promise<void> {
  const ref = doc(db, COLLECTIONS.payments, paymentId);
  await updateDoc(ref, toFirestoreData(values, userId));
}

export async function deletePayment(paymentId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.payments, paymentId));
}

export async function waivePayment(
  paymentId: string,
  userId: string,
  reason: string,
): Promise<void> {
  const ref = doc(db, COLLECTIONS.payments, paymentId);
  await updateDoc(ref, {
    status: 'WAIVED',
    notes: reason,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

export async function generateMonthlyFees(
  month: string,
  userId: string,
  centreId?: string,
): Promise<{ created: number; skipped: number }> {
  const { getAllBatches } = await import('./batchService');
  const allBatches = await getAllBatches();
  const activeBatches = allBatches.filter(
    (b) => b.status === 'ACTIVE' && (!centreId || b.centreId === centreId),
  );

  const existingPayments = await getPaymentsByMonth(month);
  const existingSet = new Set(existingPayments.map((p) => `${p.studentId}|${p.batchId}`));

  let created = 0;
  let skipped = 0;

  for (const batch of activeBatches) {
    for (const studentId of batch.studentIds) {
      const key = `${studentId}|${batch.id}`;
      if (existingSet.has(key)) {
        skipped++;
        continue;
      }
      const basePaise = batch.frequencyPlans?.[0]?.monthlyFeePaise ?? 0;
      if (basePaise === 0) { skipped++; continue; }
      const gst = Math.round((basePaise * PAYMENT.defaultGstRatePercent) / 100);
      const [y, m] = month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const dueDate = `${month}-${String(lastDay).padStart(2, '0')}`;

      await addDoc(collection(db, COLLECTIONS.payments), {
        studentId,
        batchId: batch.id,
        centreId: batch.centreId,
        month,
        baseAmountPaise: basePaise,
        gstAmountPaise: gst,
        totalAmountPaise: basePaise + gst,
        gstRatePercentSnapshot: PAYMENT.defaultGstRatePercent,
        status: 'PENDING',
        method: 'NONE',
        dueDate,
        paidAt: null,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        razorpaySignature: null,
        notes: null,
        receiptNumber: null,
        receiptPdfPath: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
        updatedBy: userId,
      });
      created++;
    }
  }
  return { created, skipped };
}

export async function markPaymentPaid(
  paymentId: string,
  method: PaymentMethod,
  notes: string | null,
  updatedBy: string,
): Promise<void> {
  const ref = doc(db, COLLECTIONS.payments, paymentId);
  await updateDoc(ref, {
    status: 'PAID',
    method,
    paidAt: new Date().toISOString(),
    notes,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentStatus,
  updatedBy: string,
): Promise<void> {
  const ref = doc(db, COLLECTIONS.payments, paymentId);
  await updateDoc(ref, {
    status,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}
