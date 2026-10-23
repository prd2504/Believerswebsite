/**
 * Pending Fees — students who attended but have no payment covering the month.
 *
 * Reads the monthly report the Cloud Function stores, rather than joining
 * attendance to payments in the browser. That join means reading every
 * attendance record for every batch, which is far too expensive to do on a
 * page load; the stored report is a handful of document reads.
 *
 * Consequence worth knowing: this shows the state as of the last run, not
 * live. The generated-at time is displayed so it's never mistaken for live.
 */

import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Users, Clock } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cn } from '@/lib/cn';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import {
  COLLECTIONS,
  formatINR,
  formatMonthLabel,
  unpaidRows,
  type FeeAttendanceReport,
} from '@bba/shared';

export function PendingFeesTab({ month }: { month: string }) {
  const [reports, setReports] = useState<FeeAttendanceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getDocs(query(
      collection(db, COLLECTIONS.feeAttendanceReports),
      where('yearMonth', '==', month),
    ))
      .then((snap) => {
        if (cancelled) return;
        setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FeeAttendanceReport));
      })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  const totals = useMemo(() => reports.reduce((a, r) => ({
    attended: a.attended + (r.totals?.studentsAttended ?? 0),
    unpaid: a.unpaid + (r.totals?.unpaidCount ?? 0),
    sessions: a.sessions + (r.totals?.unpaidSessions ?? 0),
    due: a.due + (r.totals?.estimatedDuePaise ?? 0),
  }), { attended: 0, unpaid: 0, sessions: 0, due: 0 }), [reports]);

  const generatedAt = reports[0]?.generatedAt;

  if (loading) return <CardSkeleton count={3} />;

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Couldn&apos;t load the report: {error}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Clock size={40} className="mx-auto mb-3 text-gray-300" />
        <p className="text-sm font-medium text-gray-600">
          No report yet for {formatMonthLabel(month)}
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-gray-400">
          Reports are generated automatically on the 8th of each month, a day after fees
          are due. Nothing has been computed for this month yet.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Pending Fees</h1>
          <p className="text-sm text-gray-500">
            Attended {formatMonthLabel(month)} with no payment on record
          </p>
        </div>
        {generatedAt && (
          <p className="flex items-center gap-1.5 text-xs text-gray-400">
            <RefreshCw size={11} />
            As of {new Date(generatedAt).toLocaleString('en-IN', {
              day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
            })}
          </p>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-lg bg-red-50 p-2"><AlertTriangle size={18} className="text-red-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Unpaid</p>
            <p className="text-lg font-bold text-red-600">{totals.unpaid}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-lg bg-amber-50 p-2"><Users size={18} className="text-amber-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Sessions used unpaid</p>
            <p className="text-lg font-bold text-amber-600">{totals.sessions}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-lg bg-blue-50 p-2"><CheckCircle2 size={18} className="text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Attended total</p>
            <p className="text-lg font-bold text-brand-secondary">{totals.attended}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-lg bg-gray-100 p-2"><AlertTriangle size={18} className="text-gray-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Approx. outstanding</p>
            <p className="text-lg font-bold text-brand-secondary">
              {formatINR(totals.due, { withDecimals: false })}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {reports
          .slice()
          .sort((a, b) => (b.totals?.unpaidCount ?? 0) - (a.totals?.unpaidCount ?? 0))
          .map((r) => {
            const unpaid = unpaidRows(r);
            if ((r.totals?.studentsAttended ?? 0) === 0) return null;
            return (
              <div key={r.id} className="card">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-brand-secondary">{r.centreName}</h3>
                  <span className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    unpaid.length === 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
                  )}>
                    {unpaid.length === 0
                      ? `All ${r.totals.studentsAttended} paid`
                      : `${unpaid.length} of ${r.totals.studentsAttended} unpaid`}
                  </span>
                </div>

                {unpaid.length === 0 ? (
                  <p className="text-xs text-gray-400">Everyone who attended has paid.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-gray-50 text-left">
                        <tr>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Student</th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 hidden sm:table-cell">Batch</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Sessions</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Fee due</th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 hidden lg:table-cell">Phone</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {unpaid.map((x) => (
                          <tr key={x.studentId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-brand-secondary">
                              {x.studentName}
                              {x.externalStudentId && (
                                <span className="ml-1 font-mono text-[10px] text-gray-400">{x.externalStudentId}</span>
                              )}
                            </td>
                            <td className="hidden px-3 py-2 text-gray-500 sm:table-cell">{x.batchName}</td>
                            <td className="px-3 py-2 text-center font-semibold text-red-600">{x.sessionsAttended}</td>
                            <td className="px-3 py-2 text-right text-gray-700">
                              {x.expectedFeePaise ? formatINR(x.expectedFeePaise, { withDecimals: false }) : '—'}
                            </td>
                            <td className="hidden px-3 py-2 text-gray-500 lg:table-cell">{x.phone ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      <p className="mt-4 text-[11px] text-gray-400">
        Trials and walk-ins are excluded — they aren&apos;t enrolled and owe no monthly fee.
        Quarterly payers count as paid for every month their payment covers.
      </p>
    </div>
  );
}
