/**
 * AuthContext — the single source of truth for the current user's identity AND role.
 *
 * Every component that needs to know "am I signed in?" or "what role am I?" goes through
 * this context. It listens to Firebase Auth state changes, bootstraps a /users/{uid}
 * document on first login, and re-fetches the profile whenever the uid changes.
 *
 * The hook `useAuth()` in hooks/useAuth.ts is the public API — components should import
 * from there, not from this file directly.
 */

import {
  createContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { toast } from 'sonner';
import { auth } from '@/lib/firebase';
import { ensureUserProfile, getUserProfile } from '@/services/userService';
import type { UserDocument } from '@bba/shared';

export interface AuthContextValue {
  /** The raw Firebase Auth user, or null if signed out. */
  firebaseUser: FirebaseUser | null;
  /** The matching /users/{uid} document, or null while loading / signed out. */
  profile: UserDocument | null;
  /** True while the initial auth state is still being determined. */
  loading: boolean;
  /** True if firebaseUser && profile are both present. */
  isAuthenticated: boolean;
  /** Force a re-fetch of the /users doc. Useful after the user edits their profile. */
  refreshProfile: () => Promise<void>;
}

/** Deliberately export the context so `hooks/useAuth.ts` can consume it. */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  /**
   * Single effect subscribes to Firebase auth changes. On every change we:
   *   1. Update the raw firebaseUser state.
   *   2. Bootstrap (if needed) and load the /users profile.
   *   3. Clear `loading` once the first resolution completes.
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        // The name we have at bootstrap depends on the auth method used:
        //  - email/password signup → displayName set in authService.registerWithEmail
        //  - phone OTP             → no displayName; we fall back to "Guest" until onboarding
        const bootstrapName =
          fbUser.displayName ||
          fbUser.email?.split('@')[0] ||
          'Guest';

        const loaded = await ensureUserProfile({
          uid: fbUser.uid,
          name: bootstrapName,
          phone: fbUser.phoneNumber,
          email: fbUser.email,
        });
        setProfile(loaded);
      } catch (err) {
        console.error('[AuthContext] Failed to load/bootstrap profile', err);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
          toast.error(
            'Firestore permission denied. Update your Firestore security rules — see the console for details.',
            { duration: 10000 },
          );
          console.error(
            '[AuthContext] Firestore PERMISSION_DENIED.\n\n' +
            'Your Firestore database likely has default "deny all" rules.\n' +
            'Go to Firebase Console → Firestore → Rules and paste the rules from firestore.rules in the repo root.\n',
          );
        } else {
          toast.error('Failed to load your profile. Check the browser console.');
        }
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const refreshProfile = async (): Promise<void> => {
    if (!firebaseUser) return;
    const fresh = await getUserProfile(firebaseUser.uid);
    setProfile(fresh);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      profile,
      loading,
      isAuthenticated: Boolean(firebaseUser && profile),
      refreshProfile,
    }),
    [firebaseUser, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
