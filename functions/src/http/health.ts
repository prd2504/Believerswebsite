/**
 * Simple health-check HTTP function. Returns a JSON status payload and a summary of
 * which feature flags are currently on — useful when debugging deploys.
 *
 * Intentionally does NOT require auth: it reports only boolean flags and version,
 * never any user data or secrets.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { config } from '../config.js';

export const health = onRequest(
  { region: 'asia-south1', cors: true },
  (_req, res): void => {
    res.status(200).json({
      ok: true,
      service: 'bba-functions',
      region: 'asia-south1',
      flags: {
        razorpayLive: config.flags.razorpayLive,
        whatsappLive: config.flags.whatsappLive,
      },
      timestamp: new Date().toISOString(),
    });
  },
);
