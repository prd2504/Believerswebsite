import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';

/**
 * Public list of coach/staff NAMES for a centre, used by the /fees page so a
 * parent paying cash can pick which coach they handed it to. Exposes names
 * only — never phone, email, salary, or bank details — so it's safe to serve
 * to the unauthenticated page even though /staff itself is SUPER_ADMIN-only in
 * the Firestore rules (this runs via the admin SDK, which bypasses rules, and
 * deliberately returns nothing sensitive).
 *
 *   GET /listCoaches?centreCode=RUI
 */
export const listCoaches = onRequest(
  { region: 'asia-south1', cors: true, timeoutSeconds: 30 },
  async (req, res): Promise<void> => {
    const centreCode = String(req.query.centreCode ?? '').trim().toUpperCase();
    if (!centreCode) {
      res.status(400).json({ ok: false, error: 'centreCode is required' });
      return;
    }

    try {
      const centreSnap = await db
        .collection('centres')
        .where('centreCode', '==', centreCode)
        .where('active', '==', true)
        .limit(1)
        .get();

      if (centreSnap.empty) {
        // Not an error the payer should see — just no coaches to offer.
        res.set('Cache-Control', 'public, max-age=300');
        res.status(200).json({ ok: true, coaches: [] });
        return;
      }
      const centreId = centreSnap.docs[0].id;

      // Staff collection is small (a few dozen); fetch and filter in memory to
      // avoid needing a composite index on centreIds + status.
      const staffSnap = await db.collection('staff').get();
      const coaches = staffSnap.docs
        .map((d) => d.data())
        .filter((s: any) =>
          (s.status ?? 'ACTIVE') === 'ACTIVE' &&
          Array.isArray(s.centreIds) && s.centreIds.includes(centreId) &&
          typeof s.name === 'string' && s.name.trim(),
        )
        .map((s: any) => ({ name: String(s.name).trim() }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.set('Cache-Control', 'public, max-age=300');
      res.status(200).json({ ok: true, coaches });
    } catch (err: any) {
      logger.error('[listCoaches] error', { error: err?.message });
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  },
);
