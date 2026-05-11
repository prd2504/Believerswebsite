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
  query,
  orderBy,
  where,
  serverTimestamp,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS, PAYMENT, formatINR } from '@bba/shared';
import type { PaymentDocument, PaymentStatus, PaymentMethod } from '@bba/shared';

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

export interface CreatePaymentInput {
  studentId: string;
  batchId: string;
  centreId: string;
  month: string;
  baseAmountPaise: number;
  gstRatePercent?: number;
  dueDate?: string | null;
  notes?: string | null;
  createdBy: string;
}

export async function createPayment(input: CreatePaymentInput): Promise<string> {
  const rate = input.gstRatePercent ?? PAYMENT.defaultGstRatePercent;
  const gst = Math.round((input.baseAmountPaise * rate) / 100);
  const total = input.baseAmountPaise + gst;

  const ref = await addDoc(collection(db, COLLECTIONS.payments), {
    studentId: input.studentId,
    batchId: input.batchId,
    centreId: input.centreId,
    month: input.month,
    baseAmountPaise: input.baseAmountPaise,
    gstAmountPaise: gst,
    totalAmountPaise: total,
    gstRatePercentSnapshot: rate,
    status: 'PENDING',
    method: 'NONE',
    dueDate: input.dueDate ?? null,
    paidAt: null,
    razorpayOrderId: null,
    razorpayPaymentId: null,
    razorpaySignature: null,
    notes: input.notes ?? null,
    receiptNumber: null,
    receiptPdfPath: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
  });
  return ref.id;
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
