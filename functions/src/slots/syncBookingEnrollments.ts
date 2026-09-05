/**
 * Turn Ruia slot bookings into real enrolments.
 *
 * ── What was disconnected ──
 * Ruia sells through the booking portal, and the /fees flow deliberately
 * skipped auto-enrolment there ("Ruia tracks attendance via slotBookings, not
 * batch enrollments"). But Ruia also has four batches carrying real
 * enrolments, created by hand. So the centre had TWO models of who attends,
 * neither authoritative and neither aware of the other:
 *
 *   - A parent who paid through /fees got a booking and no enrolment, so they
 *     never appeared on a batch roster or in a coach's register.
 *   - The hand-made enrolments were never ended when a booking lapsed, so they
 *     accumulated month after month — which is why Ruia batches read 200% of
 *     capacity while the actual paying roll was far smaller.
 *
 * This makes the booking the source of truth and the enrolment its projection.
 * Every write to a booking re-derives the enrolments it implies: active while
 * the booking covers the current month, ended once it stops. Everything
 * downstream — rosters, registers, batch counts, fee reconciliation — then
 * works at Ruia exactly as it does everywhere else, with no special cases.
 *
 * ── Why enrolments rather than teaching everything about bookings ──
 * Enrolment is the vocabulary the entire rest of the app already speaks. One
 * function translating at the boundary is a great deal less surface than
 * every roster, register and report growing a Ruia branch.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { config } from '../config.js';
import {
  resolveBookingBatchIds,
  bookingDaysForBatch,
  slotStartTime,
  istNow,
  type BatchLike,
} from '@bba/shared';

const REGION = 'asia-south1';

/** Statuses that mean the participant has committed and should be on a roster. */
const LIVE_STATUSES = new Set(['CONFIRMED', 'PENDING_VERIFICATION']);

function enrollmentId(studentId: string, batchId: string): string {
  return `${studentId}_${batchId}`;
}

async function ruiaBatches(centreId: string): Promise<BatchLike[]> {
  const snap = await db.collection('batches').where('centreId', '==', centreId).get();
  return snap.docs.map((d) => {
    const b = d.data();
    return {
      id: d.id,
      centreId: b.centreId ?? '',
      status: b.status ?? 'ACTIVE',
      offeredDays: Array.isArray(b.offeredDays) ? b.offeredDays : [],
      frequencyPlans: Array.isArray(b.frequencyPlans) ? b.frequencyPlans : [],
      slotPlanTypes: Array.isArray(b.slotPlanTypes) ? b.slotPlanTypes : undefined,
      startTime: b.startTime ?? '',
    };
  });
}

/**
 * The centre a booking's batches live under.
 *
 * Bookings carry the portal's own centre id ('ruia-college'), which is NOT the
 * id of the centre document its batches hang off. Resolving by centreCode
 * keeps that translation in one place.
 */
async function centreIdForBooking(bookingCentreId: string): Promise<string | null> {
  if (bookingCentreId !== 'ruia-college') return bookingCentreId;
  const snap = await db.collection('centres').where('centreCode', '==', 'RUI').limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

export interface SyncResult {
  bookingId: string;
  studentId: string | null;
  created: string[];
  ended: string[];
  unmatched: boolean;
}

/**
 * Bring one booking's enrolments in line with what it currently says.
 *
 * Idempotent by construction: it computes the set of enrolments the booking
 * implies right now, creates what is missing, and ends what the booking no
 * longer justifies. Running it twice changes nothing the second time.
 */
export async function syncBookingToEnrollments(
  bookingId: string,
  booking: FirebaseFirestore.DocumentData,
  now = istNow(),
  dryRun = false,
): Promise<SyncResult> {
  const studentId: string | null = booking.studentId ?? null;
  const result: SyncResult = { bookingId, studentId, created: [], ended: [], unmatched: false };

  // Without a student there is nothing to enrol. Bookings taken before the
  // link existed are handled by the backfill, which reports them rather than
  // guessing from a name.
  if (!studentId) return result;

  const centreId = await centreIdForBooking(String(booking.centreId ?? ''));
  if (!centreId) {
    logger.warn('[bookingSync] no centre for booking', { bookingId, centreId: booking.centreId });
    return result;
  }

  const batches = await ruiaBatches(centreId);
  const live = LIVE_STATUSES.has(String(booking.status ?? ''));

  // A booking only justifies an enrolment while it covers the month we are in.
  // Without this the roll only ever grows: nothing ends an enrolment when the
  // month someone paid for runs out.
  const covers: string[] = Array.isArray(booking.coversMonths) && booking.coversMonths.length > 0
    ? booking.coversMonths
    : [String(booking.month ?? '')];
  const coversNow = covers.includes(now.date.slice(0, 7));

  const wantedBatchIds = live && coversNow ? resolveBookingBatchIds(booking as never, batches) : [];
  if (live && coversNow && wantedBatchIds.length === 0) {
    result.unmatched = true;
    logger.warn('[bookingSync] no batch serves this plan', {
      bookingId, planType: booking.planType, timeSlot: booking.timeSlot, centreId,
    });
  }

  const batchById = new Map(batches.map((b) => [b.id, b]));
  const nowIso = new Date().toISOString();

  // Create or refresh what the booking currently implies.
  for (const batchId of wantedBatchIds) {
    const batch = batchById.get(batchId)!;
    const days = bookingDaysForBatch(booking as never, batch);
    if (days.length === 0) continue;

    const plan = batch.frequencyPlans.find((p) => p.daysPerWeek === days.length)
      ?? batch.frequencyPlans[0];
    const ref = db.doc(`enrollments/${enrollmentId(studentId, batchId)}`);
    const existing = await ref.get();

    const payload = {
      studentId,
      batchId,
      centreId,
      daysPerWeek: days.length,
      monthlyFeePaise: plan?.monthlyFeePaise ?? 0,
      selectedDays: days.sort((a, b) => a - b),
      endDate: null,
      status: 'ACTIVE',
      timeSlotStartTime: slotStartTime(String(booking.timeSlot ?? '')),
      // Written every time so the enrolment always names the booking it came
      // from — the first question anyone asks of a surprising roster row.
      sourceBookingId: bookingId,
      notes: `Derived from slot booking ${bookingId} (${booking.planType}).`,
      updatedAt: nowIso,
      updatedBy: 'syncBookingToEnrollments',
      ...(existing.exists
        ? {}
        : { startDate: nowIso.slice(0, 10), pausedMonths: [], createdAt: nowIso, createdBy: 'syncBookingToEnrollments' }),
    };

    if (!dryRun) await ref.set(payload, { merge: true });
    if (!existing.exists || existing.data()?.status !== 'ACTIVE') result.created.push(batchId);
  }

  // End enrolments this booking previously created but no longer justifies —
  // a cancelled booking, a lapsed month, or a plan change that moved someone
  // to a different batch.
  const priorSnap = await db.collection('enrollments')
    .where('sourceBookingId', '==', bookingId)
    .get();
  for (const doc of priorSnap.docs) {
    const e = doc.data();
    if (wantedBatchIds.includes(String(e.batchId))) continue;
    if (e.status === 'ENDED') continue;
    if (!dryRun) {
      await doc.ref.update({
        status: 'ENDED',
        endDate: nowIso.slice(0, 10),
        updatedAt: nowIso,
        updatedBy: 'syncBookingToEnrollments',
      });
    }
    result.ended.push(String(e.batchId));
  }

  return result;
}

export const onSlotBookingWritten = onDocumentWritten(
  { document: 'slotBookings/{bookingId}', region: REGION, timeoutSeconds: 120 },
  async (event) => {
    if (!event.data) return;
    const after = event.data.after.exists ? event.data.after.data() : null;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const booking = after ?? before;
    if (!booking) return;

    try {
      // A deleted booking justifies nothing, so sync it as cancelled rather
      // than leaving its enrolments behind.
      const res = await syncBookingToEnrollments(
        event.params.bookingId as string,
        after ?? { ...booking, status: 'CANCELLED' },
      );
      if (res.created.length || res.ended.length || res.unmatched) {
        logger.info('[bookingSync] synced', res);
      }
    } catch (err) {
      // Never throw: the booking is correct, and retry-looping against a
      // batch lookup that is failing helps nobody.
      logger.error('[bookingSync] failed', { bookingId: event.params.bookingId, err });
    }
  },
);

/**
 * Month rollover: end the enrolments whose booking no longer covers the month
 * we have just entered.
 *
 * The per-write trigger cannot do this on its own — nothing writes to a
 * booking when its last covered month simply passes. Runs on the 1st, after
 * the sheet rollover has had its turn.
 */
export const monthlyBookingEnrollmentSync = onSchedule(
  { schedule: '30 3 1 * *', timeZone: 'Asia/Kolkata', region: REGION, timeoutSeconds: 540 },
  async () => { await syncAllBookings(); },
);

export async function syncAllBookings(dryRun = false): Promise<{
  total: number; created: number; ended: number; unmatched: string[]; unlinked: string[];
}> {
  const snap = await db.collection('slotBookings').get();
  let created = 0;
  let ended = 0;
  const unmatched: string[] = [];
  const unlinked: string[] = [];

  for (const doc of snap.docs) {
    const b = doc.data();
    if (!b.studentId) {
      // No student link. Reported, never guessed — matching a booking to a
      // student by name is how the wrong child ends up on a register.
      if (LIVE_STATUSES.has(String(b.status ?? ''))) unlinked.push(`${doc.id} (${b.participantName})`);
      continue;
    }
    // Runs in both modes now. A dry run that skipped the work could only ever
    // report what it had not looked at — it said "0 created" whether there was
    // nothing to do or everything to do, which is the opposite of a preview.
    const res = await syncBookingToEnrollments(doc.id, b, istNow(), dryRun);
    created += res.created.length;
    ended += res.ended.length;
    if (res.unmatched) unmatched.push(`${doc.id} (${b.planType} · ${b.timeSlot})`);
  }

  return { total: snap.size, created, ended, unmatched, unlinked };
}

/** Manual run — first-time backfill, or after fixing a batch's slotPlanTypes. */
export const backfillBookingEnrollments = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 540 },
  async (req, res): Promise<void> => {
    if (!config.sheets.apiKey || req.header('x-api-key') !== config.sheets.apiKey) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }
    try {
      const out = await syncAllBookings(String(req.query.dryRun ?? '') === '1');
      res.status(200).json({ ok: true, dryRun: String(req.query.dryRun ?? '') === '1', ...out });
    } catch (err: any) {
      logger.error('[backfillBookingEnrollments] failed', { err });
      res.status(500).json({ ok: false, error: err?.message ?? 'Internal error' });
    }
  },
);
