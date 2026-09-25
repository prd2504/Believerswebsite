import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { autoEnrollIfMissing } from './onFeePaymentCreated.js';

/**
 * One-time backfill for students who self-registered via /fees BEFORE
 * autoEnrollIfMissing existed (see onFeePaymentCreated.ts) — real, paying
 * students who are still invisible on Roster/attendance because they have no
 * batch enrollment. Reuses the exact same auto-enrol logic a live payment
 * would trigger, so the outcome is identical to what these students should
 * have gotten in the first place.
 *
 * The list is hardcoded (not a generic scan) because we already know exactly
 * who needs this from today's identity cleanup — each one's daysPerWeek
 * pulled from their original June Player_Directory batch label:
 *   Imara Sharma (DAD-016) 3-day · Tanishq Kambli (DAD-018) 2-day ·
 *   Sia shetty (DAD-023) 3-day · Purva Modi (RBI-013) 3-day ·
 *   Ashvath (RBI-029) 3-day
 *
 * Token-gated, dry-run by default (execute=true to apply). Safe to re-run —
 * autoEnrollIfMissing itself no-ops if an active enrollment already exists.
 *
 *   GET /backfillEnrollments?token=…                → dry run
 *   GET /backfillEnrollments?token=…&execute=true    → apply
 */

const TARGETS: { studentId: string; centreCode: string; daysPerWeek: number; name: string }[] = [
  { studentId: 'mhLK0P8hop86emxa3e4K', centreCode: 'DAD', daysPerWeek: 3, name: 'Imara Sharma' },
  { studentId: 'nDhcaFarPB4QPKdbND2F', centreCode: 'DAD', daysPerWeek: 2, name: 'Tanishq Kambli' },
  { studentId: 'mkAOsKEw7Vm6fUHPIJIx', centreCode: 'DAD', daysPerWeek: 3, name: 'Sia shetty' },
  { studentId: 'LeiUdnkqqYj17xIpIciz', centreCode: 'RBI', daysPerWeek: 3, name: 'Purva Modi' },
  { studentId: 'AR3fQ9WkRvUqnIeupqx1', centreCode: 'RBI', daysPerWeek: 3, name: 'Ashvath' },
];

export const backfillEnrollments = onRequest(
  { region: 'asia-south1', cors: true, timeoutSeconds: 120 },
  async (req, res): Promise<void> => {
    const secret = process.env.CLEANUP_TOKEN;
    if (!secret) { res.status(403).json({ ok: false, error: 'Disabled: CLEANUP_TOKEN is not set.' }); return; }
    const token = (req.query.token as string | undefined) ?? req.header('x-cleanup-token');
    if (token !== secret) { res.status(401).json({ ok: false, error: 'Invalid token' }); return; }

    const execute = req.query.execute === 'true';

    try {
      const centresSnap = await db.collection('centres').get();
      const centreIdByCode = new Map<string, string>();
      centresSnap.docs.forEach((d) => {
        const code = (d.data().centreCode ?? '').toUpperCase();
        if (code) centreIdByCode.set(code, d.id);
      });

      const results: any[] = [];
      for (const t of TARGETS) {
        const centreId = centreIdByCode.get(t.centreCode);
        if (!centreId) { results.push({ ...t, ok: false, reason: `centre ${t.centreCode} not found` }); continue; }

        if (!execute) {
          // Dry run: report the student's current state without writing.
          const studentSnap = await db.doc(`students/${t.studentId}`).get();
          const batchIds = (studentSnap.data()?.batchIds as string[]) ?? [];
          results.push({
            ...t, ok: true, dryRun: true,
            alreadyEnrolled: batchIds.length > 0,
            note: batchIds.length > 0 ? 'already has a batch — will no-op' : 'will attempt auto-enrol on execute',
          });
          continue;
        }

        try {
          const enrolled = await autoEnrollIfMissing(t.studentId, centreId, t.daysPerWeek);
          results.push({ ...t, ok: true, dryRun: false, enrolled });
        } catch (e: any) {
          results.push({ ...t, ok: false, error: e?.message });
        }
      }

      logger.info('[backfillEnrollments] done', { execute, results });
      res.status(200).json({
        ok: true, dryRun: !execute, results,
        note: execute ? 'Applied — check each result.enrolled for the batch it landed in.' : 'Dry run — add &execute=true to apply.',
      });
    } catch (err: any) {
      logger.error('[backfillEnrollments] error', { error: err?.message });
      res.status(500).json({ ok: false, error: err?.message ?? 'Internal server error' });
    }
  },
);
