import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';

/**
 * Surgically set one student's externalStudentId. For the cases the automated
 * backfill can't touch — where the Player_Directory name/phone doesn't match, so
 * the tool never links them (e.g. Purva Modi → RBI-013, Ashvath → RBI-029), but
 * a human knows the correct id.
 *
 *   GET /setStudentExternalId?token=…&studentId=…&externalStudentId=RBI-013
 *   GET /setStudentExternalId?token=…&studentId=…&externalStudentId=RBI-013&execute=true
 *
 * Token-gated, dry-run by default. Warns (but still allows, with force=true) if
 * the target id is already held by another student in the same centre — a
 * collision you'd almost never want.
 */
export const setStudentExternalId = onRequest(
  { region: 'asia-south1', cors: true, timeoutSeconds: 60 },
  async (req, res): Promise<void> => {
    const secret = process.env.CLEANUP_TOKEN;
    if (!secret) { res.status(403).json({ ok: false, error: 'Disabled: CLEANUP_TOKEN is not set.' }); return; }
    const token = (req.query.token as string | undefined) ?? req.header('x-cleanup-token');
    if (token !== secret) { res.status(401).json({ ok: false, error: 'Invalid token' }); return; }

    const studentId = (req.query.studentId as string | undefined)?.trim();
    const newId = (req.query.externalStudentId as string | undefined)?.trim();
    const execute = req.query.execute === 'true';
    const force = req.query.force === 'true';
    if (!studentId || !newId) { res.status(400).json({ ok: false, error: 'studentId and externalStudentId are required' }); return; }

    try {
      const snap = await db.doc(`students/${studentId}`).get();
      if (!snap.exists) { res.status(404).json({ ok: false, error: `Student ${studentId} not found` }); return; }
      const s = snap.data()!;
      const centreId = s.primaryCentreId as string | undefined;

      // Collision guard: is another student in this centre already holding newId?
      let collision: any[] = [];
      if (centreId) {
        const dupSnap = await db.collection('students')
          .where('primaryCentreId', '==', centreId)
          .where('externalStudentId', '==', newId)
          .get();
        collision = dupSnap.docs.filter((d) => d.id !== studentId).map((d) => ({ studentId: d.id, name: d.data().name }));
      }

      const plan = {
        studentId, name: s.name ?? null,
        from: s.externalStudentId ?? null, to: newId,
        collisionWith: collision,
      };

      if (collision.length && !force) {
        res.status(409).json({ ok: false, error: `Id ${newId} is already held by another student in this centre. Re-run with force=true only if intended.`, plan });
        return;
      }
      if (!execute) {
        res.status(200).json({ ok: true, dryRun: true, plan, note: 'Add &execute=true to apply.' });
        return;
      }

      await snap.ref.update({ externalStudentId: newId, updatedAt: new Date().toISOString() });
      logger.info('[setStudentExternalId] applied', plan);
      res.status(200).json({ ok: true, dryRun: false, applied: plan });
    } catch (err: any) {
      logger.error('[setStudentExternalId] error', { error: err?.message });
      res.status(500).json({ ok: false, error: err?.message ?? 'Internal server error' });
    }
  },
);
