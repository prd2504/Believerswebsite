import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';

/**
 * Temporary data-integrity audit endpoint. Scans the students collection and
 * reports completeness per centre (phone population, externalStudentId, phone
 * format, active enrollment). Read-only. Remove once the audit is complete.
 *
 *   GET /auditStudents
 */

function phoneFormat(raw: string): '10digits' | '+91prefix' | '12digits' | 'other' {
  const trimmed = raw.trim();
  if (/^\+91\d{10}$/.test(trimmed)) return '+91prefix';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return '10digits';
  if (digits.length === 12 && digits.startsWith('91')) return '12digits';
  return 'other';
}

interface CentreStat {
  centreId: string;
  centreCode: string | null;
  total: number;
  active: number;
  onHold: number;
  dormant: number;
  other: number;
  phonePopulated: number;
  phoneMissing: number;
  phoneFormats: Record<string, number>;
  externalStudentIdPopulated: number;
  externalStudentIdMissing: number;
  hasActiveEnrollment: number;
  missingEnrollment: number;
}

export const auditStudents = onRequest(
  {
    region: 'asia-south1',
    cors: true,
    timeoutSeconds: 120,
  },
  async (req, res): Promise<void> => {
    try {
      // --- Load centres (map id -> code) ---
      const centresSnap = await db.collection('centres').get();
      const centreById = new Map<string, { code: string | null }>();
      for (const d of centresSnap.docs) {
        centreById.set(d.id, { code: d.data().centreCode ?? null });
      }

      // --- Load all students ---
      const studentsSnap = await db.collection('students').get();

      // --- Load all active enrollments (one scan, build a Set of studentIds) ---
      const enrollSnap = await db
        .collection('enrollments')
        .where('status', '==', 'ACTIVE')
        .get();
      const studentsWithActiveEnrollment = new Set<string>();
      for (const d of enrollSnap.docs) {
        const sid = d.data().studentId;
        if (sid) studentsWithActiveEnrollment.add(sid);
      }

      const byCentre: Record<string, CentreStat> = {};
      let studentsWithoutCentre = 0;
      let totalStudents = 0;

      function statFor(centreId: string): CentreStat {
        const code = centreById.get(centreId)?.code ?? null;
        const key = code ?? `NOCODE:${centreId}`;
        if (!byCentre[key]) {
          byCentre[key] = {
            centreId,
            centreCode: code,
            total: 0,
            active: 0,
            onHold: 0,
            dormant: 0,
            other: 0,
            phonePopulated: 0,
            phoneMissing: 0,
            phoneFormats: {},
            externalStudentIdPopulated: 0,
            externalStudentIdMissing: 0,
            hasActiveEnrollment: 0,
            missingEnrollment: 0,
          };
        }
        return byCentre[key];
      }

      for (const doc of studentsSnap.docs) {
        const s = doc.data();
        totalStudents += 1;

        const centreId: string | undefined = s.primaryCentreId;
        if (!centreId || !centreById.has(centreId)) {
          studentsWithoutCentre += 1;
          if (!centreId) continue;
        }

        const stat = statFor(centreId);
        stat.total += 1;

        // Status breakdown
        switch (s.status) {
          case 'ACTIVE': stat.active += 1; break;
          case 'ON_HOLD': stat.onHold += 1; break;
          case 'DORMANT': stat.dormant += 1; break;
          default: stat.other += 1; break;
        }

        // Phone
        const phone: string | null = s.phone ?? null;
        if (phone && String(phone).trim()) {
          stat.phonePopulated += 1;
          const fmt = phoneFormat(String(phone));
          stat.phoneFormats[fmt] = (stat.phoneFormats[fmt] ?? 0) + 1;
        } else {
          stat.phoneMissing += 1;
        }

        // externalStudentId
        if (s.externalStudentId && String(s.externalStudentId).trim()) {
          stat.externalStudentIdPopulated += 1;
        } else {
          stat.externalStudentIdMissing += 1;
        }

        // Active enrollment
        if (studentsWithActiveEnrollment.has(doc.id)) {
          stat.hasActiveEnrollment += 1;
        } else {
          stat.missingEnrollment += 1;
        }
      }

      logger.info('[auditStudents] complete', { totalStudents, centres: Object.keys(byCentre).length });

      res.status(200).json({
        ok: true,
        totalStudents,
        studentsWithoutCentre,
        centreCount: centresSnap.size,
        activeEnrollmentCount: enrollSnap.size,
        byCentre,
      });
    } catch (err) {
      logger.error('[auditStudents] error', { err });
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  },
);
