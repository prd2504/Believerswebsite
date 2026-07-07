import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { canonicalPhone, normalizeName } from './phone.js';

/**
 * Read-only cleanup aid. Groups students by centre + canonical phone and reports
 * clusters with more than one student, so duplicates created before the identity
 * fix can be reviewed and merged by hand.
 *
 * It deliberately does NOT delete or merge anything: siblings legitimately share
 * a parent's phone, so only a human can tell "same kid, two spellings" (merge)
 * from "two different kids" (keep both). The `likelyDuplicate` flag is a hint,
 * not an instruction.
 *
 *   GET /findDuplicateStudents            → all centres
 *   GET /findDuplicateStudents?centreCode=RBI
 */
export const findDuplicateStudents = onRequest(
  { region: 'asia-south1', cors: true, timeoutSeconds: 120 },
  async (req, res): Promise<void> => {
    try {
      const centreCodeFilter = (req.query.centreCode as string | undefined)?.trim().toUpperCase();

      const centresSnap = await db.collection('centres').get();
      const centreById = new Map<string, { code: string; name: string }>();
      centresSnap.docs.forEach((d) => {
        const data = d.data();
        centreById.set(d.id, { code: data.centreCode ?? '', name: data.name ?? d.id });
      });

      const studentsSnap = await db.collection('students').get();

      // Count payments per student so the reviewer can keep the record with history.
      const paymentsSnap = await db.collection('payments').get();
      const payCount = new Map<string, number>();
      paymentsSnap.docs.forEach((d) => {
        const sid = d.data().studentId as string | undefined;
        if (sid) payCount.set(sid, (payCount.get(sid) ?? 0) + 1);
      });

      // group by `${centreId}|${canonicalPhone}`
      const groups = new Map<string, any[]>();
      studentsSnap.docs.forEach((d) => {
        const s = d.data();
        const centreId = s.primaryCentreId as string | undefined;
        if (!centreId) return;
        const centre = centreById.get(centreId);
        if (!centre) return;
        if (centreCodeFilter && centre.code?.toUpperCase() !== centreCodeFilter) return;

        const phone = canonicalPhone(s.phone);
        if (!phone) return; // can't cluster students with no phone
        const key = `${centreId}|${phone}`;
        const entry = {
          studentId: d.id,
          name: s.name ?? '',
          externalStudentId: s.externalStudentId ?? null,
          phone,
          status: s.status ?? null,
          createdBy: s.createdBy ?? null,
          createdAt: s.createdAt ?? null,
          payments: payCount.get(d.id) ?? 0,
          centreCode: centre.code,
          centreName: centre.name,
        };
        const arr = groups.get(key) ?? [];
        arr.push(entry);
        groups.set(key, arr);
      });

      const clusters = [...groups.values()]
        .filter((arr) => arr.length > 1)
        .map((arr) => {
          const names = new Set(arr.map((e) => normalizeName(e.name)));
          // One normalized name across the cluster → almost certainly the same
          // person registered twice. Multiple names → probably siblings.
          const likelyDuplicate = names.size === 1;
          return {
            centreCode: arr[0].centreCode,
            centreName: arr[0].centreName,
            phone: arr[0].phone,
            likelyDuplicate,
            count: arr.length,
            students: arr.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
          };
        })
        .sort((a, b) => Number(b.likelyDuplicate) - Number(a.likelyDuplicate) || b.count - a.count);

      logger.info('[findDuplicateStudents] scan complete', {
        clusters: clusters.length,
        likelyDuplicates: clusters.filter((c) => c.likelyDuplicate).length,
      });

      res.status(200).json({
        ok: true,
        totalStudents: studentsSnap.size,
        clusters,
        summary: {
          clustersSharingPhone: clusters.length,
          likelyDuplicateClusters: clusters.filter((c) => c.likelyDuplicate).length,
          likelySiblingClusters: clusters.filter((c) => !c.likelyDuplicate).length,
        },
      });
    } catch (err: any) {
      logger.error('[findDuplicateStudents] error', { error: err?.message });
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  },
);
