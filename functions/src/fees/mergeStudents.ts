import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { canonicalPhone } from './phone.js';

/**
 * One-time cleanup: merge a duplicate student into the record you want to keep.
 * Reassigns the duplicate's payments and enrollments to the survivor, copies the
 * external student ID across if the survivor lacks one (so the invoice/CA trail
 * stays intact), then deletes the duplicate.
 *
 *   GET /mergeStudents?keepId=A&dupId=B&token=… &execute=true
 *
 * Safety:
 *   • Destructive → gated behind CLEANUP_TOKEN (set it in functions/.env). If the
 *     env var is unset the endpoint is disabled entirely.
 *   • Dry-run by default. Nothing is written unless execute=true.
 *   • Refuses to merge two students that don't share a centre + canonical phone,
 *     unless force=true — a guard against fat-fingering unrelated IDs.
 */
export const mergeStudents = onRequest(
  { region: 'asia-south1', cors: true, timeoutSeconds: 120 },
  async (req, res): Promise<void> => {
    const secret = process.env.CLEANUP_TOKEN;
    if (!secret) {
      res.status(403).json({ ok: false, error: 'Cleanup disabled: CLEANUP_TOKEN is not set.' });
      return;
    }
    const token = (req.query.token as string | undefined) ?? req.header('x-cleanup-token');
    if (token !== secret) {
      res.status(401).json({ ok: false, error: 'Invalid token' });
      return;
    }

    const keepId = (req.query.keepId as string | undefined)?.trim();
    const dupId = (req.query.dupId as string | undefined)?.trim();
    const execute = req.query.execute === 'true';
    const force = req.query.force === 'true';

    if (!keepId || !dupId || keepId === dupId) {
      res.status(400).json({ ok: false, error: 'Provide distinct keepId and dupId' });
      return;
    }

    try {
      const [keepSnap, dupSnap] = await Promise.all([
        db.doc(`students/${keepId}`).get(),
        db.doc(`students/${dupId}`).get(),
      ]);
      if (!keepSnap.exists || !dupSnap.exists) {
        res.status(404).json({ ok: false, error: 'One or both students not found' });
        return;
      }
      const keep = keepSnap.data()!;
      const dup = dupSnap.data()!;

      const sameCentre = keep.primaryCentreId === dup.primaryCentreId;
      const samePhone = canonicalPhone(keep.phone) === canonicalPhone(dup.phone);
      if ((!sameCentre || !samePhone) && !force) {
        res.status(409).json({
          ok: false,
          error: 'Students differ in centre or phone. Re-run with force=true only if you are certain.',
          keep: { name: keep.name, centre: keep.primaryCentreId, phone: canonicalPhone(keep.phone) },
          dup: { name: dup.name, centre: dup.primaryCentreId, phone: canonicalPhone(dup.phone) },
        });
        return;
      }

      const [payments, enrollments] = await Promise.all([
        db.collection('payments').where('studentId', '==', dupId).get(),
        db.collection('enrollments').where('studentId', '==', dupId).get(),
      ]);

      const copyExternalId = !keep.externalStudentId && !!dup.externalStudentId;
      // A duplicate created via the public /fees page often carries the ONLY
      // real email/phone on file — that flow requires an email before
      // payment. Deleting it without copying that contact info to the
      // survivor would silently break future invoice delivery for a family
      // we just went to the trouble of de-duplicating. Only fill gaps, never
      // overwrite something the kept record already has.
      const copyEmail = !keep.email && !!dup.email;
      const copyPhone = !keep.phone && !!dup.phone;

      const plan = {
        keep: { studentId: keepId, name: keep.name, externalStudentId: keep.externalStudentId ?? null, email: keep.email ?? null },
        duplicate: { studentId: dupId, name: dup.name, externalStudentId: dup.externalStudentId ?? null, email: dup.email ?? null },
        willReassignPayments: payments.size,
        willReassignEnrollments: enrollments.size,
        willCopyExternalIdToKeep: copyExternalId ? dup.externalStudentId : null,
        willCopyEmailToKeep: copyEmail ? dup.email : null,
        willCopyPhoneToKeep: copyPhone ? dup.phone : null,
        willDeleteDuplicate: true,
      };

      if (!execute) {
        res.status(200).json({ ok: true, dryRun: true, plan, note: 'Add &execute=true to apply.' });
        return;
      }

      const batch = db.batch();
      payments.docs.forEach((d) => batch.update(d.ref, { studentId: keepId, updatedAt: new Date().toISOString() }));
      enrollments.docs.forEach((d) => batch.update(d.ref, { studentId: keepId, updatedAt: new Date().toISOString() }));
      // Single combined update to the kept doc — a Firestore batch must not
      // write to the same document twice.
      if (copyExternalId || copyEmail || copyPhone) {
        const fill: Record<string, string> = { updatedAt: new Date().toISOString() };
        if (copyExternalId) fill.externalStudentId = dup.externalStudentId;
        if (copyEmail) fill.email = dup.email;
        if (copyPhone) fill.phone = canonicalPhone(dup.phone);
        batch.update(keepSnap.ref, fill);
      }
      batch.delete(dupSnap.ref);
      await batch.commit();

      logger.info('[mergeStudents] merged', { keepId, dupId, ...plan });
      res.status(200).json({ ok: true, dryRun: false, merged: plan });
    } catch (err: any) {
      logger.error('[mergeStudents] error', { error: err?.message });
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  },
);
