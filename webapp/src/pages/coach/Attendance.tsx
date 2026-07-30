/**
 * Coach attendance page — unified view of all expected students across assigned
 * batches for a given day. Coach marks absences (all default PRESENT).
 *
 * A coach assigned to more than one centre gets a centre filter, so they mark
 * one centre's register at a time instead of scrolling a merged list.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ClipboardCheck, Building2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { getBatchesByCoach } from '@/services/batchService';
import { getAllCentres } from '@/services/centreService';
import { QuickAttendance } from '@/components/attendance/QuickAttendance';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import type { BatchDocument, CentreDocument } from '@bba/shared';

const ALL = '__all__';

export default function CoachAttendance() {
  const { profile } = useAuth();
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [centreFilter, setCentreFilter] = useState<string>(ALL);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const [bData, cData] = await Promise.all([
        getBatchesByCoach(profile.id),
        getAllCentres(),
      ]);
      setBatches(bData.filter((b) => b.status === 'ACTIVE'));
      setCentres(cData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load your batches');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  // Only the centres this coach actually has active batches in — a centre they
  // can nominally access but have no batch at would be a dead filter option.
  const myCentres = useMemo(() => {
    const ids = new Set(batches.map((b) => b.centreId));
    return centres.filter((c) => ids.has(c.id));
  }, [batches, centres]);

  const visibleBatches = useMemo(
    () => (centreFilter === ALL ? batches : batches.filter((b) => b.centreId === centreFilter)),
    [batches, centreFilter],
  );

  // A stale filter (batch reassigned away while the page was open) would
  // otherwise show an empty register with no explanation.
  useEffect(() => {
    if (centreFilter !== ALL && !myCentres.some((c) => c.id === centreFilter)) {
      setCentreFilter(ALL);
    }
  }, [myCentres, centreFilter]);

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">Mark Attendance</h1>
        <CardSkeleton count={2} />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">Mark Attendance</h1>
        <EmptyState
          icon={<ClipboardCheck size={48} />}
          title="No active batches"
          description="You are not assigned to any active batches yet. Note that centre access alone is not enough — ask your admin to assign you the specific batch."
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="mb-1 text-lg font-bold text-brand-secondary">Mark Attendance</h1>
      <p className="mb-3 text-xs text-gray-500">
        Everyone is marked present by default — just tap to mark absences.
      </p>

      {myCentres.length > 1 && (
        <div className="mb-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <Building2 size={13} /> Centre
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCentreFilter(ALL)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                centreFilter === ALL
                  ? 'border-brand-primary bg-brand-primary text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
              )}
            >
              All centres
            </button>
            {myCentres.map((c) => {
              const n = batches.filter((b) => b.centreId === c.id).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCentreFilter(c.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                    centreFilter === c.id
                      ? 'border-brand-primary bg-brand-primary text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                  )}
                >
                  {c.name}
                  <span className={cn('ml-1', centreFilter === c.id ? 'text-white/70' : 'text-gray-400')}>
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        {profile && (
          <QuickAttendance
            batches={visibleBatches}
            userId={profile.id}
            onDone={load}
          />
        )}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-gray-400">
        <Info size={12} className="mt-0.5 shrink-0" />
        Only students whose enrolment includes today appear here. If someone is missing,
        their enrolled days may not cover today — ask your admin to check.
      </p>
    </div>
  );
}
