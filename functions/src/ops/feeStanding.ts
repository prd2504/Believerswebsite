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
import { feeStandingFromPayments } from '@bba/shared';

const REGION = 'asia-south1';

type PaymentLike = Parameters<typeof feeStandingFromPayments>[0][number];

function sameMonths(a: unknown, b: string[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((m, i) => m === b[i]);
}

function standingPatch(payments: PaymentLike[]) {
  const fee = feeStandingFromPayments(payments);
  return { feeMonths: fee.months, feeCoveredThrough: fee.coveredThrough };
}

export async function syncStudentFeeStanding(studentId: string): Promise<boolean> {
  const [paySnap, studentSnap] = await Promise.all([
    db.collection('payments').where('studentId', '==', studentId).get(),
    db.doc(`students/${studentId}`).get(),
  ]);
  if (!studentSnap.exists) return false;
  const patch = standingPatch(paySnap.docs.map((d) => d.data() as PaymentLike));
  const cur = studentSnap.data()!;
  if (sameMonths(cur.feeMonths, patch.feeMonths) && (cur.feeCoveredThrough ?? null) === patch.feeCoveredThrough) {
    return false;
  }
  await studentSnap.ref.update({ ...patch, feeSyncedAt: new Date().toISOString() });
  return true;
}

/** Recompute every student. Returns how many changed. */
export async function syncAllFeeStanding(): Promise<{ students: number; changed: number }> {
  const [studentsSnap, paySnap] = await Promise.all([
    db.collection('students').get(),
    db.collection('payments').get(),
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
    const patch = standingPatch(byStudent.get(d.id) ?? []);
    if (sameMonths(cur.feeMonths, patch.feeMonths) && (cur.feeCoveredThrough ?? null) === patch.feeCoveredThrough) return;
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
