import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { searchStudentsSchema } from './validation.js';
import { checkRateLimit } from './rateLimiter.js';

/**
 * Returns all ACTIVE / ON_HOLD students for a centre so the /fees page can do
 * client-side name autocomplete. Phone numbers are masked. Enriched with batch
 * name + monthly fee from the active enrollment.
 *
 *   GET /searchStudents?centreCode=DAD
 */

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = String(phone).replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (local.length < 6) return '—';
  return `${local.slice(0, 2)}****${local.slice(-4)}`;
}

export const searchStudents = onRequest(
  {
    region: 'asia-south1',
    cors: true,
    timeoutSeconds: 30,
  },
  async (req, res): Promise<void> => {
    const centreCode = req.query.centreCode ?? req.body?.centreCode;
    const parsed = searchStudentsSchema.safeParse({ centreCode });
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const ip = req.ip ?? req.header('x-forwarded-for') ?? 'anon';
    if (!checkRateLimit(`search:${ip}`, 30, 5 * 60 * 1000)) {
      res.status(429).json({ ok: false, error: 'Too many requests. Try again in a few minutes.' });
      return;
    }

    try {
      const centreSnap = await db
        .collection('centres')
        .where('centreCode', '==', parsed.data.centreCode)
        .where('active', '==', true)
        .limit(1)
        .get();

      if (centreSnap.empty) {
        res.status(404).json({ ok: false, error: `Centre "${parsed.data.centreCode}" not found` });
        return;
      }

      const centreId = centreSnap.docs[0].id;

      const studentsSnap = await db
        .collection('students')
        .where('primaryCentreId', '==', centreId)
        .get();

      const matches = studentsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s: any) => s.status === 'ACTIVE' || s.status === 'ON_HOLD');

      const results = await Promise.all(
        matches.map(async (s: any) => {
          const enrollSnap = await db
            .collection('enrollments')
            .where('studentId', '==', s.id)
            .where('status', '==', 'ACTIVE')
            .limit(1)
            .get();

          let batchName = '';
          let monthlyFeeRupees = 0;
          let daysPerWeek = 0;

          if (!enrollSnap.empty) {
            const enroll = enrollSnap.docs[0].data();
            monthlyFeeRupees = Math.round((enroll.monthlyFeePaise ?? 0) / 100);
            daysPerWeek = enroll.daysPerWeek ?? 0;

            const batchDoc = await db.collection('batches').doc(enroll.batchId).get();
            if (batchDoc.exists) {
              batchName = batchDoc.data()?.name ?? '';
            }
          }

          return {
            studentId: s.id,
            name: s.name,
            maskedPhone: maskPhone(s.phone),
            externalStudentId: s.externalStudentId ?? null,
            batchName,
            monthlyFeeRupees,
            daysPerWeek,
          };
        }),
      );

      // Sort by name for a stable, predictable list.
      results.sort((a, b) => a.name.localeCompare(b.name));

      logger.info('[searchStudents] returned', { centreCode: parsed.data.centreCode, count: results.length });

      res.set('Cache-Control', 'private, max-age=60');
      res.status(200).json({ ok: true, students: results });
    } catch (err) {
      logger.error('[searchStudents] error', { err });
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  },
);
