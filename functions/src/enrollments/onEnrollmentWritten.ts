/**
 * Keep `batches.currentEnrolment` and `batches.studentIds` truthful.
 *
 * These two fields are denormalised for dashboard speed — they let the batches
 * grid render without a separate query per card — but every code path that
 * mutated them individually was a chance to drift. Compounded over a year:
 *
 *  - `onFeePaymentCreated` incremented on every fee payment whose enrollment
 *    was not already ACTIVE. A student who ends and later re-enrols therefore
 *    added +1 each time, but arrayUnion is idempotent so `studentIds` didn't
 *    grow — the two fields disagreed forever after.
 *  - `deleteStudent` doesn't cascade, so deleting a student without ending
 *    their enrollments first left their row in `studentIds` (and their +1 in
 *    the counter) permanently.
 *  - Direct Firestore edits, imports and one-off scripts never bumped either.
 *
 * The fix is to stop trusting the increments and recompute from source. Every
 * write to /enrollments/{id} — create, update, delete — refires this, which
 * re-queries the ACTIVE enrollments in the affected batch and sets both
 * fields to the actual answer. Drift is now bounded to whatever the query
 * saw, and the backfill endpoint below (backfillBatchCounters) cleans up
 * whatever the history left behind.
 *
 * ── Concurrency ──
 * Two enrollments landing in the same batch in the same second could both
 * recompute against a snapshot missing the other's write, and the loser's
 * SET could overwrite the winner's. That is a small window in real usage
 * (enrollments are minutes apart, not milliseconds), and the next enrollment
 * write self-heals it. Anything that outlives that is fixable by the
 * backfill.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';

const REGION = 'asia-south1';

/**
 * Recompute the two counters on a single batch from the ACTIVE enrollments
 * that name it. Returns the count for logging.
 */
export async function recomputeBatchCounters(batchId: string): Promise<number> {
  const [enrollments, batchSnap] = await Promise.all([
    db.collection('enrollments')
      .where('batchId', '==', batchId)
      .where('status', '==', 'ACTIVE')
      .get(),
    db.collection('batches').doc(batchId).get(),
  ]);

  if (!batchSnap.exists) return 0;

  const studentIds = Array.from(new Set(
    enrollments.docs.map((d) => String(d.data().studentId ?? '')).filter(Boolean),
  )).sort();

  const before = batchSnap.data() ?? {};
  const beforeCount = Number(before.currentEnrolment ?? 0);
  const beforeIds: string[] = Array.isArray(before.studentIds) ? [...before.studentIds].sort() : [];

  // Guard against a needless write — the trigger fires on every enrollment
  // write, and most of them don't change the count (e.g. a note edit). Extra
  // writes cost money and would also refire any downstream batch trigger if
  // we ever add one.
  const sameCount = beforeCount === studentIds.length;
  const sameIds = beforeIds.length === studentIds.length
    && beforeIds.every((id, i) => id === studentIds[i]);
  if (sameCount && sameIds) return studentIds.length;

  await batchSnap.ref.update({
    currentEnrolment: studentIds.length,
    studentIds,
    updatedAt: new Date().toISOString(),
    updatedBy: 'recomputeBatchCounters',
  });
  return studentIds.length;
}

export const onEnrollmentWritten = onDocumentWritten(
  { document: 'enrollments/{enrollmentId}', region: REGION, timeoutSeconds: 60 },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;

    // Recompute both the previous batch (in case a student moved batches) and
    // the current one — otherwise a batch change would leave the old batch's
    // counter permanently stale.
    const affected = new Set<string>();
    if (before?.batchId) affected.add(String(before.batchId));
    if (after?.batchId) affected.add(String(after.batchId));
    if (affected.size === 0) return;

    for (const batchId of affected) {
      try {
        const count = await recomputeBatchCounters(batchId);
        logger.info('[onEnrollmentWritten] recomputed', { batchId, count });
      } catch (err) {
        // Never throw: the source of truth (the enrollment) is already correct,
        // and a retry loop against a batch whose read is failing helps no one.
        logger.error('[onEnrollmentWritten] recompute failed', { batchId, err });
      }
    }
  },
);
