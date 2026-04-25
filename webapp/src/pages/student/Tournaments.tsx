/**
 * Student/Parent tournaments page — view upcoming tournaments and register.
 */

import { useState, useEffect, useCallback } from 'react';
import { Trophy, Calendar, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getAllTournaments, registerStudent, unregisterStudent, getRegistrations } from '@/services/tournamentService';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { formatINR } from '@bba/shared';
import { cn } from '@/lib/cn';
import type { TournamentDocument, TournamentRegistration } from '@bba/shared';

const STATUS_STYLES: Record<string, string> = {
  UPCOMING: 'bg-blue-50 text-blue-700',
  REGISTRATION_OPEN: 'bg-green-50 text-green-700',
  REGISTRATION_CLOSED: 'bg-yellow-50 text-yellow-700',
  IN_PROGRESS: 'bg-purple-50 text-purple-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-50 text-red-600',
};

export default function StudentTournaments() {
  const { profile } = useAuth();
  const [tournaments, setTournaments] = useState<TournamentDocument[]>([]);
  const [myRegs, setMyRegs] = useState<Map<string, TournamentRegistration>>(new Map());
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState<string | null>(null);

  const studentId = profile?.linkedStudentIds?.[0] ?? profile?.id ?? '';

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllTournaments();
      const visible = data.filter((t) => t.status !== 'CANCELLED');
      setTournaments(visible);

      // Check existing registrations
      const regMap = new Map<string, TournamentRegistration>();
      for (const t of visible) {
        const regs = await getRegistrations(t.id).catch(() => []);
        const mine = regs.find((r) => r.studentId === studentId);
        if (mine) regMap.set(t.id, mine);
      }
      setMyRegs(regMap);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  async function handleRegister(t: TournamentDocument, categoryId: string) {
    if (!profile || !studentId) return;
    setRegistering(t.id);
    try {
      await registerStudent(t.id, studentId, categoryId, profile.id);
      toast.success(`Registered for ${t.name}`);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Registration failed');
    } finally {
      setRegistering(null);
    }
  }

  async function handleUnregister(t: TournamentDocument) {
    if (!studentId) return;
    setRegistering(t.id);
    try {
      await unregisterStudent(t.id, studentId);
      toast.success('Unregistered');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to unregister');
    } finally {
      setRegistering(null);
    }
  }

  if (loading) return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold text-brand-secondary">Tournaments</h1>
      <CardSkeleton count={3} />
    </div>
  );

  if (tournaments.length === 0) return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold text-brand-secondary">Tournaments</h1>
      <EmptyState icon={<Trophy size={48} />} title="No upcoming tournaments" description="Check back soon for upcoming tournaments." />
    </div>
  );

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold text-brand-secondary">Tournaments</h1>
      <div className="space-y-3">
        {tournaments.map((t) => {
          const isRegistered = myRegs.has(t.id);
          const myReg = myRegs.get(t.id);
          const canRegister = t.status === 'REGISTRATION_OPEN';
          const busy = registering === t.id;

          return (
            <div key={t.id} className="card">
              <div className="mb-2 flex items-center justify-between">
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[t.status])}>
                  {t.status.replace(/_/g, ' ')}
                </span>
                {t.entryFeePaise != null && (
                  <span className="text-xs font-semibold text-brand-secondary">
                    {formatINR(t.entryFeePaise, { withDecimals: false })} entry
                  </span>
                )}
              </div>

              <h3 className="text-sm font-semibold text-brand-secondary">{t.name}</h3>
              <p className="text-xs text-gray-400">{t.sport} · {t.venueName ?? 'TBD'}</p>

              <div className="mt-2 flex gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Calendar size={11} />{t.startDate}</span>
                <span className="flex items-center gap-1"><Users size={11} />{t.categories.length} categories</span>
              </div>

              {/* My registration */}
              {isRegistered && (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-green-50 px-3 py-2">
                  <span className="text-xs text-green-700 font-medium">
                    Registered — {t.categories.find((c) => c.id === myReg?.categoryId)?.name ?? 'Unknown category'}
                  </span>
                  {canRegister && (
                    <button onClick={() => handleUnregister(t)} disabled={busy} className="text-xs text-red-600 hover:underline">
                      {busy ? '…' : 'Unregister'}
                    </button>
                  )}
                </div>
              )}

              {/* Register buttons */}
              {!isRegistered && canRegister && t.categories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleRegister(t, cat.id)}
                      disabled={busy}
                      className="rounded-full border border-brand-primary px-3 py-1 text-xs font-medium text-brand-primary hover:bg-brand-primary-light disabled:opacity-50"
                    >
                      {busy ? 'Registering…' : `Register: ${cat.name}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
