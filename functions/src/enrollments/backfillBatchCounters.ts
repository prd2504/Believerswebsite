/**
 * One-shot recompute of `currentEnrolment` and `studentIds` on every batch.
 *
 * The onEnrollmentWritten trigger keeps things straight from now on. This is
 * what cleans up the history — the batches whose counters drifted before the
 * trigger existed. Safe to re-run; a batch already correct is skipped.
 *
 * Auth is the same shared key /admin uses for the other maintenance
 * endpoints. There is nothing sensitive in the response but there is real
 * work being done, so it isn't open to the world.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { config } from '../config.js';
import { recomputeBatchCounters } from './onEnrollmentWritten.js';

const REGION = 'asia-south1';

export const backfillBatchCounters = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 540 },
  async (req, res): Promise<void> => {
    if (!config.sheets.apiKey || req.header('x-api-key') !== config.sheets.apiKey) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }
    const dryRun = String(req.query.dryRun ?? '') === '1';

    try {
      const snap = await db.collection('batches').get();
      const changed: Array<{ id: string; name: string; was: number; now: number }> = [];
      let unchanged = 0;

      for (const doc of snap.docs) {
        const before = Number(doc.data().currentEnrolment ?? 0);
        const active = await db.collection('enrollments')
          .where('batchId', '==', doc.id)
          .where('status', '==', 'ACTIVE')
          .get();
        const truth = new Set(active.docs.map((d) => String(d.data().studentId ?? '')).filter(Boolean)).size;

        if (truth === before) { unchanged++; continue; }
        changed.push({ id: doc.id, name: String(doc.data().name ?? ''), was: before, now: truth });
        if (!dryRun) await recomputeBatchCounters(doc.id);
      }

      logger.info('[backfillBatchCounters] done', { dryRun, changed: changed.length, unchanged });
      res.status(200).json({ ok: true, dryRun, changed, unchanged, total: snap.size });
    } catch (err: any) {
      logger.error('[backfillBatchCounters] failed', { err });
      res.status(500).json({ ok: false, error: err?.message ?? 'Internal error' });
    }
  },
);
