/**
 * Application router. All route definitions live here. Lazy-loaded pages keep the
 * initial bundle small.
 *
 * Structure:
 *   /login, /register      — public (redirect away if already authenticated)
 *   /admin/*                — ProtectedRoute + RoleRoute(SUPER_ADMIN, CENTRE_MANAGER)
 *   /coach/*                — ProtectedRoute + RoleRoute(COACH)
 *   /me/*                   — ProtectedRoute + RoleRoute(STUDENT, PARENT)
 *   /                       — redirects to role-appropriate home
 */

import { lazy, Suspense } from 'react';
import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from 'react-router-dom';
import { UserRole } from '@bba/shared';
import { ProtectedRoute, RoleRoute } from '@/components/auth/ProtectedRoute';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { MobileLayout } from '@/components/layouts/MobileLayout';
import { FullPageLoader } from '@/components/common/FullPageLoader';
import { RootRedirect } from './RootRedirect';

// ---- Lazy page imports ---------------------------------------------------------------
const LoginPage = lazy(() => import('@/pages/auth/Login'));
const RegisterPage = lazy(() => import('@/pages/auth/Register'));
const PendingApprovalPage = lazy(() => import('@/pages/auth/PendingApproval'));
const BookingRedirect = lazy(() => import('@/pages/public/BookingRedirect'));
const FeesPortal = lazy(() => import('@/pages/public/FeesPortal'));
const CourtBookingPortal = lazy(() => import('@/pages/public/CourtBookingPortal'));

const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'));
const CentresPage = lazy(() => import('@/pages/admin/Centres'));
const BatchesPage = lazy(() => import('@/pages/admin/Batches'));
const AdminStudents = lazy(() => import('@/pages/admin/Students'));
const AdminCoaches = lazy(() => import('@/pages/admin/Coaches'));
const AdminRoster = lazy(() => import('@/pages/admin/Roster'));
const AdminAttendance = lazy(() => import('@/pages/admin/Attendance'));
const AdminPayments = lazy(() => import('@/pages/admin/Payments'));
const AdminProgress = lazy(() => import('@/pages/admin/Progress'));
const AdminSessionLogs = lazy(() => import('@/pages/admin/SessionLogs'));
const AdminParentFeedback = lazy(() => import('@/pages/admin/ParentFeedback'));
const AdminFinancials = lazy(() => import('@/pages/admin/Financials'));
const AdminIssues = lazy(() => import('@/pages/admin/Issues'));
const AdminNotifications = lazy(() => import('@/pages/admin/Notifications'));
const AdminPayroll = lazy(() => import('@/pages/admin/Payroll'));
const AdminSettings = lazy(() => import('@/pages/admin/Settings'));
const AdminCentreExpenses = lazy(() => import('@/pages/admin/CentreExpenses'));
const AdminCourtBookings = lazy(() => import('@/pages/admin/CourtBookings'));

const CoachDashboard = lazy(() => import('@/pages/coach/Dashboard'));
const CoachBatches = lazy(() => import('@/pages/coach/Batches'));
const CoachAttendance = lazy(() => import('@/pages/coach/Attendance'));
const CoachProgress = lazy(() => import('@/pages/coach/Progress'));
const CoachIssues = lazy(() => import('@/pages/coach/Issues'));
const CoachSalary = lazy(() => import('@/pages/coach/Salary'));

const StudentDashboard = lazy(() => import('@/pages/student/Dashboard'));
const SchedulePage = lazy(() => import('@/pages/student/Schedule'));
const StudentAttendance = lazy(() => import('@/pages/student/Attendance'));
const FeesPage = lazy(() => import('@/pages/student/Fees'));
const StudentProgress = lazy(() => import('@/pages/student/Progress'));
const ProfilePage = lazy(() => import('@/pages/student/Profile'));

// ---- Suspense wrapper ---------------------------------------------------------------
function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<FullPageLoader />}>{children}</Suspense>;
}

// ---- Route tree ---------------------------------------------------------------------
const routes: RouteObject[] = [
  // Public routes
  {
    path: '/login',
    element: <Lazy><LoginPage /></Lazy>,
  },
  {
    path: '/register',
    element: <Lazy><RegisterPage /></Lazy>,
  },
  {
    path: '/pending-approval',
    element: <Lazy><PendingApprovalPage /></Lazy>,
  },
  // Legacy slot-booking portal — now folded into /fees. See BookingRedirect.
  {
    path: '/book/:centreSlug',
    element: <Lazy><BookingRedirect /></Lazy>,
  },
  {
    path: '/fees',
    element: <Lazy><FeesPortal /></Lazy>,
  },
  // Unlisted on purpose — shared by direct link only. Not in any nav, not
  // linked from /fees, and the page sets a noindex robots tag on mount.
  {
    path: '/court/:centreSlug',
    element: <Lazy><CourtBookingPortal /></Lazy>,
  },

  // Root redirect — sends authenticated users to their role home, guests to /login
  {
    path: '/',
    element: <RootRedirect />,
  },

  // ---- Admin / Manager shell ----------------------------------------------------------
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <RoleRoute allowed={[UserRole.SUPER_ADMIN, UserRole.CENTRE_MANAGER]} />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { path: '/admin', element: <Lazy><AdminDashboard /></Lazy> },
              { path: '/admin/centres', element: <Lazy><CentresPage /></Lazy> },
              { path: '/admin/batches', element: <Lazy><BatchesPage /></Lazy> },
              { path: '/admin/students', element: <Lazy><AdminStudents /></Lazy> },
              { path: '/admin/coaches', element: <Lazy><AdminCoaches /></Lazy> },
              { path: '/admin/roster', element: <Lazy><AdminRoster /></Lazy> },
              { path: '/admin/attendance', element: <Lazy><AdminAttendance /></Lazy> },
              { path: '/admin/payments', element: <Lazy><AdminPayments /></Lazy> },
              { path: '/admin/progress', element: <Lazy><AdminProgress /></Lazy> },
              { path: '/admin/session-logs', element: <Lazy><AdminSessionLogs /></Lazy> },
              { path: '/admin/parent-feedback', element: <Lazy><AdminParentFeedback /></Lazy> },
              { path: '/admin/issues', element: <Lazy><AdminIssues /></Lazy> },
              { path: '/admin/notifications', element: <Lazy><AdminNotifications /></Lazy> },
              { path: '/admin/settings', element: <Lazy><AdminSettings /></Lazy> },
              // Expense submission is scoped to the centres the user manages
              // and carries no revenue or profit data, so a CENTRE_MANAGER may
              // reach it. Approval stays on the SUPER_ADMIN Financials page.
              { path: '/admin/expenses', element: <Lazy><AdminCentreExpenses /></Lazy> },
              // Court hours — a manager runs this day to day, so admin-like.
              { path: '/admin/court-hours', element: <Lazy><AdminCourtBookings /></Lazy> },
              // Financials & Payroll expose salaries, expenses, partner payouts
              // and profit — SUPER_ADMIN only, never CENTRE_MANAGER. Nested guard
              // so a manager can't reach them by typing the URL directly.
              {
                element: <RoleRoute allowed={[UserRole.SUPER_ADMIN]} />,
                children: [
                  { path: '/admin/financials', element: <Lazy><AdminFinancials /></Lazy> },
                  { path: '/admin/payroll', element: <Lazy><AdminPayroll /></Lazy> },
                ],
              },
            ],
          },
        ],
      },

      // ---- Coach shell ----------------------------------------------------------------
      {
        element: <RoleRoute allowed={[UserRole.COACH]} />,
        children: [
          {
            element: <MobileLayout />,
            children: [
              { path: '/coach', element: <Lazy><CoachDashboard /></Lazy> },
              { path: '/coach/batches', element: <Lazy><CoachBatches /></Lazy> },
              { path: '/coach/attendance', element: <Lazy><CoachAttendance /></Lazy> },
              { path: '/coach/progress', element: <Lazy><CoachProgress /></Lazy> },
              { path: '/coach/issues', element: <Lazy><CoachIssues /></Lazy> },
              { path: '/coach/salary', element: <Lazy><CoachSalary /></Lazy> },
            ],
          },
        ],
      },

      // ---- Student / Parent shell -----------------------------------------------------
      {
        element: <RoleRoute allowed={[UserRole.STUDENT, UserRole.PARENT]} />,
        children: [
          {
            element: <MobileLayout />,
            children: [
              { path: '/me', element: <Lazy><StudentDashboard /></Lazy> },
              { path: '/me/schedule', element: <Lazy><SchedulePage /></Lazy> },
              { path: '/me/attendance', element: <Lazy><StudentAttendance /></Lazy> },
              { path: '/me/fees', element: <Lazy><FeesPage /></Lazy> },
              { path: '/me/progress', element: <Lazy><StudentProgress /></Lazy> },
              { path: '/me/profile', element: <Lazy><ProfilePage /></Lazy> },
            ],
          },
        ],
      },
    ],
  },

  // Catch-all → login
  { path: '*', element: <Navigate to="/login" replace /> },
];

export const router = createBrowserRouter(routes);
