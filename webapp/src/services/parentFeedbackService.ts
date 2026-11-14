/**
 * Parent Feedback service — Firestore operations for the top-level
 * /parentFeedback/{feedbackId} collection.
 *
 * Feedback is submitted by parents (via Google Form import or manual entry)
 * and reviewed by centre managers or admins. Low ratings trigger automatic
 * escalation so nothing slips through the cracks.
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
import type { ParentFeedbackDocument, FeedbackStatus } from '@bba/shared';

// ── Path helpers ──

const feedbackCol = collection(db, 'parentFeedback');

function feedbackRef(feedbackId: string) {
  return doc(db, 'parentFeedback', feedbackId);
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

function fromFirestore(id: string, data: DocumentData): ParentFeedbackDocument {
  return {
    id,
    studentId: data.studentId ?? '',
    centreId: data.centreId ?? '',
    batchId: data.batchId ?? '',
    yearMonth: data.yearMonth ?? '',
    parentName: data.parentName ?? '',
    parentPhone: data.parentPhone ?? null,
    overallSatisfaction: data.overallSatisfaction ?? 0,
    coachQuality: data.coachQuality ?? 0,
    facilityRating: data.facilityRating ?? 0,
    childProgressPerceived: data.childProgressPerceived ?? 0,
    npsScore: data.npsScore ?? 0,
    comment: data.comment ?? null,
    status: (data.status ?? 'SUBMITTED') as FeedbackStatus,
    autoEscalated: data.autoEscalated ?? false,
    source: data.source ?? 'MANUAL',
    reviewedBy: data.reviewedBy ?? null,
    reviewNote: data.reviewNote ?? null,
    reviewedAt: data.reviewedAt ? toIso(data.reviewedAt) : null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

// ── CRUD ──

/**
 * Create a new parent feedback entry. Automatically escalates if any of the
 * numeric ratings (overallSatisfaction, coachQuality, facilityRating,
 * childProgressPerceived) is 3 or below.
 */
export async function createFeedback(
  data: Omit<ParentFeedbackDocument, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
  userId: string,
): Promise<ParentFeedbackDocument> {
  const shouldEscalate =
    data.overallSatisfaction <= 3 ||
    data.coachQuality <= 3 ||
    data.facilityRating <= 3 ||
    data.childProgressPerceived <= 3;

  const payload: Record<string, unknown> = {
    ...data,
    autoEscalated: shouldEscalate ? true : data.autoEscalated,
    status: shouldEscalate ? 'ESCALATED' : data.status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  };

  const docRef = await addDoc(feedbackCol, payload);
  const now = new Date().toISOString();
  return fromFirestore(docRef.id, {
    ...payload,
    createdAt: now,
    updatedAt: now,
  });
}

/** Get all feedback for a centre, optionally filtered by yearMonth. */
export async function getFeedbackByCentre(
  centreId: string,
  yearMonth?: string,
): Promise<ParentFeedbackDocument[]> {
  const constraints = [
    where('centreId', '==', centreId),
    ...(yearMonth ? [where('yearMonth', '==', yearMonth)] : []),
    orderBy('createdAt', 'desc'),
  ];
  const q = query(feedbackCol, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

/** Get all feedback, optionally filtered by yearMonth. */
export async function getAllFeedback(
  yearMonth?: string,
): Promise<ParentFeedbackDocument[]> {
  const constraints = [
    ...(yearMonth ? [where('yearMonth', '==', yearMonth)] : []),
    orderBy('createdAt', 'desc'),
  ];
  const q = query(feedbackCol, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

/** Mark feedback as reviewed with a note. */
export async function reviewFeedback(
  feedbackId: string,
  reviewNote: string,
  reviewerId: string,
): Promise<void> {
  const ref = feedbackRef(feedbackId);
  await updateDoc(ref, {
    status: 'REVIEWED' satisfies FeedbackStatus,
    reviewedBy: reviewerId,
    reviewNote,
    reviewedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
    updatedBy: reviewerId,
  });
}

/** Mark feedback as resolved. */
export async function resolveFeedback(
  feedbackId: string,
  userId: string,
): Promise<void> {
  const ref = feedbackRef(feedbackId);
  await updateDoc(ref, {
    status: 'RESOLVED' satisfies FeedbackStatus,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/** Delete a feedback entry. */
export async function deleteFeedback(feedbackId: string): Promise<void> {
  await deleteDoc(feedbackRef(feedbackId));
}
