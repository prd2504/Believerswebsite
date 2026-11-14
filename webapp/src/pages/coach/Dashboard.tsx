/**
 * Coach home — today's sessions and whether each register is saved, the
 * month's session count (the number payroll is built from), and any
 * scheduled days with no register.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, BarChart3, CheckCircle2, AlertTriangle, Clock, Ban, ChevronRight, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import { paths } from '@/router/paths';
import { getBatchesByCoach } from '@/services/batchService';
import { getAllCentres } from '@/services/centreService';
import { getSessionsByDateRange } from '@/services/attendanceService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { summariseCoachMonth, type CoachMonthSummary, type TodayStatus } from '@/lib/coachSessions';
import { formatMonthLabel, istNow } from '@bba/shared';

const TODAY_STYLE: Record<TodayStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  SAVED: { label: 'Register saved', cls: 'bg-green-100 text-green-700', icon: <CheckCircle2 size={13} /> },
  DUE: { label: 'Mark attendance', cls: 'bg-brand-primary text-white', icon: <ClipboardCheck size={13} /> },
  UPCOMING: { label: 'Later today', cls: 'bg-gray-100 text-gray-600', icon: <Clock size={13} /> },
  NOT_HELD: { label: 'Not held', cls: 'bg-gray-100 text-gray-600', icon: <Ban size={13} /> },
  CLOSED: { label: 'Closed', cls: 'bg-slate-100 text-slate-600', icon: <Ban size={13} /> },
};

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function CoachDashboard() {
  const { profile } = useAuth();
  const [summary, setSummary] = useState<CoachMonthSummary | null>(null);
  const [batchCount, setBatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const today = istNow().date;

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const [allBatches, centres] = await Promise.all([getBatchesByCoach(profile.id), getAllCentres()]);
      const batches = allBatches.filter((b) => b.status === 'ACTIVE');
      setBatchCount(batches.length);
      const monthStart = `${today.slice(0, 7)}-01`;
      const sessions = (await Promise.all(
        batches.map((b) => getSessionsByDateRange(b.id, monthStart, today).catch(() => [])),
      )).flat();
      setSummary(summariseCoachMonth({
        uid: profile.id,
        batches,
        sessions,
        centreCodes: new Map(centres.map((c) => [c.id, c.centreCode])),
        today,
        nowMs: Date.now(),
      }));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [profile, today]);

  useEffect(() => { load(); }, [load]);

  if (loading || !summary) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">Home</h1>
        <CardSkeleton count={3} />
      </div>
    );
  }

  const onTimePct = summary.counted ? Math.round((summary.onTime / summary.counted) * 100) : null;

  return (
    <div className="p-4">
      <h1 className="mb-0.5 text-lg font-bold text-brand-secondary">
        Hi, {profile?.name?.split(' ')[0] ?? 'Coach'}
      </h1>
      <p className="mb-5 text-xs text-gray-400">
        {new Date(`${today}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      {/* Today */}
      <h2 className="mb-2 text-sm font-semibold text-brand-secondary">Today</h2>
      {summary.today.length === 0 ? (
        <p className="mb-6 rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">
          {batchCount === 0
            ? 'You are not assigned to any batch yet. Ask your admin to assign you.'
            : 'No sessions for you today.'}
        </p>
      ) : (
        <div className="mb-6 space-y-2">
          {summary.today.map(({ batch, status, detail }) => {
            const st = TODAY_STYLE[status];
            const actionable = status === 'DUE' || status === 'UPCOMING' || status === 'SAVED';
            const body = (
              <>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-brand-secondary">{batch.name}</p>
                  <p className="text-xs text-gray-400">
                    {batch.startTime}–{batch.endTime}
                    {status === 'SAVED' && detail && ` · saved ${new Date(detail).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`}
                    {(status === 'NOT_HELD' || status === 'CLOSED') && detail && ` · ${detail}`}
                  </p>
                </div>
                <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', st.cls)}>
                  {st.icon} {st.label}
                </span>
              </>
            );
            return actionable ? (
              <Link key={batch.id} to={paths.coach.attendance} className="card flex items-center justify-between gap-3 active:bg-gray-50">
                {body}
              </Link>
            ) : (
              <div key={batch.id} className="card flex items-center justify-between gap-3">{body}</div>
            );
          })}
        </div>
      )}

      {/* This month */}
      <h2 className="mb-2 text-sm font-semibold text-brand-secondary">{formatMonthLabel(today.slice(0, 7))}</h2>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-brand-secondary">{summary.counted}</p>
          <p className="text-[11px] leading-tight text-gray-500">sessions counted</p>
        </div>
        <div className="card p-3 text-center">
          <p className={cn('text-2xl font-bold', summary.missing.length ? 'text-red-600' : 'text-brand-secondary')}>{summary.missing.length}</p>
          <p className="text-[11px] leading-tight text-gray-500">no register</p>
        </div>
        <div className="card p-3 text-center">
          <p className={cn('text-2xl font-bold', onTimePct === null ? 'text-gray-300' : onTimePct >= 90 ? 'text-green-600' : onTimePct >= 70 ? 'text-amber-600' : 'text-red-600')}>
            {onTimePct === null ? '—' : `${onTimePct}%`}
          </p>
          <p className="text-[11px] leading-tight text-gray-500">saved on time</p>
        </div>
      </div>

      {summary.countedByBatch.length > 0 && (
        <p className="mb-3 text-xs text-gray-500">
          {summary.countedByBatch.map((b) => `${b.batchName}: ${b.sessions}`).join(' · ')}
          {summary.notHeld > 0 && ` · ${summary.notHeld} not held`}
        </p>
      )}

      <Link to={paths.coach.salary} className="mb-6 flex items-center justify-between rounded-xl bg-sky-50 px-3 py-2.5 text-xs text-sky-800">
        <span className="flex items-center gap-2">
          <Banknote size={15} />
          Your payroll is built from these sessions. A session counts once its register is saved.
        </span>
        <ChevronRight size={14} className="shrink-0" />
      </Link>

      {summary.missing.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800">
            <AlertTriangle size={15} /> No register saved
          </p>
          <p className="mt-0.5 text-xs text-red-700">
            These sessions are not counted yet. Tap one to mark it — or mark it &ldquo;Not held&rdquo; if it didn&apos;t happen.
          </p>
          <div className="mt-2 space-y-1.5">
            {summary.missing.slice(0, 8).map((m) => (
              <Link
                key={`${m.batchId}_${m.date}`}
                to={`${paths.coach.attendance}?date=${m.date}`}
                className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-brand-secondary">{shortDate(m.date)}</span>
                  <span className="ml-2 text-xs text-gray-500">{m.batchName}</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-gray-400" />
              </Link>
            ))}
            {summary.missing.length > 8 && (
              <p className="text-xs text-red-700">+ {summary.missing.length - 8} more earlier this month</p>
            )}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link to={paths.coach.attendance} className="card flex items-center gap-2 text-sm font-medium text-brand-primary">
          <ClipboardCheck size={16} /> Mark Attendance
        </Link>
        <Link to={paths.coach.progress} className="card flex items-center gap-2 text-sm font-medium text-brand-primary">
          <BarChart3 size={16} /> Enter Scores
        </Link>
      </div>
    </div>
  );
}
