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
  getDoc,
  getDocs,
  setDoc,
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
  MonthlyAssessmentDocument,
  CoachRecommendation,
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

// ── Monthly Assessments ──
// Path: /progress/{studentId}/assessments/{YYYY-MM}

function assessmentsCol(studentId: string) {
  return collection(db, 'progress', studentId, 'assessments');
}

function assessmentFromFirestore(id: string, data: DocumentData): MonthlyAssessmentDocument {
  return {
    id,
    studentId: data.studentId ?? '',
    batchId: data.batchId ?? '',
    coachId: data.coachId ?? '',
    sport: data.sport ?? 'BADMINTON',
    yearMonth: data.yearMonth ?? '',
    scores: data.scores ?? {},
    recommendation: data.recommendation ?? 'MAINTAIN',
    strengths: data.strengths ?? '',
    areasForImprovement: data.areasForImprovement ?? '',
    coachComments: data.coachComments ?? '',
    sharedWithParent: data.sharedWithParent ?? false,
    sharedAt: data.sharedAt ? toIso(data.sharedAt) : null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

/** Get monthly assessment for a specific student and month. */
export async function getAssessment(
  studentId: string,
  yearMonth: string,
): Promise<MonthlyAssessmentDocument | null> {
  const ref = doc(db, 'progress', studentId, 'assessments', yearMonth);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return assessmentFromFirestore(snap.id, snap.data());
}

/** Submit or update a monthly assessment (doc id = yearMonth for idempotent writes). */
export async function submitAssessment(data: {
  studentId: string;
  batchId: string;
  coachId: string;
  sport: string;
  yearMonth: string;
  scores: Record<string, number>;
  recommendation: string;
  strengths: string;
  areasForImprovement: string;
  coachComments: string;
}): Promise<void> {
  const ref = doc(db, 'progress', data.studentId, 'assessments', data.yearMonth);
  await setDoc(ref, {
    studentId: data.studentId,
    batchId: data.batchId,
    coachId: data.coachId,
    sport: data.sport,
    yearMonth: data.yearMonth,
    scores: data.scores,
    recommendation: data.recommendation,
    strengths: data.strengths.trim(),
    areasForImprovement: data.areasForImprovement.trim(),
    coachComments: data.coachComments.trim(),
    sharedWithParent: false,
    sharedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: data.coachId,
    updatedBy: data.coachId,
  }, { merge: true });
}

/** Get all assessments for a student, ordered by yearMonth desc. */
export async function getAssessmentsByStudent(
  studentId: string,
): Promise<MonthlyAssessmentDocument[]> {
  const q = query(assessmentsCol(studentId), orderBy('yearMonth', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => assessmentFromFirestore(d.id, d.data()));
}

/** Share assessment with parent. */
export async function shareAssessmentWithParent(
  studentId: string,
  yearMonth: string,
): Promise<void> {
  const ref = doc(db, 'progress', studentId, 'assessments', yearMonth);
  await updateDoc(ref, {
    sharedWithParent: true,
    sharedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
}
