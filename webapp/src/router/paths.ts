/**
 * Canonical path table. Keep ALL route string literals in this file — components
 * should import from here instead of hardcoding strings, so renaming a route is a
 * single-file edit.
 */

import { UserRole } from '@bba/shared';

export const paths = {
  // Public
  login: '/login',
  register: '/register',
  otp: '/otp',

  // Admin / Manager (sidebar shell)
  admin: {
    root: '/admin',
    dashboard: '/admin',
    centres: '/admin/centres',
    batches: '/admin/batches',
    students: '/admin/students',
    coaches: '/admin/coaches',
    attendance: '/admin/attendance',
    payments: '/admin/payments',
    progress: '/admin/progress',
    tournaments: '/admin/tournaments',
    notifications: '/admin/notifications',
    settings: '/admin/settings',
  },
  pendingApproval: '/pending-approval',

  // Coach (mobile-first bottom nav)
  coach: {
    root: '/coach',
    dashboard: '/coach',
    batches: '/coach/batches',
    attendance: '/coach/attendance',
    progress: '/coach/progress',
  },

  // Student / Parent (shared shell — parent sees scoped-to-child data)
  student: {
    root: '/me',
    dashboard: '/me',
    schedule: '/me/schedule',
    attendance: '/me/attendance',
    fees: '/me/fees',
    progress: '/me/progress',
    tournaments: '/me/tournaments',
    profile: '/me/profile',
  },
} as const;

/**
 * The landing page for each role after login. Used by route guards when redirecting
 * a user away from a path they aren't allowed to visit.
 */
export function roleHomePath(role: UserRole): string {
  switch (role) {
    case UserRole.SUPER_ADMIN:
    case UserRole.CENTRE_MANAGER:
      return paths.admin.dashboard;
    case UserRole.COACH:
      return paths.coach.dashboard;
    case UserRole.STUDENT:
    case UserRole.PARENT:
      return paths.student.dashboard;
    default:
      return paths.login;
  }
}
