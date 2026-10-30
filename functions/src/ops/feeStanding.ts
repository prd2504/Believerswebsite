/**
 * Mirrors each student's paid months onto /students/{id}.feeMonths.
 *
 * Coaches build the register but are not allowed to read /payments, so the
 * register had no way to know who has paid. This copies just the months —
 * never amounts — onto the student, where coaches can already read.
 *
 * Kept current two ways: a trigger on every payment write, and a full
 * recompute every night, so a missed trigger or a hand edit heals by morning.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { feeStandingFromPayments, isFeeExemptCentre } from '@bba/shared';

const REGION = 'asia-south1';

type PaymentLike = Parameters<typeof feeStandingFromPayments>[0][number];

function sameMonths(a: unknown, b: string[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((m, i) => m === b[i]);
}

/**
 * Paid months = months covered by payments ∪ months attended at a centre that
 * collects fees itself (Bandra Gymkhana: no entry without paying the gymkhana,
 * so being marked present IS the proof of payment). The attended months are
 * kept separately in feeMonthsAttended so the source of every "paid" is clear
 * and the per-payment trigger can rebuild feeMonths without re-reading attendance.
 */
function standingPatch(payments: PaymentLike[], attendedMonths: readonly string[] = []) {
  const fee = feeStandingFromPayments(payments);
  const months = Array.from(new Set([...fee.months, ...attendedMonths])).sort();
  return {
    feeMonths: months,
    feeCoveredThrough: months.length ? months[months.length - 1] : null,
    feeMonthsAttended: [...attendedMonths].sort(),
  };
}

function unchanged(cur: FirebaseFirestore.DocumentData, patch: ReturnType<typeof standingPatch>): boolean {
  return sameMonths(cur.feeMonths, patch.feeMonths)
    && sameMonths(cur.feeMonthsAttended ?? [], patch.feeMonthsAttended)
    && (cur.feeCoveredThrough ?? null) === patch.feeCoveredThrough;
}

/** studentId → months they were marked present at a fee-exempt centre (last 13 months). */
async function attendedMonthsAtExemptCentres(): Promise<Map<string, string[]>> {
  const [centresSnap, batchesSnap] = await Promise.all([
    db.collection('centres').get(),
    db.collection('batches').get(),
  ]);
  const exemptCentres = new Set(centresSnap.docs
    .filter((d) => isFeeExemptCentre(d.data().centreCode as string))
    .map((d) => d.id));
  const exemptBatches = new Set(batchesSnap.docs
    .filter((d) => exemptCentres.has(d.data().centreId as string))
    .map((d) => d.id));
  const out = new Map<string, Set<string>>();
  if (exemptBatches.size === 0) return new Map();

  const from = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const recSnap = await db.collectionGroup('records').where('sessionDate', '>=', from).get();
  recSnap.docs.forEach((d) => {
    const r = d.data();
    if (!r.studentId || !exemptBatches.has(r.batchId)) return;
    if (r.status !== 'PRESENT' && r.status !== 'LATE') return;
    if (r.attendeeType === 'TRIAL') return;
    const month = String(r.sessionDate ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    if (!out.has(r.studentId)) out.set(r.studentId, new Set());
    out.get(r.studentId)!.add(month);
  });
  return new Map(Array.from(out, ([k, v]) => [k, Array.from(v)]));
}

export async function syncStudentFeeStanding(studentId: string): Promise<boolean> {
  const [paySnap, studentSnap] = await Promise.all([
    db.collection('payments').where('studentId', '==', studentId).get(),
    db.doc(`students/${studentId}`).get(),
  ]);
  if (!studentSnap.exists) return false;
  const cur = studentSnap.data()!;
  const attended = Array.isArray(cur.feeMonthsAttended) ? (cur.feeMonthsAttended as string[]) : [];
  const patch = standingPatch(paySnap.docs.map((d) => d.data() as PaymentLike), attended);
  if (unchanged(cur, patch)) return false;
  await studentSnap.ref.update({ ...patch, feeSyncedAt: new Date().toISOString() });
  return true;
}

/** Recompute every student. Returns how many changed. */
export async function syncAllFeeStanding(): Promise<{ students: number; changed: number }> {
  const [studentsSnap, paySnap, attendedByStudent] = await Promise.all([
    db.collection('students').get(),
    db.collection('payments').get(),
    attendedMonthsAtExemptCentres(),
  ]);
  const byStudent = new Map<string, PaymentLike[]>();
  paySnap.docs.forEach((d) => {
    const p = d.data();
    const sid = p.studentId as string | undefined;
    if (!sid) return;
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid)!.push(p as PaymentLike);
  });

  const writer = db.bulkWriter();
  const now = new Date().toISOString();
  let changed = 0;
  studentsSnap.docs.forEach((d) => {
    const cur = d.data();
    const patch = standingPatch(byStudent.get(d.id) ?? [], attendedByStudent.get(d.id) ?? []);
    if (unchanged(cur, patch)) return;
    changed++;
    writer.update(d.ref, { ...patch, feeSyncedAt: now });
  });
  await writer.close();
  logger.info('[feeStanding] full sync', { students: studentsSnap.size, changed });
  return { students: studentsSnap.size, changed };
}

export const onPaymentFeeStanding = onDocumentWritten(
  { document: 'payments/{paymentId}', region: REGION },
  async (event) => {
    const ids = new Set<string>();
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (before?.studentId) ids.add(before.studentId as string);
    if (after?.studentId) ids.add(after.studentId as string);
    for (const id of ids) {
      try {
        await syncStudentFeeStanding(id);
      } catch (err) {
        logger.error('[feeStanding] sync failed', { studentId: id, err });
      }
    }
  },
);
