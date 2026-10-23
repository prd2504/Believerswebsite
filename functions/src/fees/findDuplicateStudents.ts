import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { canonicalPhone, normalizeName } from './phone.js';

/** Levenshtein edit distance — used to tell a spelling-variant duplicate
 * ("Shinjini" vs "Shinijini", distance 1) from a genuine sibling (entirely
 * different first name, large distance) within a shared-phone cluster. */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1]
        ? diag
        : 1 + Math.min(prev[j], prev[j - 1], diag);
      diag = tmp;
    }
  }
  return prev[n];
}

/** Two names are "near" (likely the same person mis-spelled) when their edit
 * distance is tiny in absolute and relative terms. Siblings fail both tests. */
function namesAreNear(a: string, b: string): boolean {
  const d = editDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return d <= 2 || (d <= 4 && d / maxLen <= 0.25);
}

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
          // Find pairs whose names are near-identical — those are the real
          // "same kid, different spelling" duplicates. Distinct names on a
          // shared phone are siblings and are left alone.
          const suspectedDuplicatePairs: any[] = [];
          for (let i = 0; i < arr.length; i++) {
            for (let j = i + 1; j < arr.length; j++) {
              const na = normalizeName(arr[i].name);
              const nb = normalizeName(arr[j].name);
              if (namesAreNear(na, nb)) {
                // Recommend keeping the record that carries payment history /
                // an external ID; the other is the merge/delete candidate.
                const [keep, dup] = [arr[i], arr[j]].sort(
                  (x, y) => (y.payments - x.payments) || (Number(!!y.externalStudentId) - Number(!!x.externalStudentId)),
                );
                suspectedDuplicatePairs.push({
                  keep: { studentId: keep.studentId, name: keep.name, externalStudentId: keep.externalStudentId, payments: keep.payments },
                  duplicate: { studentId: dup.studentId, name: dup.name, externalStudentId: dup.externalStudentId, payments: dup.payments },
                  editDistance: editDistance(na, nb),
                });
              }
            }
          }
          return {
            centreCode: arr[0].centreCode,
            centreName: arr[0].centreName,
            phone: arr[0].phone,
            likelyDuplicate: suspectedDuplicatePairs.length > 0,
            suspectedDuplicatePairs,
            count: arr.length,
            students: arr.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
          };
        })
        .sort((a, b) => Number(b.likelyDuplicate) - Number(a.likelyDuplicate) || b.count - a.count);

      logger.info('[findDuplicateStudents] scan complete', {
        clusters: clusters.length,
        likelyDuplicates: clusters.filter((c) => c.likelyDuplicate).length,
      });

      // ── Second pass: same near-identical name at the same centre, but a
      // DIFFERENT phone number entirely (e.g. mother's number this time vs
      // father's number on the old roster record). The phone-clustering pass
      // above can't see this at all since it groups by phone first — this is
      // the "different mobile number" half of what duplicates actually look
      // like, so it needs its own scan. Excludes anyone already covered by a
      // phone-based cluster above to avoid double-reporting the same pair. ──
      const phoneClusteredIds = new Set(clusters.flatMap((c) => c.students.map((s: any) => s.studentId)));
      const byCentre = new Map<string, any[]>();
      studentsSnap.docs.forEach((d) => {
        const s = d.data();
        const centreId = s.primaryCentreId as string | undefined;
        if (!centreId) return;
        const centre = centreById.get(centreId);
        if (!centre) return;
        if (centreCodeFilter && centre.code?.toUpperCase() !== centreCodeFilter) return;
        if (phoneClusteredIds.has(d.id)) return;
        const arr = byCentre.get(centreId) ?? [];
        arr.push({
          studentId: d.id,
          name: s.name ?? '',
          externalStudentId: s.externalStudentId ?? null,
          phone: canonicalPhone(s.phone),
          createdBy: s.createdBy ?? null,
          createdAt: s.createdAt ?? null,
          payments: payCount.get(d.id) ?? 0,
          centreCode: centre.code,
          centreName: centre.name,
        });
        byCentre.set(centreId, arr);
      });

      const crossPhoneDuplicatePairs: any[] = [];
      for (const arr of byCentre.values()) {
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const na = normalizeName(arr[i].name);
            const nb = normalizeName(arr[j].name);
            if (!na || !nb || !namesAreNear(na, nb)) continue;
            if (arr[i].phone && arr[i].phone === arr[j].phone) continue; // same phone → already in pass 1
            const [keep, dup] = [arr[i], arr[j]].sort(
              (x, y) => (y.payments - x.payments) || (Number(!!y.externalStudentId) - Number(!!x.externalStudentId)),
            );
            crossPhoneDuplicatePairs.push({
              centreCode: keep.centreCode,
              centreName: keep.centreName,
              keep: { studentId: keep.studentId, name: keep.name, phone: keep.phone, externalStudentId: keep.externalStudentId, payments: keep.payments },
              duplicate: { studentId: dup.studentId, name: dup.name, phone: dup.phone, externalStudentId: dup.externalStudentId, payments: dup.payments },
              editDistance: editDistance(na, nb),
              note: 'Same/near-identical name at this centre but DIFFERENT phone numbers — verify manually before merging (could be same person with a new number, or two unrelated people who happen to share a name).',
            });
          }
        }
      }

      res.status(200).json({
        ok: true,
        totalStudents: studentsSnap.size,
        clusters,
        crossPhoneDuplicatePairs,
        summary: {
          clustersSharingPhone: clusters.length,
          likelyDuplicateClusters: clusters.filter((c) => c.likelyDuplicate).length,
          likelySiblingClusters: clusters.filter((c) => !c.likelyDuplicate).length,
          crossPhoneSuspects: crossPhoneDuplicatePairs.length,
        },
      });
    } catch (err: any) {
      logger.error('[findDuplicateStudents] error', { error: err?.message });
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  },
);
