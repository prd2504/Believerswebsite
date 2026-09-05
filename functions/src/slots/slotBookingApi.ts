/**
 * Slot booking writes, moved server-side to get phone numbers out of public
 * reach.
 *
 * The booking document is world-readable — that's deliberate, it's what lets
 * /fees show live slot counts and who has booked. But it also carried
 * participantPhone and participantEmail, so anyone who queried the collection
 * could dump every parent's contact details.
 *
 * Firestore rules are all-or-nothing per document: there is no way to allow
 * reading a document's name but not its phone number. So contact details move
 * to `slotBookings/{id}/private/contact`, which only an admin can read.
 *
 * That in turn means the public page can no longer create bookings directly
 * (it would need to write the private doc) nor run the duplicate check (it
 * queried by phone). Both now happen here, where the phone never leaves the
 * server.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../admin.js';
import { config } from '../config.js';
import { checkRateLimit } from '../fees/rateLimiter.js';

const REGION = 'asia-south1';

const PLAN_TYPES = ['TWO_DAY', 'THREE_DAY', 'FOUR_DAY', 'GAMES_DAY', 'COMPLETE_BUNDLE'];

function normPhone(s: unknown): string {
  const d = String(s ?? '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
}

/**
 * Has this phone already booked this plan for this month?
 *
 * Called BEFORE payment so a duplicate is caught while nothing has been
 * charged — never a paid-but-rejected booking. Reads the private contact docs
 * of candidate bookings; the phone is compared here and never returned.
 */
export const checkSlotBookingDuplicate = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 30 },
  async (req, res): Promise<void> => {
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

    const { phone, centreId, month, planType } = req.body ?? {};
    const p = normPhone(phone);
    if (p.length !== 10 || !centreId || !month) {
      res.status(400).json({ ok: false, error: 'phone, centreId and month are required' });
      return;
    }

    const ip = req.ip ?? req.header('x-forwarded-for') ?? 'anon';
    if (!checkRateLimit(`slotdup:${ip}`, 30, 10 * 60 * 1000)) {
      res.status(429).json({ ok: false, error: 'Too many requests' });
      return;
    }

    try {
      let q = db.collection('slotBookings')
        .where('centreId', '==', centreId)
        .where('month', '==', month);
      if (planType) q = q.where('planType', '==', planType);
      const snap = await q.get();

      // Candidate set is one centre+month+plan, so this is a handful of docs.
      const contacts = await Promise.all(
        snap.docs.map((d) => d.ref.collection('private').doc('contact').get()),
      );
      const duplicate = contacts.some((c) => c.exists && normPhone(c.data()?.participantPhone) === p);

      res.status(200).json({ ok: true, duplicate });
    } catch (err) {
      logger.error('[checkSlotBookingDuplicate] failed', { err });
      // Fail OPEN: a checker that errors must not block a legitimate booking.
      // The worst case is a duplicate that an admin resolves; the alternative
      // is turning away someone trying to pay.
      res.status(200).json({ ok: true, duplicate: false, degraded: true });
    }
  },
);

/**
 * Create a booking plus its private contact document, atomically.
 *
 * Public — no account is needed to book — but the client can no longer write
 * these documents itself, so the shape is validated here rather than trusted.
 */
export const createSlotBooking = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 30 },
  async (req, res): Promise<void> => {
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

    const b = req.body ?? {};
    const phone = normPhone(b.participantPhone);
    const name = String(b.participantName ?? '').trim();

    if (name.length < 2) { res.status(400).json({ ok: false, error: 'Name is required' }); return; }
    if (phone.length !== 10) { res.status(400).json({ ok: false, error: 'A 10-digit phone is required' }); return; }
    if (!b.centreId || !b.month) { res.status(400).json({ ok: false, error: 'centreId and month are required' }); return; }
    if (!PLAN_TYPES.includes(b.planType)) { res.status(400).json({ ok: false, error: 'Unknown plan' }); return; }

    const ip = req.ip ?? req.header('x-forwarded-for') ?? 'anon';
    if (!checkRateLimit(`slotbook:${phone || ip}`, 10, 10 * 60 * 1000)) {
      res.status(429).json({ ok: false, error: 'Too many requests. Try again shortly.' });
      return;
    }

    try {
      const now = new Date().toISOString();
      const coversMonths: string[] = Array.isArray(b.coversMonths) && b.coversMonths.length
        ? b.coversMonths.map(String)
        : [String(b.month)];

      const ref = db.collection('slotBookings').doc();

      const batch = db.batch();
      batch.set(ref, {
        centreId: String(b.centreId),
        month: String(b.month),
        coversMonths,
        participantName: name,
        // The link that lets a booking become an enrolment, appear on a batch
        // roster, and be reconciled against fees. The /fees flow has always
        // known it; it just wasn't written here.
        studentId: b.studentId ? String(b.studentId) : null,
        planType: b.planType,
        timeSlot: String(b.timeSlot ?? ''),
        selectedDays: Array.isArray(b.selectedDays) ? b.selectedDays : [],
        amountPaise: Number(b.amountPaise) || 0,
        status: 'PENDING_PAYMENT',
        upiTransactionId: null,
        verifiedBy: null,
        verifiedAt: null,
        rejectionReason: null,
        createdAt: now,
        updatedAt: now,
      });
      // Contact goes in the private subcollection, never on the public doc.
      batch.set(ref.collection('private').doc('contact'), {
        participantPhone: phone,
        participantEmail: b.participantEmail ? String(b.participantEmail) : null,
        createdAt: now,
      });
      await batch.commit();

      logger.info('[createSlotBooking] created', { bookingId: ref.id, centreId: b.centreId, month: b.month });
      res.status(201).json({ ok: true, bookingId: ref.id });
    } catch (err) {
      logger.error('[createSlotBooking] failed', { err });
      res.status(500).json({ ok: false, error: 'Could not create the booking' });
    }
  },
);

/**
 * One-off: move contact details out of existing public booking documents.
 *
 * Copies phone/email into the private subcollection and DELETES them from the
 * parent. Without this the fix only protects new bookings and every existing
 * parent's number stays exposed.
 *
 * Idempotent — a booking already migrated is skipped.
 */
export const backfillSlotBookingContacts = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 540 },
  async (req, res): Promise<void> => {
    if (!config.sheets.apiKey || req.header('x-api-key') !== config.sheets.apiKey) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }

    const dryRun = req.body?.dryRun === true;

    try {
      const snap = await db.collection('slotBookings').get();
      let migrated = 0, skipped = 0, alreadyClean = 0;

      for (const doc of snap.docs) {
        const d = doc.data();
        const hasInline = d.participantPhone !== undefined || d.participantEmail !== undefined;
        if (!hasInline) { alreadyClean++; continue; }

        if (dryRun) { migrated++; continue; }

        const contactRef = doc.ref.collection('private').doc('contact');
        const existing = await contactRef.get();

        // Copy first, delete second, in one batch. If this failed halfway the
        // wrong order would lose the number entirely — write the private copy
        // before removing the public one.
        const batch = db.batch();
        if (existing.exists) {
          skipped++;
        } else {
          batch.set(contactRef, {
            participantPhone: normPhone(d.participantPhone),
            participantEmail: d.participantEmail ?? null,
            createdAt: d.createdAt ?? new Date().toISOString(),
            migratedAt: new Date().toISOString(),
          });
        }
        batch.update(doc.ref, {
          participantPhone: FieldValue.delete(),
          participantEmail: FieldValue.delete(),
        });
        await batch.commit();
        migrated++;
      }

      logger.info('[backfillSlotBookingContacts] done', { migrated, skipped, alreadyClean, dryRun });
      res.status(200).json({ ok: true, dryRun, total: snap.size, migrated, skipped, alreadyClean });
    } catch (err: any) {
      logger.error('[backfillSlotBookingContacts] failed', { err });
      res.status(500).json({ ok: false, error: err?.message ?? 'Internal error' });
    }
  },
);
