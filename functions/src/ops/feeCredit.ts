/**
 * Carry a paid month forward for everyone at a centre — e.g. Ruia's courts
 * closed for most of October, so October's fee covers November instead of
 * charging again.
 *
 * For every PAID payment at the centre whose coverage includes `month`, the
 * coverage end moves `extraMonths` later. For each of those students, their
 * live Ruia slot booking gets the same extra month(s), so their seat is held
 * and they stay on the roster. Everything downstream (register, fee status,
 * gate pass, duplicate-charge check on /fees) reads coverage, so it all
 * follows without special cases.
 *
 * Preview by default (apply: false). Idempotent: each credit is stamped in
 * `creditsApplied`, so running it twice changes nothing the second time.
 * No new payments are created, so no invoices are emailed and revenue is
 * unchanged. Refunded payments are skipped.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../admin.js';
import { requireAdminLike } from '../http/requireAdmin.js';
import {
  addMonths,
  paymentCoverage,
  paymentCoversMonth,
  RUIA_CENTRE_CODE,
  RUIA_SLOT_BOOKING_CENTRE_ID,
} from '@bba/shared';

const REGION = 'asia-south1';
const LIVE_BOOKING = new Set(['CONFIRMED', 'PENDING_VERIFICATION']);

export interface FeeCreditResult {
  key: string;
  applied: boolean;
  payments: { id: string; student: string; from: string; to: string }[];
  bookings: { id: string; participant: string; covers: string[] }[];
  /** Live bookings we could not tie to a credited payment — check by hand. */
  bookingsNeedingCheck: { id: string; participant: string; reason: string }[];
  alreadyCredited: number;
  /**
   * Credited students who ALSO paid or booked separately for the credited
   * month(s) — e.g. paid for November after slots went live. They'd be paying
   * twice: refund, or carry that payment on a month.
   */
  paidTwice: { student: string; detail: string }[];
}

export async function runFeeCredit(opts: {
  centreCode: string; month: string; extraMonths: number; reason: string; apply: boolean;
}): Promise<FeeCreditResult> {
  const { centreCode, month, extraMonths, reason, apply } = opts;
  const key = `${centreCode}:${month}:+${extraMonths}`;

  const centreSnap = await db.collection('centres').where('centreCode', '==', centreCode).limit(1).get();
  if (centreSnap.empty) throw new Error(`No centre with code ${centreCode}`);
  const centreId = centreSnap.docs[0].id;

  const [paySnap, studentsSnap] = await Promise.all([
    db.collection('payments').where('centreId', '==', centreId).get(),
    db.collection('students').where('primaryCentreId', '==', centreId).get(),
  ]);
  const nameOf = new Map(studentsSnap.docs.map((d) => [d.id, (d.data().name as string) ?? d.id]));

  const out: FeeCreditResult = { key, applied: apply, payments: [], bookings: [], bookingsNeedingCheck: [], alreadyCredited: 0, paidTwice: [] };
  const creditedStudents = new Set<string>();
  const writer = apply ? db.bulkWriter() : null;
  const now = new Date().toISOString();

  paySnap.docs.forEach((d) => {
    const p = d.data();
    if (p.status !== 'PAID') return;
    const pay = { month: p.month as string, coverageMonths: p.coverageMonths as number | null, coverageEndMonth: p.coverageEndMonth as string | null };
    if (!paymentCoversMonth(pay, month)) return;
    if (Array.isArray(p.creditsApplied) && p.creditsApplied.includes(key)) {
      out.alreadyCredited++;
      creditedStudents.add(p.studentId);
      return;
    }
    const cov = paymentCoverage(pay);
    const newEnd = addMonths(cov.end, extraMonths);
    creditedStudents.add(p.studentId);
    out.payments.push({ id: d.id, student: nameOf.get(p.studentId) ?? p.studentId, from: cov.end, to: newEnd });
    writer?.update(d.ref, {
      coverageMonths: cov.months + extraMonths,
      coverageEndMonth: newEnd,
      creditsApplied: FieldValue.arrayUnion(key),
      coverageCreditNote: reason,
      updatedAt: now,
      updatedBy: 'feeCredit',
    });
  });

  // Ruia's seats live on slot bookings; extend the same people's bookings.
  if (centreCode === RUIA_CENTRE_CODE) {
    const bookSnap = await db.collection('slotBookings').where('centreId', '==', RUIA_SLOT_BOOKING_CENTRE_ID).get();
    bookSnap.docs.forEach((d) => {
      const b = d.data();
      if (!LIVE_BOOKING.has(String(b.status ?? ''))) return;
      const covers: string[] = Array.isArray(b.coversMonths) && b.coversMonths.length ? [...b.coversMonths] : [String(b.month)];
      if (!covers.includes(month)) return;
      if (Array.isArray(b.creditsApplied) && b.creditsApplied.includes(key)) return;
      const participant = (b.participantName as string) ?? d.id;
      if (!b.studentId) {
        out.bookingsNeedingCheck.push({ id: d.id, participant, reason: 'booking is not linked to a student record' });
        return;
      }
      if (!creditedStudents.has(b.studentId)) {
        out.bookingsNeedingCheck.push({ id: d.id, participant, reason: `no paid ${month} fee on record (refunded, or paid outside the app)` });
        return;
      }
      const sorted = covers.sort();
      const extra = Array.from({ length: extraMonths }, (_, i) => addMonths(sorted[sorted.length - 1], i + 1));
      const next = Array.from(new Set([...sorted, ...extra])).sort();
      out.bookings.push({ id: d.id, participant, covers: next });
      writer?.update(d.ref, {
        coversMonths: next,
        creditsApplied: FieldValue.arrayUnion(key),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }

  // Anyone credited who also paid / booked separately for the credited months.
  const creditMonths = Array.from({ length: extraMonths }, (_, i) => addMonths(month, i + 1));
  const creditedPaymentIds = new Set(out.payments.map((p) => p.id));
  paySnap.docs.forEach((d) => {
    const p = d.data();
    if (p.status !== 'PAID' || !creditedStudents.has(p.studentId) || creditedPaymentIds.has(d.id)) return;
    const pay = { month: p.month as string, coverageMonths: p.coverageMonths as number | null, coverageEndMonth: p.coverageEndMonth as string | null };
    if (paymentCoversMonth(pay, month)) return; // the credited payment itself
    const clash = creditMonths.filter((m) => paymentCoversMonth(pay, m));
    if (clash.length) {
      out.paidTwice.push({ student: nameOf.get(p.studentId) ?? p.studentId, detail: `separate payment ${p.externalInvoiceNo ?? d.id} also covers ${clash.join(', ')}` });
    }
  });
  if (centreCode === RUIA_CENTRE_CODE) {
    const bookSnap = await db.collection('slotBookings').where('centreId', '==', RUIA_SLOT_BOOKING_CENTRE_ID).get();
    bookSnap.docs.forEach((d) => {
      const b = d.data();
      if (!LIVE_BOOKING.has(String(b.status ?? '')) || !b.studentId || !creditedStudents.has(b.studentId)) return;
      if (creditMonths.includes(String(b.month))) {
        out.paidTwice.push({ student: (b.participantName as string) ?? b.studentId, detail: `also has a separate ${b.month} slot booking (${d.id})` });
      }
    });
  }

  if (writer) await writer.close();
  logger.info('[feeCredit]', { key, apply, payments: out.payments.length, bookings: out.bookings.length, check: out.bookingsNeedingCheck.length });
  return out;
}

/**
 * POST { centreCode: 'RUI', month: '2026-10', extraMonths?: 1, reason?: string, apply?: boolean }
 * Without apply: true it only reports what it would change.
 */
export const applyFeeCredit = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 300 },
  async (req, res): Promise<void> => {
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
    if (!(await requireAdminLike(req, res, { superAdminOnly: true }))) return;
    const centreCode = String(req.body?.centreCode ?? '');
    const month = String(req.body?.month ?? '');
    const extraMonths = Number(req.body?.extraMonths ?? 1);
    if (!centreCode || !/^\d{4}-\d{2}$/.test(month) || !(extraMonths >= 1 && extraMonths <= 3)) {
      res.status(400).json({ ok: false, error: 'centreCode, month (YYYY-MM) and extraMonths 1–3 are required' });
      return;
    }
    try {
      const out = await runFeeCredit({
        centreCode, month, extraMonths,
        reason: String(req.body?.reason ?? `Centre closed — ${month} fee carried forward ${extraMonths} month(s)`),
        apply: req.body?.apply === true,
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      logger.error('[applyFeeCredit] failed', { err });
      res.status(500).json({ ok: false, error: (err as Error)?.message ?? 'Internal error' });
    }
  },
);
