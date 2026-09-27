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
  writeBatch,
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
  /**
   * Explicit record id, for attendees that are neither a student nor a
   * phone-identified walk-in — Ruia's register is keyed by slot BOOKING id,
   * because a booking is the only stable identifier that flow has.
   *
   * Without this the id falls back to the walk-in's phone, and every Ruia
   * attendee (whose phone now lives in a private subcollection the client
   * cannot read) would collide on a single `trial_` row.
   */
  recordId?: string;
}

/** Firestore caps a write batch at 500 operations. Leave room for the session row. */
const MAX_BATCH_OPS = 450;

/**
 * Save every attendance mark for a session.
 *
 * ── Why this is one atomic commit ──
 * This used to `await setDoc(...)` once per attendee inside a for-loop, then
 * update the session. For a forty-student register that is forty-two
 * sequential round trips: roughly ten seconds on a good mobile connection and
 * well over a minute on a weak one, during which the Save button sits
 * disabled and looks dead. Worse, it was not atomic — a coach who lost signal
 * or navigated away halfway had half a register saved and no error anywhere.
 *
 * A write batch commits in ONE round trip, all-or-nothing. A register either
 * saves completely or not at all, and the coach finds out which within a
 * second.
 *
 * Registers larger than a batch allows are split into chunks. Those chunks are
 * not atomic with each other, which is a real (if remote) limitation — but it
 * beats the alternative of failing outright at 450 students.
 */
export async function saveAttendanceMarks(
  batchId: string,
  sessionId: string,
  sessionDate: string,
  marks: AttendanceMarkInput[],
  userId: string,
): Promise<void> {
  // Which records already exist, so an edit doesn't rewrite createdAt to now
  // and lose when the register was first taken. One read for the whole save.
  const existingIds = new Set(
    (await getDocs(recordsCol(batchId, sessionId)).catch(() => null))?.docs.map((d) => d.id) ?? [],
  );

  // Record id strategy:
  //   - student-linked records: id = studentId (one per student per session)
  //   - pure trial walk-ins:    id = "trial_<phoneOrTimestamp>"
  const ops = marks.map((mark) => {
    const recordId = mark.recordId
      ?? (mark.studentId
        ? mark.studentId
        : `trial_${(mark.walkIn?.phone ?? '').replace(/\D/g, '') || `${Date.now()}`}`);
    const isNew = !existingIds.has(recordId);
    return {
      ref: recordRef(batchId, sessionId, recordId),
      data: {
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
        ...(isNew ? { createdAt: serverTimestamp(), createdBy: userId } : {}),
        updatedAt: serverTimestamp(),
        updatedBy: userId,
      },
    };
  });

  for (let i = 0; i < ops.length; i += MAX_BATCH_OPS) {
    const chunk = ops.slice(i, i + MAX_BATCH_OPS);
    const wb = writeBatch(db);
    chunk.forEach(({ ref, data }) => wb.set(ref, data, { merge: true }));

    // Ride the session's "ended" stamp along on the final chunk, so the
    // register and the fact that it was completed land together.
    if (i + MAX_BATCH_OPS >= ops.length) {
      wb.update(sessionRef(batchId, sessionId), {
        endedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
        updatedBy: userId,
      });
    }
    await wb.commit();
  }

  // An empty register still marks the session as taken — a coach who opens a
  // session with nobody expected and saves has genuinely finished it.
  if (ops.length === 0) {
    await updateDoc(sessionRef(batchId, sessionId), {
      endedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    });
  }
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
