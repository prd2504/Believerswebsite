/**
 * One-time notice for coaches: payroll is built from the registers they save.
 * Shown once per device until acknowledged; bump NOTICE_KEY to show a new version.
 */

import { useEffect, useState } from 'react';
import { Banknote } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const NOTICE_KEY = 'bba.coachPayrollNotice.v1';

export function PayrollNotice() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (profile?.role !== 'COACH') return;
    try {
      if (!localStorage.getItem(NOTICE_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [profile?.role]);

  if (!open) return null;

  function acknowledge() {
    try { localStorage.setItem(NOTICE_KEY, new Date().toISOString()); } catch { /* private mode */ }
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-primary/10">
          <Banknote size={22} className="text-brand-primary" />
        </div>
        <h2 className="text-base font-bold text-brand-secondary">Your payroll is now automatic</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          From now on, your monthly payroll is generated automatically from the attendance you mark in this app.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-gray-600">
          <li>• Each session counts once you <strong>save its register</strong>.</li>
          <li>• A session without a saved register <strong>cannot be counted</strong>.</li>
          <li>• If a session didn&apos;t happen, tap <strong>&ldquo;Not held today?&rdquo;</strong> instead.</li>
        </ul>
        <p className="mt-3 text-xs text-gray-400">Mark attendance during or right after every session.</p>
        <button type="button" onClick={acknowledge} className="btn-primary mt-4 w-full">
          Got it
        </button>
      </div>
    </div>
  );
}
