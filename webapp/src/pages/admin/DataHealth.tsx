/**
 * Data health — every record that is incomplete or inconsistent, grouped by
 * what it breaks, so the centre manager can work through it as a checklist.
 *
 * Computed live from the same collections the app runs on; nothing stored.
 * "Copy for WhatsApp" turns any list into plain text to hand off.
 */

import { useEffect, useMemo, useState } from 'react';
import { Copy, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { getAllStudents } from '@/services/studentService';
import { getActiveEnrollments } from '@/services/enrollmentService';
import { getAllBatches } from '@/services/batchService';
import { getAllCentres } from '@/services/centreService';
import { getAllCoaches } from '@/services/userService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { istNow, isFeeExemptCentre } from '@bba/shared';
import type {
  BatchDocument, CentreDocument, EnrollmentDocument, StudentDocument, UserDocument,
} from '@bba/shared';
import { buildChecks, SEVERITY_STYLE, type Check } from '@/lib/dataHealth';

export default function DataHealthPage() {
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentDocument[]>([]);
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [coaches, setCoaches] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [centreFilter, setCentreFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const month = istNow().date.slice(0, 7);

  useEffect(() => {
    Promise.all([getAllStudents(), getActiveEnrollments(), getAllBatches(), getAllCentres(), getAllCoaches().catch(() => [])])
      .then(([s, e, b, c, co]) => { setStudents(s); setEnrollments(e); setBatches(b); setCentres(c); setCoaches(co); })
      .catch((err) => { console.error(err); toast.error('Could not load data'); })
      .finally(() => setLoading(false));
  }, []);

  const centreName = (id: string) => centres.find((c) => c.id === id)?.name ?? '—';

  const checks = useMemo(() => {
    const feeExemptCentreIds = new Set(centres.filter((c) => isFeeExemptCentre(c.centreCode)).map((c) => c.id));
    const all = buildChecks({ students, enrollments, batches, coaches, month, feeExemptCentreIds });
    return all.map((c) => ({
      ...c,
      items: (centreFilter ? c.items.filter((i) => i.centreId === centreFilter) : c.items)
        .sort((a, b) => centreName(a.centreId).localeCompare(centreName(b.centreId)) || a.name.localeCompare(b.name)),
    }));
    // centreName depends only on centres
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, enrollments, batches, coaches, month, centreFilter, centres]);

  const total = checks.reduce((t, c) => t + c.items.length, 0);

  function copy(c: Check) {
    const lines = [
      `*${c.title}* (${c.items.length})${centreFilter ? ` — ${centreName(centreFilter)}` : ''}`,
      `How to fix: ${c.fix}`,
      '',
      ...c.items.map((i, n) => `${n + 1}. ${i.name}${centreFilter ? '' : ` (${centreName(i.centreId)})`}${i.phone ? ` · ${i.phone}` : ''} — ${i.detail}`),
    ];
    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => toast.success('Copied — paste it into WhatsApp'))
      .catch(() => toast.error('Copy failed'));
  }

  if (loading) {
    return <div><h1 className="mb-6 text-xl font-bold text-brand-secondary">Data health</h1><CardSkeleton count={4} /></div>;
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Data health</h1>
          <p className="text-sm text-gray-500">
            {total === 0 ? 'Everything is complete.' : `${total} item${total === 1 ? '' : 's'} to fix — work top to bottom.`}
          </p>
        </div>
        <select value={centreFilter} onChange={(e) => setCentreFilter(e.target.value)} className="input w-auto py-2 text-sm">
          <option value="">All centres</option>
          {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {checks.map((c) => (
          <div key={c.id} className="card p-0">
            <button
              type="button"
              onClick={() => setOpen(open === c.id ? null : c.id)}
              className="flex w-full items-start justify-between gap-3 p-4 text-left"
              disabled={c.items.length === 0}
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-brand-secondary">
                  {c.title}
                  {c.items.length > 0 && (
                    <span className={cn('rounded-full px-2 py-0.5 text-xs', SEVERITY_STYLE[c.severity])}>{c.items.length}</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">{c.why}</p>
              </div>
              {c.items.length === 0 && <ShieldCheck size={18} className="shrink-0 text-green-600" />}
            </button>
            {open === c.id && c.items.length > 0 && (
              <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-gray-600"><strong>Fix:</strong> {c.fix}</p>
                  <button type="button" onClick={() => copy(c)} className="btn-secondary text-xs">
                    <Copy size={13} /> Copy for WhatsApp
                  </button>
                </div>
                <ul className="divide-y divide-gray-50 text-sm">
                  {c.items.map((i) => (
                    <li key={i.key} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium text-brand-secondary">
                        {i.name}
                        {!centreFilter && <span className="ml-1.5 text-xs font-normal text-gray-400">{centreName(i.centreId)}</span>}
                      </span>
                      <span className="text-xs text-gray-500">{i.detail}{i.phone ? ` · ${i.phone}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
