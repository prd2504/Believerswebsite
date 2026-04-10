/**
 * User service — reads and writes /users/{uid} documents.
 *
 * The core function used by the auth bootstrap is `ensureUserProfile`, which creates a
 * default user doc on first sign-in (defaulting to the STUDENT role) and returns the
 * merged profile. The AuthContext calls this on every auth state change so that the
 * RBAC role is always present by the time any protected route renders.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  UserRole,
  COLLECTIONS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type UserDocument,
  type EditableUserProfile,
} from '@bba/shared';

/**
 * Shape of the data a newly-authed user hands us when we bootstrap their profile.
 * Name may be empty — we fall back to "Guest" so there's always something to show
 * until they complete onboarding.
 */
export interface BootstrapProfileInput {
  uid: string;
  name: string;
  phone: string | null;
  email: string | null;
}

/**
 * Convert a Firestore document into a strongly-typed UserDocument. Firestore returns
 * Timestamps for server timestamps; we coerce to ISO strings so the rest of the app
 * can treat everything as plain JSON.
 */
function fromFirestore(id: string, data: DocumentData): UserDocument {
  const toIso = (ts: unknown): string => {
    if (!ts) return new Date().toISOString();
    if (typeof ts === 'string') return ts;
    if (ts && typeof ts === 'object' && 'toDate' in ts) {
      return (ts as Timestamp).toDate().toISOString();
    }
    return new Date().toISOString();
  };

  return {
    id,
    role: (data.role ?? UserRole.STUDENT) as UserRole,
    name: data.name ?? '',
    phone: data.phone ?? null,
    email: data.email ?? null,
    photoPath: data.photoPath ?? null,
    centreIds: Array.isArray(data.centreIds) ? data.centreIds : [],
    linkedStudentIds: Array.isArray(data.linkedStudentIds) ? data.linkedStudentIds : [],
    notificationPreferences: {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...(data.notificationPreferences ?? {}),
    },
    onboardingComplete: Boolean(data.onboardingComplete ?? false),
    disabled: Boolean(data.disabled ?? false),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

/**
 * Fetch the user profile for a given uid. Returns `null` if no document exists yet.
 */
export async function getUserProfile(uid: string): Promise<UserDocument | null> {
  const ref = doc(db, COLLECTIONS.users, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return fromFirestore(snap.id, snap.data());
}

/**
 * Create the /users/{uid} document if it does not yet exist. Idempotent — safe to call
 * on every login. Returns the final (existing OR newly-created) profile.
 *
 * The default role is STUDENT. The founder should run the one-off "promote to
 * SUPER_ADMIN" script (to be added in Step 2) to elevate themselves.
 */
export async function ensureUserProfile(input: BootstrapProfileInput): Promise<UserDocument> {
  const existing = await getUserProfile(input.uid);
  if (existing) return existing;

  const ref = doc(db, COLLECTIONS.users, input.uid);
  const base: Omit<UserDocument, 'createdAt' | 'updatedAt'> & {
    createdAt: ReturnType<typeof serverTimestamp>;
    updatedAt: ReturnType<typeof serverTimestamp>;
  } = {
    id: input.uid,
    role: UserRole.STUDENT,
    name: input.name || 'Guest',
    phone: input.phone,
    email: input.email,
    photoPath: null,
    centreIds: [],
    linkedStudentIds: [],
    notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
    onboardingComplete: false,
    disabled: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: null,
    updatedBy: null,
  };

  await setDoc(ref, base);
  // Re-read so we return real ISO timestamps instead of FieldValue sentinels.
  const fresh = await getUserProfile(input.uid);
  if (!fresh) {
    throw new Error('Failed to create user profile — /users write succeeded but read returned null.');
  }
  return fresh;
}

/**
 * Update the editable subset of a profile. Used by the user's own profile-edit screen.
 */
export async function updateUserProfile(
  uid: string,
  patch: Partial<EditableUserProfile>,
): Promise<void> {
  const ref = doc(db, COLLECTIONS.users, uid);
  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}
