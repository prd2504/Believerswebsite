/**
 * Admin Setup page — lets the first user (or the original founder whose Firestore
 * doc was deleted) claim SUPER_ADMIN role.
 *
 * Accessible at /setup by any authenticated user. Once an admin other than the
 * original founder is bootstrapped, this page shows "Access denied".
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { claimFirstAdmin, getFirstAdminUid } from '@/services/userService';
import { Logo } from '@/components/common/Logo';
import { paths } from '@/router/paths';

type PageState = 'loading' | 'can-claim' | 'can-restore' | 'admin-exists' | 'already-admin' | 'claiming';

export default function SetupPage() {
  const { profile, refreshProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>('loading');

  useEffect(() => {
    if (authLoading) return;
    if (!profile) return;

    if (profile.role === 'SUPER_ADMIN' || profile.role === 'CENTRE_MANAGER') {
      setState('already-admin');
      return;
    }

    getFirstAdminUid()
      .then((firstAdminUid) => {
        if (firstAdminUid === null) {
          setState('can-claim');
        } else if (firstAdminUid === profile.id) {
          setState('can-restore');
        } else {
          setState('admin-exists');
        }
      })
      .catch(() => setState('admin-exists'));
  }, [profile, authLoading]);

  async function handleClaim() {
    if (!profile) return;
    setState('claiming');
    try {
      await claimFirstAdmin(profile.id);
      await refreshProfile();
      toast.success('Admin role claimed. Welcome to BBA Sports Academy!');
      navigate(paths.admin.dashboard, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'ADMIN_EXISTS') {
        toast.error('Another admin account already exists. Contact them to update your role.');
        setState('admin-exists');
      } else {
        toast.error('Failed to claim admin role. Check the browser console.');
        console.error(err);
        setState(profile.id ? 'can-claim' : 'loading');
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Logo size="lg" />
          <h1 className="mt-4 text-2xl font-bold text-brand-secondary">Admin Setup</h1>
        </div>

        <div className="card text-center">
          {(state === 'loading' || authLoading) && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={32} className="animate-spin text-brand-primary" />
              <p className="text-sm text-gray-500">Checking setup status…</p>
            </div>
          )}

          {state === 'already-admin' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <ShieldCheck size={40} className="text-green-500" />
              <p className="font-semibold text-brand-secondary">You already have admin access.</p>
              <button onClick={() => navigate(paths.admin.dashboard)} className="btn-primary mt-2">
                Go to Dashboard
              </button>
            </div>
          )}

          {(state === 'can-claim' || state === 'can-restore') && (
            <div className="flex flex-col items-center gap-3 py-4">
              <ShieldCheck size={40} className="text-brand-primary" />
              <p className="font-semibold text-brand-secondary">
                {state === 'can-claim'
                  ? 'No admin account exists yet.'
                  : 'Your admin account was reset.'}
              </p>
              <p className="text-sm text-gray-500">
                {state === 'can-claim'
                  ? 'You are the first user. Claim the Super Admin role to manage the platform.'
                  : 'You are the original admin. Restore your Super Admin role.'}
              </p>
              <button onClick={handleClaim} className="btn-primary mt-2">
                <ShieldCheck size={16} />
                {state === 'can-claim' ? 'Claim Admin Role' : 'Restore Admin Role'}
              </button>
            </div>
          )}

          {state === 'claiming' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={32} className="animate-spin text-brand-primary" />
              <p className="text-sm text-gray-500">Setting up your admin account…</p>
            </div>
          )}

          {state === 'admin-exists' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <ShieldAlert size={40} className="text-yellow-500" />
              <p className="font-semibold text-brand-secondary">Admin already exists</p>
              <p className="text-sm text-gray-500">
                Contact your Super Admin to assign you the correct role.
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Logged in as{' '}
          <span className="font-medium text-brand-secondary">{profile?.email ?? profile?.name ?? '…'}</span>
        </p>
      </div>
    </div>
  );
}
