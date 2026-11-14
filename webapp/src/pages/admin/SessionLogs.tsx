/**
 * Admin session logs page — overview of all coaching sessions with plan,
 * punch-in/out, drills, and late flags. Filterable by centre, coach, and month.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';
import { getAllBatches } from '@/services/batchService';
import { getAllCentres } from '@/services/centreService';
import { getSessionsByDateRange } from '@/services/attendanceService';
import { getAllCoaches } from '@/services/userService';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import type {
  SessionDocument,
  BatchDocument,
  CentreDocument,
  UserDocument,
} from '@bba/shared';

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function fmtMonthLabel(year: number, month: number) {
  const d = new Date(year, month);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

const STATUS_PILL: Record<string, string> = {
  PLANNED: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-green-50 text-green-700',
};

function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          className={cn(
            i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200',
          )}
        />
      ))}
    </span>
  );
}

// ── Expandable session row ──────────────────────────────────────────────────

function SessionRow({
  session,
  batchName,
  coachNames,
}: {
  session: SessionDocument;
  batchName: string;
  coachNames: string;
}) {
  const [open, setOpen] = useState(false);
  const isLate = session.latePunchIn;
  const status = session.logStatus ?? '—';
  const hasPlan = !!session.sessionPlan;

  return (
    <>
      <tr
        onClick={() => setOpen(!open)}
        className={cn(
          'cursor-pointer transition hover:bg-gray-50',
          isLate && 'border-l-4 border-red-400',
        )}
      >
        <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">
          {fmtDate(session.sessionDate)}
        </td>
        <td className="px-4 py-2.5 text-sm font-medium text-brand-secondary max-w-[140px] truncate">
          {batchName}
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-600 max-w-[120px] truncate">
          {coachNames}
        </td>
        <td className="px-4 py-2.5 text-center">
          {hasPlan ? (
            <CheckCircle2 size={16} className="inline text-green-600" />
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">
          {fmtTime(session.punchInAt)}
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">
          {fmtTime(session.punchOutAt)}
        </td>
        <td className="px-4 py-2.5">
          {isLate ? (
            <span className="inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              Late
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          <StarRating rating={session.coachSelfRating} />
        </td>
        <td className="px-4 py-2.5">
          {session.logStatus ? (
            <span
              className={cn(
                'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                STATUS_PILL[session.logStatus] ?? 'bg-gray-100 text-gray-500',
              )}
            >
              {session.logStatus.replace('_', ' ')}
            </span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          {open ? (
            <ChevronUp size={16} className="text-gray-400" />
          ) : (
            <ChevronDown size={16} className="text-gray-400" />
          )}
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={10} className="bg-gray-50/50 px-6 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <span className="text-xs font-semibold uppercase text-gray-400">Session Plan</span>
                <p className="mt-1 text-sm text-gray-700">
                  {session.sessionPlan || 'No plan submitted.'}
                </p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase text-gray-400">Drills</span>
                {session.drillsConducted.length > 0 ? (
                  <ul className="mt-1 list-disc pl-4 text-sm text-gray-700">
                    {session.drillsConducted.map((drill, i) => (
                      <li key={i}>{drill}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-gray-400">No drills recorded.</p>
                )}
              </div>
              <div>
                <span className="text-xs font-semibold uppercase text-gray-400">Post-Session Notes</span>
                <p className="mt-1 text-sm text-gray-700">
                  {session.postSessionNotes || 'No notes.'}
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function SessionLogsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [coaches, setCoaches] = useState<UserDocument[]>([]);
  const [sessions, setSessions] = useState<SessionDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Filters
  const [centreFilter, setCentreFilter] = useState('');
  const [coachFilter, setCoachFilter] = useState('');

  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  const coachMap = useMemo(() => {
    const m = new Map<string, string>();
    coaches.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [coaches]);

  const batchMap = useMemo(() => {
    const m = new Map<string, string>();
    batches.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [batches]);

  const batchCentreMap = useMemo(() => {
    const m = new Map<string, string>();
    batches.forEach((b) => m.set(b.id, b.centreId));
    return m;
  }, [batches]);

  // Load reference data once
  const loadRefData = useCallback(async () => {
    try {
      setLoading(true);
      const [bData, cData, coachData] = await Promise.all([
        getAllBatches(),
        getAllCentres(),
        getAllCoaches(),
      ]);
      setBatches(bData);
      setCentres(cData);
      setCoaches(coachData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load reference data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRefData();
  }, [loadRefData]);

  // Load sessions when month or batches change
  const loadSessions = useCallback(async () => {
    if (batches.length === 0) return;
    setSessionsLoading(true);
    try {
      const { start, end } = getMonthRange(year, month);
      const allSessions = await Promise.all(
        batches.map((b) => getSessionsByDateRange(b.id, start, end)),
      );
      setSessions(allSessions.flat());
    } catch (err) {
      console.error(err);
      toast.error('Failed to load sessions');
    } finally {
      setSessionsLoading(false);
    }
  }, [batches, year, month]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = sessions;
    if (centreFilter) {
      result = result.filter((s) => s.centreId === centreFilter);
    }
    if (coachFilter) {
      result = result.filter((s) => s.coachIds.includes(coachFilter));
    }
    return result.sort(
      (a, b) => b.sessionDate.localeCompare(a.sessionDate),
    );
  }, [sessions, centreFilter, coachFilter]);

  // Summary stats
  const totalSessions = filtered.length;
  const sessionsWithPlans = filtered.filter((s) => !!s.sessionPlan).length;
  const latePunchIns = filtered.filter((s) => s.latePunchIn).length;
  const completedSessions = filtered.filter(
    (s) => s.logStatus === 'COMPLETED',
  ).length;
  const completionRate =
    totalSessions > 0
      ? Math.round((completedSessions / totalSessions) * 100)
      : 0;

  // Month navigation
  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Session Logs</h1>
        <CardSkeleton count={4} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Session Logs</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} session{filtered.length !== 1 ? 's' : ''} in{' '}
            {fmtMonthLabel(year, month)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Month picker */}
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-1">
            <button onClick={prevMonth} className="p-1.5 hover:bg-gray-50 rounded">
              <ChevronLeft size={16} className="text-gray-500" />
            </button>
            <span className="px-2 text-sm font-medium text-brand-secondary min-w-[130px] text-center">
              {fmtMonthLabel(year, month)}
            </span>
            <button onClick={nextMonth} className="p-1.5 hover:bg-gray-50 rounded">
              <ChevronRight size={16} className="text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={centreFilter}
          onChange={(e) => setCentreFilter(e.target.value)}
          className="input w-auto py-2 text-sm"
        >
          <option value="">All Centres</option>
          {centres.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={coachFilter}
          onChange={(e) => setCoachFilter(e.target.value)}
          className="input w-auto py-2 text-sm"
        >
          <option value="">All Coaches</option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2">
            <ClipboardList size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Sessions</p>
            <p className="text-lg font-bold text-brand-secondary">{totalSessions}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-green-50 p-2">
            <CheckCircle2 size={18} className="text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">With Plans</p>
            <p className="text-lg font-bold text-brand-secondary">{sessionsWithPlans}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-red-50 p-2">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Late Punch-Ins</p>
            <p className="text-lg font-bold text-brand-secondary">{latePunchIns}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-purple-50 p-2">
            <Clock size={18} className="text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Completion Rate</p>
            <p className="text-lg font-bold text-brand-secondary">{completionRate}%</p>
          </div>
        </div>
      </div>

      {/* Table */}
      {sessionsLoading ? (
        <CardSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={48} />}
          title="No sessions found"
          description="No sessions match the selected filters for this month."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Date
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Batch
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Coach
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 text-center">
                  Plan
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Punch In
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Punch Out
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Late
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Rating
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((session) => (
                <SessionRow
                  key={`${session.batchId}-${session.id}`}
                  session={session}
                  batchName={batchMap.get(session.batchId) ?? session.batchId}
                  coachNames={
                    session.coachIds
                      .map((id) => coachMap.get(id) ?? id)
                      .join(', ') || '—'
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
