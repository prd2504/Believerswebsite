/**
 * Handles the "/" path. Authenticated users go to their role-appropriate home page.
 * Guests go to /login.
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { roleHomePath } from '@/router/paths';
import { FullPageLoader } from '@/components/common/FullPageLoader';

export function RootRedirect() {
  const { loading, isAuthenticated, profile } = useAuth();

  if (loading) return <FullPageLoader label="Checking your session…" />;

  if (isAuthenticated && profile) {
    // Coaches pending approval or suspended go to holding page
    if (
      profile.role === 'COACH' &&
      (profile.accountStatus === 'PENDING_APPROVAL' || profile.accountStatus === 'SUSPENDED')
    ) {
      return <Navigate to="/pending-approval" replace />;
    }
    return <Navigate to={roleHomePath(profile.role)} replace />;
  }

  return <Navigate to="/login" replace />;
}
