/**
 * Single Firebase app initialisation for the webapp. Every other file in src/ should
 * import `auth`, `db`, `storage`, and `functions` from here — never call
 * `initializeApp` themselves.
 *
 * This module is side-effectful: importing it boots the SDK. That's intentional so the
 * AuthContext can subscribe to `onAuthStateChanged` as soon as React mounts.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, type Functions } from 'firebase/functions';
import { env } from './env';

/** Lazy singleton — `getApps()` check avoids duplicate init during HMR reloads. */
function getOrInitApp(): FirebaseApp {
  if (getApps().length > 0) return getApps()[0]!;
  return initializeApp({
    apiKey: env.firebase.apiKey,
    authDomain: env.firebase.authDomain,
    projectId: env.firebase.projectId,
    storageBucket: env.firebase.storageBucket,
    messagingSenderId: env.firebase.messagingSenderId,
    appId: env.firebase.appId,
    measurementId: env.firebase.measurementId || undefined,
  });
}

export const firebaseApp: FirebaseApp = getOrInitApp();

// Eagerly export the core services. Using module-level consts means all consumers share
// the same SDK instances (important for auth state propagation and caching).
export const auth: Auth = getAuth(firebaseApp);
export const db: Firestore = getFirestore(firebaseApp);
export const storage: FirebaseStorage = getStorage(firebaseApp);
export const functions: Functions = getFunctions(firebaseApp, env.functionsRegion);
