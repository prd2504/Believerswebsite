/**
 * `useAuth` — the hook every component uses to read auth state and role.
 *
 * Throws if called outside an <AuthProvider>. That's intentional: silently returning
 * `undefined` would hide the bug and lead to route flickers during development.
 */

import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '@/contexts/AuthContext';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() must be used inside <AuthProvider>.');
  }
  return ctx;
}
