/**
 * Attendance service — Firestore operations for the nested
 * /attendance/{batchId}/sessions/{sessionId} and .../records/{studentId} paths.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  SessionDocument,
  AttendanceRecord,
  AttendanceStatus,
} from '@bba/shared';

// ── Path helpers ──

function sessionsCol(batchId: string) {
  return collection(db, 'attendance', batchId, 'sessions');
}

function sessionRef(batchId: string, sessionId: string) {
  return doc(db, 'attendance', batchId, 'sessions', sessionId);
}

function recordsCol(batchId: string, sessionId: string) {
  return collection(db, 'attendance', batchId, 'sessions', sessionId, 'records');
}

function recordRef(batchId: string, sessionId: string, studentId: string) {
  return doc(db, 'attendance', batchId, 'sessions', sessionId, 'records', studentId);
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

function sessionFromFirestore(id: string, data: DocumentData): SessionDocument {
  return {
    id,
    batchId: data.batchId ?? '',
    centreId: data.centreId ?? '',
    sessionDate: data.sessionDate ?? '',
    coachIds: Array.isArray(data.coachIds) ? data.coachIds : [],
    startedAt: data.startedAt ? toIso(data.startedAt) : null,
    endedAt: data.endedAt ? toIso(data.endedAt) : null,
    editLockAt: data.editLockAt ? toIso(data.editLockAt) : null,
    cancelled: data.cancelled ?? false,
    cancellationReason: data.cancellationReason ?? null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

function recordFromFirestore(id: string, data: DocumentData): AttendanceRecord {
  return {
    id,
    studentId: data.studentId ?? id,
    batchId: data.batchId ?? '',
    sessionId: data.sessionId ?? '',
    sessionDate: data.sessionDate ?? '',
    status: (data.status ?? 'ABSENT') as AttendanceStatus,
    note: data.note ?? null,
    markedBy: data.markedBy ?? '',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

// ── Session CRUD ──

/** Get or create a session doc for the given batch + date. Returns the session. */
export async function getOrCreateSession(
  batchId: string,
  centreId: string,
  sessionDate: string,
  coachId: string,
): Promise<SessionDocument> {
  const sessionId = sessionDate; // Use date as the session id (one session/day/batch)
  const ref = sessionRef(batchId, sessionId);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return sessionFromFirestore(snap.id, snap.data());
  }

  // Create new session
  const now = new Date().toISOString();
  const editLockAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const newData = {
    batchId,
    centreId,
    sessionDate,
    coachIds: [coachId],
    startedAt: now,
    endedAt: null,
    editLockAt,
    cancelled: false,
    cancellationReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: coachId,
    updatedBy: coachId,
  };

  await setDoc(ref, newData);
  return {
    id: sessionId,
    batchId,
    centreId,
    sessionDate,
    coachIds: [coachId],
    startedAt: now,
    endedAt: null,
    editLockAt,
    cancelled: false,
    cancellationReason: null,
    createdAt: now,
    updatedAt: now,
    createdBy: coachId,
    updatedBy: coachId,
  };
}

/** List all sessions for a batch, ordered by date descending. */
export async function getSessionsByBatch(batchId: string): Promise<SessionDocument[]> {
  const q = query(sessionsCol(batchId), orderBy('sessionDate', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => sessionFromFirestore(d.id, d.data()));
}

/** List sessions for a batch within a date range. */
export async function getSessionsByDateRange(
  batchId: string,
  startDate: string,
  endDate: string,
): Promise<SessionDocument[]> {
  const q = query(
    sessionsCol(batchId),
    where('sessionDate', '>=', startDate),
    where('sessionDate', '<=', endDate),
    orderBy('sessionDate', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => sessionFromFirestore(d.id, d.data()));
}

// ── Attendance records ──

/** Save attendance marks for all students in one session. */
export async function saveAttendanceMarks(
  batchId: string,
  sessionId: string,
  sessionDate: string,
  marks: { studentId: string; status: AttendanceStatus; note?: string }[],
  userId: string,
): Promise<void> {
  for (const mark of marks) {
    const ref = recordRef(batchId, sessionId, mark.studentId);
    await setDoc(ref, {
      studentId: mark.studentId,
      batchId,
      sessionId,
      sessionDate,
      status: mark.status,
      note: mark.note?.trim() || null,
      markedBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: userId,
      updatedBy: userId,
    });
  }

  // Update session endedAt
  await updateDoc(sessionRef(batchId, sessionId), {
    endedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/** Get all attendance records for a session. */
export async function getAttendanceRecords(
  batchId: string,
  sessionId: string,
): Promise<AttendanceRecord[]> {
  const snap = await getDocs(recordsCol(batchId, sessionId));
  return snap.docs.map((d) => recordFromFirestore(d.id, d.data()));
}

/** Get attendance summary for a student across sessions in a date range. */
export async function getStudentAttendanceSummary(
  batchId: string,
  studentId: string,
  startDate: string,
  endDate: string,
): Promise<{ present: number; absent: number; late: number; excused: number; total: number }> {
  const sessions = await getSessionsByDateRange(batchId, startDate, endDate);
  let present = 0, absent = 0, late = 0, excused = 0;

  for (const session of sessions) {
    if (session.cancelled) continue;
    const ref = recordRef(batchId, session.id, studentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      absent++;
      continue;
    }
    const status = snap.data().status as AttendanceStatus;
    if (status === 'PRESENT') present++;
    else if (status === 'LATE') late++;
    else if (status === 'EXCUSED') excused++;
    else absent++;
  }

  return { present, absent, late, excused, total: present + absent + late + excused };
}
