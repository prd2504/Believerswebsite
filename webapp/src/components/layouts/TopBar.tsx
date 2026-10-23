/**
 * Top bar shared by all role shells. Shows the BBA logo, current user name/role,
 * notification bell (placeholder), and sign-out button.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from '@/services/authService';
import { Logo } from '@/components/common/Logo';
import { toast } from 'sonner';

interface TopBarProps {
  onMenuToggle?: () => void;
  showMenuButton?: boolean;
}

export function TopBar({ onMenuToggle, showMenuButton = false }: TopBarProps) {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      navigate('/login', { replace: true });
      toast.success('Signed out');
    } catch {
      toast.error('Failed to sign out');
    }
  }, [navigate]);

  const roleBadgeLabel = profile?.role.replace('_', ' ') ?? '';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-100 bg-white px-4 lg:px-6">
      <div className="flex items-center gap-3">
        {showMenuButton && (
          <button
            type="button"
            onClick={onMenuToggle}
            className="btn-ghost p-1.5 lg:hidden"
            aria-label="Toggle menu"
          >
            <Menu size={20} />
          </button>
        )}
        <Logo size="sm" />
        <span className="hidden text-sm font-semibold text-brand-secondary sm:inline">
          BBA Sports Academy
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Notification bell — placeholder count; wired up in Step 10 */}
        <button type="button" className="btn-ghost relative p-2" aria-label="Notifications">
          <Bell size={18} />
        </button>

        {/* User info */}
        <div className="hidden items-center gap-2 sm:flex">
          <div className="text-right">
            <p className="text-sm font-medium leading-tight text-brand-secondary">
              {profile?.name ?? 'Guest'}
            </p>
            <p className="text-xs capitalize leading-tight text-gray-400">{roleBadgeLabel}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="btn-ghost p-2 text-gray-400 hover:text-red-500"
          aria-label="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
