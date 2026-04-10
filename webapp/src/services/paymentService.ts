/**
 * Payment service — Firestore CRUD for /payments/{paymentId}.
 * Amounts are stored as integer paise in Firestore. The form accepts rupees;
 * conversion happens here.
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
  where,
  orderBy,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS, rupeesToPaise, type PaymentDocument, type PaymentStatus, type PaymentMethod } from '@bba/shared';
import type { PaymentFormValues } from '@/lib/schemas/paymentSchema';

function toIso(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts) {
    return (ts as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

function fromFirestore(id: string, data: DocumentData): PaymentDocument {
  return {
    id,
    studentId: data.studentId ?? '',
    batchId: data.batchId ?? '',
    centreId: data.centreId ?? '',
    month: data.month ?? '',
    baseAmountPaise: data.baseAmountPaise ?? 0,
    gstAmountPaise: data.gstAmountPaise ?? 0,
    totalAmountPaise: data.totalAmountPaise ?? 0,
    gstRatePercentSnapshot: data.gstRatePercentSnapshot ?? 0,
    status: (data.status ?? 'PENDING') as PaymentStatus,
    method: (data.method ?? 'NONE') as PaymentMethod,
    dueDate: data.dueDate ?? null,
    paidAt: data.paidAt ? toIso(data.paidAt) : null,
    razorpayOrderId: data.razorpayOrderId ?? null,
    razorpayPaymentId: data.razorpayPaymentId ?? null,
    razorpaySignature: data.razorpaySignature ?? null,
    notes: data.notes ?? null,
    receiptNumber: data.receiptNumber ?? null,
    receiptPdfPath: data.receiptPdfPath ?? null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

function toFirestoreData(values: PaymentFormValues, userId: string) {
  const basePaise = rupeesToPaise(values.baseAmountRupees);
  const gstPaise = Math.round(basePaise * values.gstRatePercent / 100);
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

// ── Queries ──

export async function getAllPayments(): Promise<PaymentDocument[]> {
  const q = query(collection(db, COLLECTIONS.payments), orderBy('month', 'desc'));
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

export async function getPaymentsByCentre(centreId: string): Promise<PaymentDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.payments),
    where('centreId', '==', centreId),
    orderBy('month', 'desc'),
  );
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

export async function getPaymentById(paymentId: string): Promise<PaymentDocument | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.payments, paymentId));
  if (!snap.exists()) return null;
  return fromFirestore(snap.id, snap.data());
}

// ── Mutations ──

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

/** Mark a payment as paid (cash, bank transfer, etc.). */
export async function markPaymentPaid(
  paymentId: string,
  method: PaymentMethod,
  userId: string,
  notes?: string,
): Promise<void> {
  const ref = doc(db, COLLECTIONS.payments, paymentId);
  await updateDoc(ref, {
    status: 'PAID',
    method,
    paidAt: new Date().toISOString(),
    notes: notes?.trim() || null,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/** Waive a payment (discount, scholarship, etc.). */
export async function waivePayment(
  paymentId: string,
  userId: string,
  notes?: string,
): Promise<void> {
  const ref = doc(db, COLLECTIONS.payments, paymentId);
  await updateDoc(ref, {
    status: 'WAIVED',
    notes: notes?.trim() || null,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

export async function deletePayment(paymentId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.payments, paymentId));
}
