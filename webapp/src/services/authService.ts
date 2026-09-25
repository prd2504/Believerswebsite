/**
 * Auth service — a thin wrapper over Firebase Auth that exposes exactly the operations
 * the UI needs. Components should NEVER import from `firebase/auth` directly — always
 * go through this service.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

const FRIENDLY_AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-email': 'That email address does not look right.',
  'auth/user-not-found': 'No account exists with that email.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/email-already-in-use': 'An account already exists with that email. Try signing in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
};

export function translateAuthError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code);
    if (code in FRIENDLY_AUTH_ERRORS) return FRIENDLY_AUTH_ERRORS[code]!;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

// =========================================================================================
// Email + password
// =========================================================================================

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/**
 * Register a new account. If a Firebase Auth user already exists for this email
 * (e.g. Firestore doc was deleted but Auth wasn't), falls back to sign-in.
 * The AuthContext's ensureUserProfile() will recreate the missing Firestore doc.
 */
export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }
    return cred.user;
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) {
      const code = String((err as { code: unknown }).code);
      if (code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        return cred.user;
      }
    }
    throw err;
  }
}

export async function sendResetEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// =========================================================================================
// Shared
// =========================================================================================

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}
