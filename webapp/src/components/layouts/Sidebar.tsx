/**
 * Sidebar navigation for SUPER_ADMIN and CENTRE_MANAGER roles. Visible on desktop
 * (lg+), hidden on mobile where the TopBar's hamburger toggles it as a slide-over.
 */

import { NavLink, type To } from 'react-router-dom';
import {
  LayoutDashboard,
  MapPin,
  Layers,
  Users,
  UserCheck,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  TrendingUp,
  ClipboardList,
  MessageSquare,
  Wallet,
  Banknote,
  AlertTriangle,
  BellRing,
  Settings,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { paths } from '@/router/paths';
import { Logo } from '@/components/common/Logo';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@bba/shared';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  to: To;
  label: string;
  icon: React.ReactNode;
  superAdminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: paths.admin.dashboard, label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { to: paths.admin.centres, label: 'Centres', icon: <MapPin size={18} /> },
  { to: paths.admin.batches, label: 'Batches', icon: <Layers size={18} /> },
  { to: paths.admin.students, label: 'Students', icon: <Users size={18} /> },
  { to: paths.admin.coaches, label: 'Coaches', icon: <UserCheck size={18} /> },
  { to: paths.admin.roster, label: 'Daily Roster', icon: <CalendarDays size={18} /> },
  { to: paths.admin.attendance, label: 'Attendance', icon: <ClipboardCheck size={18} /> },
  { to: paths.admin.payments, label: 'Payments', icon: <CreditCard size={18} /> },
  { to: paths.admin.progress, label: 'Progress', icon: <TrendingUp size={18} /> },
  { to: paths.admin.sessionLogs, label: 'Session Logs', icon: <ClipboardList size={18} /> },
  { to: paths.admin.parentFeedback, label: 'Parent Feedback', icon: <MessageSquare size={18} /> },
  { to: paths.admin.financials, label: 'Financials', icon: <Wallet size={18} />, superAdminOnly: true },
  { to: paths.admin.payroll, label: 'Payroll', icon: <Banknote size={18} />, superAdminOnly: true },
  { to: paths.admin.issues, label: 'Issues', icon: <AlertTriangle size={18} /> },
  { to: paths.admin.notifications, label: 'Notifications', icon: <BellRing size={18} /> },
  { to: paths.admin.settings, label: 'Settings', icon: <Settings size={18} /> },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === UserRole.SUPER_ADMIN;
  const visibleItems = NAV_ITEMS.filter((item) => !item.superAdminOnly || isSuperAdmin);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-100 bg-white transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Header inside sidebar — visible only on mobile slide-over */}
        <div className="flex h-14 items-center justify-between border-b border-gray-100 px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="text-sm font-semibold text-brand-secondary">BBA Admin</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-1.5"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Desktop brand — only visible on lg+ */}
        <div className="hidden h-14 items-center gap-2 border-b border-gray-100 px-4 lg:flex">
          <Logo size="sm" />
          <span className="text-sm font-bold text-brand-secondary">BBA Admin</span>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {visibleItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === paths.admin.dashboard}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-primary-light text-brand-primary'
                    : 'text-gray-600 hover:bg-brand-surface hover:text-brand-secondary',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
