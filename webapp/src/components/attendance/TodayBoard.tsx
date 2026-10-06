/**
 * Today's board — every session that should run on a date, whether its
 * register was taken (on time / late / missing / not held), and the headcount
 * against who was expected. Plus coach punctuality month-to-date from the
 * nightly /attendanceDaily records.
 *
 * Same rules as the watchdog and nightly email (shared register.ts), so the
 * board, the reminders and the email never disagree.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cn } from '@/lib/cn';
import { getActiveEnrollments } from '@/services/enrollmentService';
import { getAttendanceRecords, getSession } from '@/services/attendanceService';
import { getAllCoaches } from '@/services/userService';
import {
  COLLECTIONS,
  batchEndTime,
  formatMonthLabel,
  isExpectedOnRegister,
  istNow,
  registerFeeState,
  registerStatus,
  type AttendanceDailyDocument,
  type BatchDocument,
  type CentreDocument,
  type EnrollmentDocument,
  type RegisterStatus,
  type StudentDocument,
} from '@bba/shared';

interface BoardRow {
  batch: BatchDocument;
  endTime: string;
  status: RegisterStatus;
  takenAt: string | null;
  minutesAfterEnd: number | null;
  notHeldReason: string | null;
  expected: number;
  present: number;
  absent: number;
  unpaidPresent: string[];
  trials: number;
}

const STATUS_STYLE: Record<RegisterStatus, [string, string]> = {
  ON_TIME: ['On time', 'bg-green-100 text-green-700'],
  LATE: ['Late', 'bg-amber-100 text-amber-800'],
  PENDING: ['Due', 'bg-sky-100 text-sky-700'],
  MISSING: ['Missing', 'bg-red-100 text-red-700'],
  NOT_HELD: ['Not held', 'bg-gray-100 text-gray-600'],
};

function clock(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
}

export function TodayBoard({
  batches, centres, students, centreFilter,
}: {
  batches: BatchDocument[];
  centres: CentreDocument[];
  students: StudentDocument[];
  centreFilter: string;
}) {
  const [date, setDate] = useState(() => istNow().date);
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [coachNames, setCoachNames] = useState<Map<string, string>>(new Map());
  const [monthDocs, setMonthDocs] = useState<AttendanceDailyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const month = date.slice(0, 7);
      const [enrollments, coaches, dailySnap] = await Promise.all([
        getActiveEnrollments(),
        getAllCoaches().catch(() => []),
        getDocs(query(
          collection(db, COLLECTIONS.attendanceDaily),
          where(documentId(), '>=', `${month}-01`),
          where(documentId(), '<=', `${month}-31`),
        )).catch(() => null),
      ]);
      setCoachNames(new Map(coaches.map((c) => [c.id, c.name])));
      setMonthDocs(dailySnap ? dailySnap.docs.map((d) => d.data() as AttendanceDailyDocument) : []);

      const stateOf = (e: EnrollmentDocument | undefined, studentId: string) => {
        const s = studentById.get(studentId);
        if (!s?.feeMonths) return 'PAID' as const;
        return registerFeeState({
          feeMonths: s.feeMonths, enrolledOn: e?.startDate, pausedMonths: e?.pausedMonths, sessionDate: date,
        });
      };

      const active = batches.filter((b) => b.status === 'ACTIVE');
      const built = await Promise.all(active.map(async (batch): Promise<BoardRow | null> => {
        const todays = enrollments.filter((e) =>
          e.batchId === batch.id && e.selectedDays.includes(weekday as never) &&
          studentById.get(e.studentId)?.status === 'ACTIVE');
        const expected = todays.filter((e) => isExpectedOnRegister(stateOf(e, e.studentId))).length;
        const session = await getSession(batch.id, date).catch(() => null);
        if (!(batch.offeredDays.includes(weekday as never) && expected > 0) && !session) return null;

        const endTime = batchEndTime(batch);
        const takenAt = session?.firstTakenAt ?? session?.endedAt ?? null;
        const { status, minutesAfterEnd } = registerStatus({
          sessionDate: date, endTime, takenAt, cancelled: !!session?.cancelled, nowMs: Date.now(),
        });

        let present = 0;
        let absent = 0;
        let trials = 0;
        const unpaidPresent: string[] = [];
        if (session && !session.cancelled && takenAt) {
          const recs = await getAttendanceRecords(batch.id, date).catch(() => []);
          recs.forEach((r) => {
            const here = r.status === 'PRESENT' || r.status === 'LATE';
            if (r.attendeeType === 'TRIAL') { if (here) trials++; return; }
            if (here) present++; else if (r.status === 'ABSENT') absent++;
            if (here && r.studentId) {
              const e = enrollments.find((x) => x.studentId === r.studentId && x.batchId === batch.id);
              if (stateOf(e, r.studentId) === 'UNPAID') unpaidPresent.push(studentById.get(r.studentId)?.name ?? r.studentId);
            }
          });
        }
        return {
          batch, endTime, status, takenAt, minutesAfterEnd,
          notHeldReason: session?.cancelled ? (session.cancellationReason ?? 'Not held') : null,
          expected, present, absent, unpaidPresent, trials,
        };
      }));
      setRows(built.filter((r): r is BoardRow => r !== null)
        .sort((a, b) => a.batch.startTime.localeCompare(b.batch.startTime)));
    } catch (err) {
      console.error(err);
      setError((err as Error)?.message ?? 'Could not load the board');
    } finally {
      setLoading(false);
    }
  }, [date, batches, studentById]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(
    () => (centreFilter ? rows.filter((r) => r.batch.centreId === centreFilter) : rows),
    [rows, centreFilter],
  );

  const tally = useMemo(() => {
    const t: Record<RegisterStatus, number> = { ON_TIME: 0, LATE: 0, PENDING: 0, MISSING: 0, NOT_HELD: 0 };
    visible.forEach((r) => { t[r.status]++; });
    return t;
  }, [visible]);

  const present = visible.reduce((n, r) => n + r.present, 0);
  const expected = visible.filter((r) => r.status !== 'NOT_HELD').reduce((n, r) => n + r.expected, 0);

  const coachMonth = useMemo(() => {
    const m = new Map<string, { expected: number; onTime: number; late: number; missing: number }>();
    monthDocs.forEach((d) => (d.sessions ?? []).forEach((s) => {
      if (s.status === 'NOT_HELD') return;
      if (centreFilter && s.centreId !== centreFilter) return;
      (s.coachIds.length ? s.coachIds : ['__none__']).forEach((id) => {
        const c = m.get(id) ?? { expected: 0, onTime: 0, late: 0, missing: 0 };
        c.expected++;
        if (s.status === 'ON_TIME') c.onTime++;
        else if (s.status === 'LATE') c.late++;
        else c.missing++;
        m.set(id, c);
      });
    }));
    return Array.from(m.entries())
      .map(([id, c]) => ({ id, name: id === '__none__' ? 'No coach assigned' : (coachNames.get(id) ?? 'Unknown'), ...c }))
      .sort((a, b) => a.onTime / a.expected - b.onTime / b.expected);
  }, [monthDocs, coachNames, centreFilter]);

  const centreName = (id: string) => centres.find((c) => c.id === id)?.name ?? id;
  const byCentre = useMemo(() => {
    const m = new Map<string, BoardRow[]>();
    visible.forEach((r) => {
      const list = m.get(r.batch.centreId) ?? [];
      list.push(r);
      m.set(r.batch.centreId, list);
    });
    return Array.from(m.entries());
  }, [visible]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="label">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-auto" />
        </div>
        <button type="button" onClick={load} className="btn-secondary text-sm" disabled={loading}>
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(['ON_TIME', 'LATE', 'MISSING', 'PENDING', 'NOT_HELD'] as RegisterStatus[]).map((s) => (
          <div key={s} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
            <p className="text-[11px] text-gray-500">{STATUS_STYLE[s][0]}</p>
            <p className={cn('text-lg font-bold', s === 'MISSING' && tally[s] ? 'text-red-600' : 'text-brand-secondary')}>{tally[s]}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-gray-600">
        <strong>{present}</strong> of <strong>{expected}</strong> expected students attended.
        <span className="ml-1 text-xs text-gray-400">
          Expected = paid for {formatMonthLabel(date.slice(0, 7))}, last month&apos;s payers until the 7th, and new joiners.
        </span>
      </p>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />)}</div>
      ) : byCentre.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No sessions expected on this date.</p>
      ) : byCentre.map(([cid, list]) => (
        <div key={cid} className="rounded-xl border border-gray-100">
          <p className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-semibold text-brand-secondary">{centreName(cid)}</p>
          <div className="divide-y divide-gray-50">
            {list.map((r) => {
              const [label, style] = STATUS_STYLE[r.status];
              const coaches = r.batch.coachIds.map((id) => coachNames.get(id) ?? '?').join(', ');
              return (
                <div key={r.batch.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-brand-secondary">{r.batch.name}</p>
                    <p className="text-xs text-gray-400">
                      {r.batch.startTime}–{r.endTime} · {coaches || <span className="text-red-600">no coach assigned</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn('rounded-full px-2 py-0.5 font-semibold', style)}>{label}</span>
                    {r.notHeldReason && <span className="text-gray-500">{r.notHeldReason}</span>}
                    {r.takenAt && (
                      <span className="text-gray-400">
                        {clock(r.takenAt)}{r.status === 'LATE' && r.minutesAfterEnd ? ` · ${Math.round(r.minutesAfterEnd / 6) / 10}h after` : ''}
                      </span>
                    )}
                    {r.takenAt && r.status !== 'NOT_HELD' && (
                      <span className="text-gray-600">
                        <span className="font-semibold text-green-700">{r.present}P</span> / <span className="text-red-600">{r.absent}A</span> · {r.expected} expected
                      </span>
                    )}
                    {!r.takenAt && r.status !== 'NOT_HELD' && <span className="text-gray-500">{r.expected} expected</span>}
                    {r.trials > 0 && <span className="rounded-full bg-pink-50 px-2 py-0.5 text-pink-700">{r.trials} trial</span>}
                    {r.unpaidPresent.length > 0 && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700" title={r.unpaidPresent.join(', ')}>
                        {r.unpaidPresent.length} unpaid present
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-gray-100">
        <p className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-semibold text-brand-secondary">
          Coach punctuality — {formatMonthLabel(date.slice(0, 7))}
        </p>
        {coachMonth.length === 0 ? (
          <p className="px-4 py-3 text-xs text-gray-400">
            Filled in nightly at 10:30 PM — nothing recorded for this month yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2">Coach</th>
                <th className="px-4 py-2 text-right">On time</th>
                <th className="px-4 py-2 text-right">Late</th>
                <th className="px-4 py-2 text-right">Missing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {coachMonth.map((c) => {
                const pct = Math.round((c.onTime / c.expected) * 100);
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-2">{c.name}</td>
                    <td className={cn('px-4 py-2 text-right font-semibold', pct >= 90 ? 'text-green-700' : pct >= 70 ? 'text-amber-700' : 'text-red-600')}>
                      {pct}% <span className="font-normal text-gray-400">({c.onTime}/{c.expected})</span>
                    </td>
                    <td className="px-4 py-2 text-right">{c.late}</td>
                    <td className={cn('px-4 py-2 text-right', c.missing && 'text-red-600')}>{c.missing}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="px-4 pb-3 text-[11px] text-gray-400">On time = saved within an hour of the session ending. Sessions marked not held don&apos;t count.</p>
      </div>
    </div>
  );
}
