/**
 * Attendance service — Firestore operations for the nested
 * /attendance/{batchId}/sessions/{sessionId} and .../records/{recordId} paths.
 *
 * Records carry an attendeeType:
 *   - REGULAR : enrolled student whose selectedDays includes today
 *   - MAKEUP  : enrolled student making up a missed regular session
 *   - EXTRA   : existing student attending a bonus session
 *   - TRIAL   : walk-in / trial — may not be a Student doc yet
 *
 * Only REGULAR + MAKEUP feed the student's attendance % (computed by Cloud Function).
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
import {
  type SessionDocument,
  type AttendanceRecord,
  type AttendanceStatus,
  type AttendeeType,
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

function recordRef(batchId: string, sessionId: string, recordId: string) {
  return doc(db, 'attendance', batchId, 'sessions', sessionId, 'records', recordId);
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
    sessionPlan: data.sessionPlan ?? null,
    drillsConducted: Array.isArray(data.drillsConducted) ? data.drillsConducted : [],
    postSessionNotes: data.postSessionNotes ?? null,
    coachSelfRating: data.coachSelfRating ?? null,
    punchInAt: data.punchInAt ? toIso(data.punchInAt) : null,
    punchOutAt: data.punchOutAt ? toIso(data.punchOutAt) : null,
    punchInGeo: data.punchInGeo ?? null,
    punchOutGeo: data.punchOutGeo ?? null,
    latePunchIn: data.latePunchIn ?? false,
    logStatus: data.logStatus ?? null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

function recordFromFirestore(id: string, data: DocumentData): AttendanceRecord {
  return {
    id,
    studentId: data.studentId ?? null,
    attendeeType: (data.attendeeType ?? 'REGULAR') as AttendeeType,
    walkInName: data.walkInName ?? null,
    walkInPhone: data.walkInPhone ?? null,
    walkInNotes: data.walkInNotes ?? null,
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
  userId: string,
): Promise<SessionDocument> {
  const sessionId = sessionDate; // one session per day per batch
  const ref = sessionRef(batchId, sessionId);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return sessionFromFirestore(snap.id, snap.data());
  }

  const now = new Date().toISOString();
  const editLockAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const newData = {
    batchId,
    centreId,
    sessionDate,
    coachIds: [userId],
    startedAt: now,
    endedAt: null,
    editLockAt,
    cancelled: false,
    cancellationReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  };

  await setDoc(ref, newData);
  return {
    id: sessionId,
    batchId,
    centreId,
    sessionDate,
    coachIds: [userId],
    startedAt: now,
    endedAt: null,
    editLockAt,
    cancelled: false,
    cancellationReason: null,
    sessionPlan: null,
    drillsConducted: [],
    postSessionNotes: null,
    coachSelfRating: null,
    punchInAt: null,
    punchOutAt: null,
    punchInGeo: null,
    punchOutGeo: null,
    latePunchIn: false,
    logStatus: null,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
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

export interface AttendanceMarkInput {
  /** Existing student id. NULL only when attendeeType=TRIAL and student isn't in system. */
  studentId: string | null;
  attendeeType: AttendeeType;
  status: AttendanceStatus;
  note?: string;
  /** Required when studentId is null (pure trial walk-in). */
  walkIn?: { name: string; phone: string; notes?: string };
}

/**
 * Save attendance marks for a session in a single batch write. Use this to persist the
 * coach's session — pass every attendee (regular roster + ad-hoc additions).
 */
export async function saveAttendanceMarks(
  batchId: string,
  sessionId: string,
  sessionDate: string,
  marks: AttendanceMarkInput[],
  userId: string,
): Promise<void> {
  for (const mark of marks) {
    // Record id strategy:
    //   - student-linked records: id = studentId (one per student per session)
    //   - pure trial walk-ins:    id = "trial_<phoneOrTimestamp>"  (auto-generated)
    let recordId: string;
    if (mark.studentId) {
      recordId = mark.studentId;
    } else {
      const phoneSlug = (mark.walkIn?.phone ?? '').replace(/\D/g, '') || `${Date.now()}`;
      recordId = `trial_${phoneSlug}`;
    }

    const ref = recordRef(batchId, sessionId, recordId);
    await setDoc(ref, {
      studentId: mark.studentId,
      attendeeType: mark.attendeeType,
      walkInName: mark.walkIn?.name ?? null,
      walkInPhone: mark.walkIn?.phone ?? null,
      walkInNotes: mark.walkIn?.notes ?? null,
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
