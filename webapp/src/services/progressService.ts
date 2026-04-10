/**
 * Progress service — Firestore CRUD for skill scores and reports.
 *
 * Paths:
 *   /progress/{studentId}/scores/{scoreId}
 *   /progress/{studentId}/reports/{reportId}
 */

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  ProgressScoreDocument,
  ProgressReportDocument,
  SkillScoreMap,
  SportType,
} from '@bba/shared';

function toIso(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts) {
    return (ts as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

// ── Scores ──

function scoresCol(studentId: string) {
  return collection(db, 'progress', studentId, 'scores');
}

function scoreFromFirestore(id: string, data: DocumentData): ProgressScoreDocument {
  return {
    id,
    studentId: data.studentId ?? '',
    batchId: data.batchId ?? '',
    coachId: data.coachId ?? '',
    sport: data.sport ?? 'BADMINTON',
    assessedOn: data.assessedOn ?? '',
    scores: data.scores ?? {},
    note: data.note ?? null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

export async function getScoresByStudent(studentId: string): Promise<ProgressScoreDocument[]> {
  const q = query(scoresCol(studentId), orderBy('assessedOn', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => scoreFromFirestore(d.id, d.data()));
}

export async function getScoresByDateRange(
  studentId: string,
  start: string,
  end: string,
): Promise<ProgressScoreDocument[]> {
  const q = query(
    scoresCol(studentId),
    where('assessedOn', '>=', start),
    where('assessedOn', '<=', end),
    orderBy('assessedOn', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => scoreFromFirestore(d.id, d.data()));
}

export async function addScore(
  studentId: string,
  batchId: string,
  coachId: string,
  sport: SportType,
  assessedOn: string,
  scores: SkillScoreMap,
  note: string | null,
): Promise<string> {
  const ref = await addDoc(scoresCol(studentId), {
    studentId,
    batchId,
    coachId,
    sport,
    assessedOn,
    scores,
    note: note?.trim() || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: coachId,
    updatedBy: coachId,
  });
  return ref.id;
}

// ── Reports ──

function reportsCol(studentId: string) {
  return collection(db, 'progress', studentId, 'reports');
}

function reportFromFirestore(id: string, data: DocumentData): ProgressReportDocument {
  return {
    id,
    studentId: data.studentId ?? '',
    yearMonth: data.yearMonth ?? '',
    inputSnapshot: data.inputSnapshot ?? { attendancePercent: 0, averageScores: {}, sessionCount: 0, coachNotes: [] },
    summaryText: data.summaryText ?? '',
    modelId: data.modelId ?? '',
    delivered: data.delivered ?? false,
    deliveredAt: data.deliveredAt ? toIso(data.deliveredAt) : null,
    pdfPath: data.pdfPath ?? null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

export async function getReportsByStudent(studentId: string): Promise<ProgressReportDocument[]> {
  const q = query(reportsCol(studentId), orderBy('yearMonth', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => reportFromFirestore(d.id, d.data()));
}

/** Mark a report as delivered to the student/parent. */
export async function markReportDelivered(studentId: string, reportId: string): Promise<void> {
  const ref = doc(db, 'progress', studentId, 'reports', reportId);
  await updateDoc(ref, {
    delivered: true,
    deliveredAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
}
