/**
 * Single Firebase Admin SDK initialisation. Every other file in /functions should import
 * `db`, `auth`, and `storage` from here — never call `initializeApp()` themselves.
 *
 * Uses the modular firebase-admin API (v10+) which is bundler-friendly. The legacy
 * `import * as admin from 'firebase-admin'` namespace pattern breaks under esbuild's
 * __toESM wrapper because access like `admin.firestore.FieldValue` mixes namespace and
 * function-call semantics that the wrapper doesn't preserve.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const auth = getAuth();
export const storage = getStorage();
export { FieldValue, Timestamp };
