/**
 * Shown to COACH accounts that are pending admin approval or have been suspended.
 */

import { ClipboardCheck, LogOut } from 'lucide-react';
import { signOut } from '@/services/authService';
import { useAuth } from '@/hooks/useAuth';
import { Logo } from '@/components/common/Logo';

export default function PendingApprovalPage() {
  const { profile } = useAuth();
  const isSuspended = profile?.accountStatus === 'SUSPENDED';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-background px-4">
      <Logo size="lg" />
      <div className="mt-8 w-full max-w-sm rounded-xl border border-gray-100 bg-white p-8 shadow-card text-center">
        <div className="mb-4 flex justify-center">
          <div className="rounded-full bg-yellow-50 p-4">
            <ClipboardCheck size={32} className="text-yellow-500" />
          </div>
        </div>
        <h1 className="text-lg font-bold text-brand-secondary">
          {isSuspended ? 'Account Suspended' : 'Pending Approval'}
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {isSuspended
            ? 'Your coach account has been suspended. Please contact the academy admin.'
            : 'Your coach account is waiting for approval. The admin will assign your centre and batches shortly.'}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Registered as: <span className="font-medium">{profile?.email ?? profile?.phone ?? '—'}</span>
        </p>
        <button
          onClick={() => signOut()}
          className="btn-secondary mt-6 w-full gap-2"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}
