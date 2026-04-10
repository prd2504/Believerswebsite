/**
 * Auth service — a thin wrapper over Firebase Auth that exposes exactly the operations
 * the UI needs. Components should NEVER import from `firebase/auth` directly — always
 * go through this service. That gives us a single place to add logging, error
 * translation, and (later) analytics.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  updateProfile,
  type ConfirmationResult,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

/**
 * Human-friendly error messages keyed off Firebase's `code` field. Keep this list short
 * and specific — any unmatched code falls through to a generic "Something went wrong".
 */
const FRIENDLY_AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-email': 'That email address does not look right.',
  'auth/user-not-found': 'No account exists with that email.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/email-already-in-use': 'An account already exists with that email.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-phone-number': 'Enter a valid Indian mobile number.',
  'auth/invalid-verification-code': 'The OTP you entered is incorrect. Try again.',
  'auth/code-expired': 'That OTP has expired. Request a new one.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/operation-not-allowed':
    'This sign-in method is not enabled in Firebase Console. See README for setup.',
};

/** Translate a Firebase error into a message we're willing to show users. */
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

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  return cred.user;
}

export async function sendResetEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// =========================================================================================
// Phone OTP
// =========================================================================================

/**
 * Create (or reuse) an invisible reCAPTCHA verifier attached to the DOM element with the
 * given id. This must be done INSIDE a browser environment and AFTER the element exists
 * in the DOM — the Login page mounts a hidden div for exactly this purpose.
 *
 * We cache the verifier on `window` so that repeated "Resend OTP" clicks don't register a
 * new reCAPTCHA widget each time (which would otherwise spam the console and
 * eventually get throttled).
 */
let cachedVerifier: RecaptchaVerifier | null = null;

export function getOrCreateRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  if (cachedVerifier) return cachedVerifier;
  cachedVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {
      /* reCAPTCHA solved — signInWithPhoneNumber will proceed automatically. */
    },
    'expired-callback': () => {
      /* The verifier expired. Next call will re-render it. */
      cachedVerifier = null;
    },
  });
  return cachedVerifier;
}

/** Clear the cached verifier — call when leaving the login page. */
export function clearRecaptchaVerifier(): void {
  if (cachedVerifier) {
    try {
      cachedVerifier.clear();
    } catch {
      /* ignore — widget may already be torn down */
    }
    cachedVerifier = null;
  }
}

/**
 * Kick off a phone-number OTP flow. Returns a ConfirmationResult the caller passes to
 * `confirmOtp` once the user enters the code from their SMS.
 */
export async function sendPhoneOtp(
  phoneE164: string,
  recaptchaContainerId: string,
): Promise<ConfirmationResult> {
  const verifier = getOrCreateRecaptchaVerifier(recaptchaContainerId);
  return signInWithPhoneNumber(auth, phoneE164, verifier);
}

export async function confirmOtp(
  confirmation: ConfirmationResult,
  code: string,
): Promise<User> {
  const cred = await confirmation.confirm(code);
  return cred.user;
}

// =========================================================================================
// Shared
// =========================================================================================

export async function signOut(): Promise<void> {
  clearRecaptchaVerifier();
  await fbSignOut(auth);
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}
