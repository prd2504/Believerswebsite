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
import { RuiaAttendance } from '@/components/attendance/RuiaAttendance';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { RUIA_CENTRE_CODE } from '@bba/shared';
import type { BatchDocument, CentreDocument } from '@bba/shared';

const ALL = '__all__';
const RUIA = '__ruia__';

export default function CoachAttendance() {
  const { profile } = useAuth();
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [centreFilter, setCentreFilter] = useState<string>(ALL);
  const [loading, setLoading] = useState(true);

  /**
   * `silent` exists because this doubles as the post-save refresh. Flipping
   * `loading` there swapped the whole page for a skeleton, which unmounted the
   * register the coach had just submitted and re-rendered it blank — from the
   * coach's side that is indistinguishable from the button having done
   * nothing at all.
   */
  const load = useCallback(async (silent = false) => {
    if (!profile) return;
    try {
      if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  /**
   * Ruia is reached by CENTRE access, not by batch assignment.
   *
   * Every other centre gives a coach batches to be assigned to; Ruia has none,
   * because it runs on slot bookings. Gating it on batches — as the filter
   * below does for everywhere else — is why the Ruia coach had no way in at
   * all: no batch meant no centre chip, and no centre chip meant no register.
   */
  const ruiaCentre = useMemo(
    () => centres.find((c) => c.centreCode === RUIA_CENTRE_CODE) ?? null,
    [centres],
  );
  const hasRuia = !!ruiaCentre && (
    profile?.allCentreAccess === true || (profile?.centreIds ?? []).includes(ruiaCentre.id)
  );

  // Only the centres this coach actually has active batches in — a centre they
  // can nominally access but have no batch at would be a dead filter option.
  const myCentres = useMemo(() => {
    const ids = new Set(batches.map((b) => b.centreId));
    return centres.filter((c) => ids.has(c.id));
  }, [batches, centres]);

  const visibleBatches = useMemo(
    () => (centreFilter === ALL || centreFilter === RUIA
      ? batches
      : batches.filter((b) => b.centreId === centreFilter)),
    [batches, centreFilter],
  );

  // A coach with Ruia access and no batches anywhere else has exactly one
  // register to mark, so don't make them pick it from a list of one.
  const showRuia = hasRuia && (centreFilter === RUIA || batches.length === 0);

  // A stale filter (batch reassigned away while the page was open) would
  // otherwise show an empty register with no explanation.
  useEffect(() => {
    if (centreFilter === ALL || centreFilter === RUIA) return;
    if (!myCentres.some((c) => c.id === centreFilter)) setCentreFilter(ALL);
  }, [myCentres, centreFilter]);

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">Mark Attendance</h1>
        <CardSkeleton count={2} />
      </div>
    );
  }

  if (batches.length === 0 && !hasRuia) {
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

      {(myCentres.length + (hasRuia ? 1 : 0)) > 1 && (
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
            {hasRuia && (
              <button
                type="button"
                onClick={() => setCentreFilter(RUIA)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  centreFilter === RUIA
                    ? 'border-brand-primary bg-brand-primary text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                )}
              >
                {ruiaCentre?.name ?? 'Ruia College'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card">
        {profile && (showRuia ? (
          <RuiaAttendance userId={profile.id} />
        ) : (
          <QuickAttendance
            batches={visibleBatches}
            userId={profile.id}
            onDone={() => load(true)}
          />
        ))}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-gray-400">
        <Info size={12} className="mt-0.5 shrink-0" />
        {showRuia
          ? 'This is the same daily roster the office sees — anyone with a paid booking for today, grouped by their slot. If someone is missing, their booking may not list today as one of their days.'
          : 'Only students whose enrolment includes today appear here. If someone is missing, their enrolled days may not cover today — ask your admin to check.'}
      </p>
    </div>
  );
}
