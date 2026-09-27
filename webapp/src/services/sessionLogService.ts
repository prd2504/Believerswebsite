/**
 * Session Log service — Firestore operations for session log fields within
 * existing SessionDocument at /attendance/{batchId}/sessions/{sessionId}.
 *
 * Coaches use these functions to plan sessions, punch in/out, and submit
 * post-session reports. All writes update the existing session doc — no new
 * documents are created.
 */

import {
  doc,
  updateDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
  orderBy,
  collection,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SessionLogStatus } from '@bba/shared';

// ── Path helpers ──

function sessionRef(batchId: string, sessionId: string) {
  return doc(db, 'attendance', batchId, 'sessions', sessionId);
}

// ── Session Plan ──

/**
 * Submit a session plan for a given session. Sets the plan text, initial drills,
 * and marks the logStatus as PLANNED.
 */
export async function submitSessionPlan(
  batchId: string,
  sessionId: string,
  plan: string,
  drillsPlanned: string[],
  userId: string,
): Promise<void> {
  const ref = sessionRef(batchId, sessionId);
  await updateDoc(ref, {
    sessionPlan: plan,
    drillsConducted: drillsPlanned,
    logStatus: 'PLANNED' satisfies SessionLogStatus,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

// ── Punch In / Out ──

/**
 * Record the coach's punch-in time and optional geo-location.
 * Transitions the session logStatus to IN_PROGRESS.
 */
export async function punchIn(
  batchId: string,
  sessionId: string,
  userId: string,
  geo?: { lat: number; lng: number },
): Promise<void> {
  const ref = sessionRef(batchId, sessionId);
  await updateDoc(ref, {
    punchInAt: new Date().toISOString(),
    punchInGeo: geo ?? null,
    logStatus: 'IN_PROGRESS' satisfies SessionLogStatus,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/**
 * Record the coach's punch-out time and optional geo-location.
 */
export async function punchOut(
  batchId: string,
  sessionId: string,
  userId: string,
  geo?: { lat: number; lng: number },
): Promise<void> {
  const ref = sessionRef(batchId, sessionId);
  await updateDoc(ref, {
    punchOutAt: new Date().toISOString(),
    punchOutGeo: geo ?? null,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

// ── Post-Session Report ──

/**
 * Submit the post-session report with drills conducted, notes, and self-rating.
 * Transitions the session logStatus to COMPLETED.
 */
export async function submitPostSessionReport(
  batchId: string,
  sessionId: string,
  data: {
    drillsConducted: string[];
    postSessionNotes: string;
    coachSelfRating: number;
  },
  userId: string,
): Promise<void> {
  const ref = sessionRef(batchId, sessionId);
  await updateDoc(ref, {
    drillsConducted: data.drillsConducted,
    postSessionNotes: data.postSessionNotes,
    coachSelfRating: data.coachSelfRating,
    logStatus: 'COMPLETED' satisfies SessionLogStatus,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}
