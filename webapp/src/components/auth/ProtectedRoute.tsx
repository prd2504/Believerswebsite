/**
 * Route guards.
 *
 * - <ProtectedRoute>: blocks unauthenticated users from child routes. Redirects to
 *   /login, preserving the attempted path via react-router state so we can send them
 *   back after login.
 *
 * - <RoleRoute>: an additional guard layered on top — blocks authenticated users who
 *   don't hold one of the allowed roles. Redirects to their own role-appropriate home.
 *
 * These are pure guards — they render an <Outlet /> to expose their child routes.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { roleHomePath } from '@/router/paths';
import type { UserRole } from '@bba/shared';
import { FullPageLoader } from '@/components/common/FullPageLoader';

export function ProtectedRoute() {
  const { loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader label="Loading your account…" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function RoleRoute({ allowed }: { allowed: UserRole[] }) {
  const { profile, loading } = useAuth();

  if (loading) return <FullPageLoader label="Checking permissions…" />;

  if (!profile) return <Navigate to="/login" replace />;

  if (!allowed.includes(profile.role)) {
    // Not forbidden — just not the route for this role. Send them home.
    return <Navigate to={roleHomePath(profile.role)} replace />;
  }

  return <Outlet />;
}
