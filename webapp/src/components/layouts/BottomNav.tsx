/**
 * Bottom navigation bar for mobile-first roles: COACH, STUDENT, PARENT.
 * Each role gets a different set of tabs. Hidden on desktop (lg+) where the pages
 * have their own in-page side nav or card layout.
 */

import { NavLink, type To } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  ClipboardCheck,
  TrendingUp,
  Calendar,
  CreditCard,
  User,
  Banknote,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { paths } from '@/router/paths';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@bba/shared';

interface Tab {
  to: To;
  label: string;
  icon: React.ReactNode;
}

const COACH_TABS: Tab[] = [
  { to: paths.coach.dashboard, label: 'Home', icon: <LayoutDashboard size={20} /> },
  { to: paths.coach.batches, label: 'Batches', icon: <Layers size={20} /> },
  { to: paths.coach.attendance, label: 'Attendance', icon: <ClipboardCheck size={20} /> },
  { to: paths.coach.salary, label: 'Salary', icon: <Banknote size={20} /> },
  { to: paths.coach.progress, label: 'Progress', icon: <TrendingUp size={20} /> },
];

const STUDENT_TABS: Tab[] = [
  { to: paths.student.dashboard, label: 'Home', icon: <LayoutDashboard size={20} /> },
  { to: paths.student.schedule, label: 'Schedule', icon: <Calendar size={20} /> },
  { to: paths.student.fees, label: 'Fees', icon: <CreditCard size={20} /> },
  { to: paths.student.progress, label: 'Progress', icon: <TrendingUp size={20} /> },
  { to: paths.student.profile, label: 'Profile', icon: <User size={20} /> },
];

function tabsForRole(role: string): Tab[] {
  switch (role) {
    case UserRole.COACH:
      return COACH_TABS;
    case UserRole.STUDENT:
    case UserRole.PARENT:
      return STUDENT_TABS;
    default:
      return STUDENT_TABS;
  }
}

export function BottomNav() {
  const { profile } = useAuth();
  const tabs = tabsForRole(profile?.role ?? UserRole.STUDENT);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="flex h-16 items-center justify-around">
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.to}
            end={tab.to === paths.coach.dashboard || tab.to === paths.student.dashboard}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 py-1 text-xs font-medium transition-colors',
                isActive ? 'text-brand-primary' : 'text-gray-400',
              )
            }
          >
            {tab.icon}
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
