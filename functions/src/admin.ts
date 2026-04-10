/**
 * Single Firebase Admin SDK initialisation. Every other file in /functions should import
 * `db`, `auth`, and `storage` from here — never call `admin.initializeApp()` themselves.
 *
 * This avoids the classic "app already exists" crash when multiple entry points are
 * imported in the same Cloud Functions instance.
 */

import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const db = admin.firestore();
export const auth = admin.auth();
export const storage = admin.storage();
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;

export type { admin };
