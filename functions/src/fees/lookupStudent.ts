import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { lookupStudentSchema } from './validation.js';
import { checkRateLimit } from './rateLimiter.js';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

export const lookupStudent = onRequest(
  {
    region: 'asia-south1',
    cors: true,
    timeoutSeconds: 30,
  },
  async (req, res): Promise<void> => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const parsed = lookupStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const { centreCode, phone } = parsed.data;
    const normPhone = normalizePhone(phone);

    if (!checkRateLimit(`lookup:${normPhone}`, 10, 5 * 60 * 1000)) {
      res.status(429).json({ ok: false, error: 'Too many requests. Try again in a few minutes.' });
      return;
    }

    try {
      // Look up centre
      const centreSnap = await db.collection('centres')
        .where('centreCode', '==', centreCode)
        .where('active', '==', true)
        .limit(1)
        .get();

      if (centreSnap.empty) {
        res.status(404).json({ ok: false, error: `Centre "${centreCode}" not found` });
        return;
      }

      const centreId = centreSnap.docs[0].id;

      // Find students by phone in this centre
      const studentsSnap = await db.collection('students')
        .where('primaryCentreId', '==', centreId)
        .get();

      const matches = studentsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s: any) => {
          if (!s.phone) return false;
          return normalizePhone(s.phone) === normPhone;
        })
        .filter((s: any) => s.status === 'ACTIVE' || s.status === 'ON_HOLD');

      if (matches.length === 0) {
        res.status(404).json({ ok: false, error: 'No student found with this phone number at this centre' });
        return;
      }

      // Enrich with enrollment data (batch name + fee)
      const results = await Promise.all(
        matches.map(async (s: any) => {
          const enrollSnap = await db.collection('enrollments')
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
            externalStudentId: s.externalStudentId ?? null,
            batchName,
            monthlyFeeRupees,
            daysPerWeek,
          };
        }),
      );

      logger.info('[lookupStudent] found', { centreCode, count: results.length });

      res.status(200).json({ ok: true, students: results });
    } catch (err) {
      logger.error('[lookupStudent] error', { err });
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  },
);
