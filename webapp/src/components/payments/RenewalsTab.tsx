/**
 * Renewals — who is paid up, until when, and who lapses next.
 *
 * Built for the centre manager: the question "how many are on quarterly, and
 * whose fees run out this month?" previously required exporting payments and
 * pivoting by hand. Reads the coverage window every payment now carries, so
 * monthly and quarterly sit in one list rather than needing separate handling.
 */

import { useMemo, useState } from 'react';
import { CalendarClock, AlertTriangle, CheckCircle2, Repeat } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  formatINR,
  formatMonthLabel,
  monthRank,
  paymentCoverage,
  addMonths,
} from '@bba/shared';
import type { PaymentDocument, CentreDocument, StudentDocument } from '@bba/shared';

interface RenewalRow {
  studentId: string;
  studentName: string;
  centreId: string;
  isQuarterly: boolean;
  coverageEnd: string;
  amountPaise: number;
  /** Months until coverage runs out. 0 = lapses at the end of this month. */
  monthsLeft: number;
}

export function RenewalsTab({
  payments,
  centres,
  students,
  currentMonth,
}: {
  payments: PaymentDocument[];
  centres: CentreDocument[];
  students: StudentDocument[];
  currentMonth: string;
}) {
  const [centreFilter, setCentreFilter] = useState('');

  const studentMap = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [students]);

  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  /**
   * One row per student: their furthest-reaching payment.
   *
   * A student may have several payments; what matters for renewal is the one
   * that runs out last. Refunded and waived payments are excluded because they
   * no longer hold the months they covered.
   */
  const rows = useMemo((): RenewalRow[] => {
    const best = new Map<string, RenewalRow>();
    const nowRank = monthRank(currentMonth);

    payments
      .filter((p) => p.status !== 'REFUNDED' && p.status !== 'WAIVED')
      .forEach((p) => {
        const cov = paymentCoverage(p);
        // Already-lapsed coverage isn't a renewal question, it's a collection
        // one — the Overdue view already handles those.
        if (monthRank(cov.end) < nowRank) return;

        const row: RenewalRow = {
          studentId: p.studentId,
          studentName: studentMap.get(p.studentId) ?? p.studentId,
          centreId: p.centreId,
          isQuarterly: cov.months > 1,
          coverageEnd: cov.end,
          amountPaise: p.totalAmountPaise,
          monthsLeft: monthRank(cov.end) - nowRank,
        };

        const existing = best.get(p.studentId);
        if (!existing || monthRank(row.coverageEnd) > monthRank(existing.coverageEnd)) {
          best.set(p.studentId, row);
        }
      });

    return Array.from(best.values())
      .filter((r) => !centreFilter || r.centreId === centreFilter)
      .sort(
        (a, b) =>
          monthRank(a.coverageEnd) - monthRank(b.coverageEnd) ||
          a.studentName.localeCompare(b.studentName),
      );
  }, [payments, studentMap, centreFilter, currentMonth]);

  const expiringNow = rows.filter((r) => r.monthsLeft === 0);
  const expiringNext = rows.filter((r) => r.monthsLeft === 1);
  const quarterlyCount = rows.filter((r) => r.isQuarterly).length;

  const groups: { key: string; title: string; rows: RenewalRow[]; tone: string }[] = [
    {
      key: 'now',
      title: `Lapses after ${formatMonthLabel(currentMonth)} — collect now`,
      rows: expiringNow,
      tone: 'border-red-200 bg-red-50',
    },
    {
      key: 'next',
      title: `Lapses after ${formatMonthLabel(addMonths(currentMonth, 1))}`,
      rows: expiringNext,
      tone: 'border-amber-200 bg-amber-50',
    },
    {
      key: 'later',
      title: 'Paid further ahead',
      rows: rows.filter((r) => r.monthsLeft >= 2),
      tone: 'border-green-100 bg-green-50',
    },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Renewals</h1>
          <p className="text-sm text-gray-500">
            Who is paid up and until when, as of {formatMonthLabel(currentMonth)}
          </p>
        </div>
        <select
          value={centreFilter}
          onChange={(e) => setCentreFilter(e.target.value)}
          className="input w-auto py-2 text-sm"
        >
          <option value="">All centres</option>
          {centres.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-lg bg-red-50 p-2"><AlertTriangle size={18} className="text-red-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Lapses this month</p>
            <p className="text-lg font-bold text-red-600">{expiringNow.length}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-lg bg-amber-50 p-2"><CalendarClock size={18} className="text-amber-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Lapses next month</p>
            <p className="text-lg font-bold text-amber-600">{expiringNext.length}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-lg bg-blue-50 p-2"><Repeat size={18} className="text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-500">On quarterly</p>
            <p className="text-lg font-bold text-brand-secondary">{quarterlyCount}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-lg bg-green-50 p-2"><CheckCircle2 size={18} className="text-green-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Paid up total</p>
            <p className="text-lg font-bold text-brand-secondary">{rows.length}</p>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center">
          <CalendarClock size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-600">Nobody is currently paid up</p>
          <p className="mt-1 text-xs text-gray-400">
            Coverage appears here once payments are recorded for {formatMonthLabel(currentMonth)} or later.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.filter((g) => g.rows.length > 0).map((g) => (
            <div key={g.key} className={cn('rounded-xl border p-4', g.tone)}>
              <h3 className="mb-3 text-sm font-bold text-brand-secondary">
                {g.title} <span className="font-normal text-gray-500">· {g.rows.length}</span>
              </h3>
              <div className="overflow-x-auto rounded-lg bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Student</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 hidden sm:table-cell">Centre</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Plan</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Paid through</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 hidden lg:table-cell">Last paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {g.rows.map((r) => (
                      <tr key={r.studentId} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-brand-secondary">{r.studentName}</td>
                        <td className="hidden px-3 py-2 text-gray-500 sm:table-cell">
                          {centreMap.get(r.centreId) ?? r.centreId}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            r.isQuarterly ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600',
                          )}>
                            {r.isQuarterly ? 'Quarterly' : 'Monthly'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-700">
                          {formatMonthLabel(r.coverageEnd)}
                        </td>
                        <td className="hidden px-3 py-2 text-right text-gray-500 lg:table-cell">
                          {formatINR(r.amountPaise, { withDecimals: false })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
