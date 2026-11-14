/**
 * Authorise an onRequest endpoint that is called from the admin UI.
 *
 * ── Why this exists ──
 * The maintenance endpoints in this codebase authenticate with a shared
 * x-api-key, which is right for something run from a terminal. sendStandingPass
 * was written that way and then wired to buttons in the admin UI, so every
 * click arrived with no key and got a 401 — the pass buttons had never worked.
 *
 * The fix is NOT to put the key in the browser. That key also authorises
 * backfills, enrolment-counter rewrites and the booking→student linker, and
 * anything shipped in a JS bundle is readable by anyone who opens the page.
 *
 * So a browser caller proves who it is the same way the rest of the app does:
 * a Firebase ID token, verified here, with the role read from /users/{uid} —
 * the same document the Firestore rules consult, so an endpoint and a rule can
 * never disagree about who is an admin.
 *
 * The x-api-key path stays for curl and scheduled callers.
 */

import type { Request, Response } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { auth, db } from '../admin.js';
import { config } from '../config.js';

export type Caller =
  | { kind: 'API_KEY'; uid: null; role: null }
  | { kind: 'USER'; uid: string; role: string };

const ADMIN_LIKE = ['SUPER_ADMIN', 'CENTRE_MANAGER'];

/**
 * Returns the caller when authorised, or null after having already sent a 401.
 *
 * Returning null rather than throwing keeps the call site a plain early
 * return, which is how every other endpoint here is written.
 */
export async function requireAdminLike(
  req: Request,
  res: Response,
  opts: { superAdminOnly?: boolean } = {},
): Promise<Caller | null> {
  // Terminal / scheduled path.
  const key = req.header('x-api-key');
  if (key && config.sheets.apiKey && key === config.sheets.apiKey) {
    return { kind: 'API_KEY', uid: null, role: null };
  }

  const header = req.header('authorization') ?? req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ ok: false, error: 'Sign in as an admin to do this.' });
    return null;
  }

  let uid: string;
  try {
    uid = (await auth.verifyIdToken(token)).uid;
  } catch (err) {
    // An expired token is the common case — the UI holds one for an hour — so
    // say so rather than a bare "unauthorized" the user can do nothing with.
    logger.info('[requireAdminLike] token rejected', { err: String(err) });
    res.status(401).json({ ok: false, error: 'Your session has expired. Reload the page and try again.' });
    return null;
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const role = String(userSnap.data()?.role ?? '');
  const allowed = opts.superAdminOnly ? ['SUPER_ADMIN'] : ADMIN_LIKE;

  if (!allowed.includes(role)) {
    res.status(403).json({
      ok: false,
      error: opts.superAdminOnly
        ? 'Only a super admin can do this.'
        : 'Only an admin or centre manager can do this.',
    });
    return null;
  }

  return { kind: 'USER', uid, role };
}
