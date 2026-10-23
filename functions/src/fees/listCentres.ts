import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';

/**
 * Public list of active centres for the /fees page. A plain HTTP GET is faster
 * on a cold load than the Firestore Web SDK (no WebSocket upgrade / token
 * exchange). Cacheable at the edge for 5 minutes.
 *
 *   GET /listCentres
 */
export const listCentres = onRequest(
  {
    region: 'asia-south1',
    cors: true,
    timeoutSeconds: 30,
  },
  async (_req, res): Promise<void> => {
    try {
      const snap = await db
        .collection('centres')
        .where('active', '==', true)
        .orderBy('name', 'asc')
        .get();

      const centres = snap.docs
        .map((d) => ({
          id: d.id,
          name: d.data().name ?? '',
          city: d.data().city ?? '',
          centreCode: d.data().centreCode ?? null,
        }))
        .filter((c) => c.centreCode);

      res.set('Cache-Control', 'public, max-age=300');
      res.status(200).json({ ok: true, centres });
    } catch (err) {
      logger.error('[listCentres] error', { err });
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  },
);
