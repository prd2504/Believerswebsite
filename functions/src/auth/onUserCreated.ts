/**
 * Auth trigger — fires whenever a new Firebase Auth user is created (either via phone
 * OTP or email/password signup).
 *
 * Responsibility: create the matching /users/{uid} document with role=STUDENT as the
 * default. Admins can later elevate the role via the "Invite user" flow (to be built in
 * Step 2). Keeping the default as STUDENT means accidental sign-ups can't escalate.
 *
 * Note: we are on the v2 Firebase Functions runtime. The v2 blocking-auth trigger API
 * works on Firebase Auth with Identity Platform; without it enabled we fall back to
 * a Firestore-initiated bootstrap that the webapp calls on first login (see
 * userService.bootstrapProfile in webapp).
 *
 * For the v2 runtime, this file intentionally stays non-blocking: it exports a callable
 * function the webapp can invoke on first login. This works regardless of whether the
 * project has upgraded to Identity Platform yet.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db, FieldValue } from '../admin.js';
import { UserRole, type UserDocument, DEFAULT_NOTIFICATION_PREFERENCES } from '@bba/shared';

interface BootstrapPayload {
  name: string;
  phone: string | null;
  email: string | null;
}

/**
 * Callable: bootstraps a /users/{uid} document if it does not yet exist.
 *
 * Idempotent — can be called on every login. The webapp calls this from the
 * AuthContext whenever it detects a signed-in user with no corresponding /users doc.
 */
export const onUserCreatedTrigger = onCall<BootstrapPayload>(
  { region: 'asia-south1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Must be signed in to bootstrap profile.');
    }

    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (snap.exists) {
      logger.info(`[onUserCreated] profile already exists for ${uid} — no-op`);
      return { created: false };
    }

    const name = (request.data?.name ?? '').trim();
    if (!name) {
      throw new HttpsError('invalid-argument', 'Name is required.');
    }

    const profile: UserDocument = {
      id: uid,
      role: UserRole.STUDENT,
      name,
      phone: request.data?.phone ?? null,
      email: request.data?.email ?? null,
      photoPath: null,
      centreIds: [],
      linkedStudentIds: [],
      notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
      onboardingComplete: false,
      disabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: null,
      updatedBy: null,
    };

    await ref.set({
      ...profile,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`[onUserCreated] bootstrapped profile for ${uid}`);
    return { created: true };
  },
);
