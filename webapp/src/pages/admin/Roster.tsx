/**
 * Daily Roster — answers "who is coming on [day] at [centre] in each hour slot?"
 *
 * For every active batch at the selected centre that runs on the selected day,
 * the page groups enrolled students by their time slot. Shows name + plan.
 * No payment data shown.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarDays, Users, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { getAllCentres } from '@/services/centreService';
import { getAllBatches } from '@/services/batchService';
import { getAllStudents } from '@/services/studentService';
import { getEnrollmentsByCentre } from '@/services/enrollmentService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { DAY_OF_WEEK_LABELS, DAY_OF_WEEK_SHORT } from '@bba/shared';
import type { CentreDocument, BatchDocument, StudentDocument, EnrollmentDocument, DayOfWeek } from '@bba/shared';

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0] as DayOfWeek[];

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const PLAN_COLOR: Record<number, string> = {
  1: 'bg-gray-50 text-gray-600 border-gray-200',
  2: 'bg-blue-50 text-blue-700 border-blue-200',
  3: 'bg-purple-50 text-purple-700 border-purple-200',
  4: 'bg-orange-50 text-orange-700 border-orange-200',
  5: 'bg-green-50 text-green-700 border-green-200',
  6: 'bg-amber-50 text-amber-700 border-amber-200',
  7: 'bg-pink-50 text-pink-700 border-pink-200',
};
function planChipClass(days: number): string {
  return PLAN_COLOR[days] ?? 'bg-gray-50 text-gray-600 border-gray-200';
}

export default function RosterPage() {
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [centreId, setCentreId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(new Date().getDay() as DayOfWeek);
  const [month] = useState(currentMonth);

  const load = useCallback(async (cid: string) => {
    if (!cid) return;
    try {
      setLoading(true);
      const [bData, sData, eData] = await Promise.all([
        getAllBatches(),
        getAllStudents(),
        getEnrollmentsByCentre(cid),
      ]);
      setBatches(bData);
      setStudents(sData);
      setEnrollments(eData.filter((e) => e.status === 'ACTIVE'));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load roster');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getAllCentres().then((cData) => {
      setCentres(cData);
      if (cData.length > 0) {
        setCentreId(cData[0].id);
        load(cData[0].id);
      }
    });
  }, [load]);

  useEffect(() => {
    if (centreId) load(centreId);
  }, [centreId, load]);

  const studentMap = useMemo(() => {
    const m = new Map<string, StudentDocument>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  // Batches at this centre that run on the selected day
  const batchesForDay = useMemo(() =>
    batches.filter(
      (b) =>
        b.centreId === centreId &&
        b.status === 'ACTIVE' &&
        b.offeredDays.includes(dayOfWeek),
    ).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  [batches, centreId, dayOfWeek]);

  // For each batch, group enrollments by time slot, then by plan within each slot.
  // Plan groups within a slot reveal how many 2-day vs 3-day students are coming —
  // useful for coaches deciding which drills to run for which sub-group.
  type PlanGroup = {
    daysPerWeek: number;
    label: string;
    enrollments: EnrollmentDocument[];
  };

  type SlotGroup = {
    slotKey: string;
    label: string;
    planGroups: PlanGroup[];
    total: number;
  };

  type BatchRoster = {
    batch: BatchDocument;
    slots: SlotGroup[];
    total: number;
    /** Bookings that we filtered out so the user knows why a name is missing. */
    excludedCount: number;
  };

  function groupByPlan(items: EnrollmentDocument[]): PlanGroup[] {
    const map = new Map<number, EnrollmentDocument[]>();
    items.forEach((e) => {
      const arr = map.get(e.daysPerWeek) ?? [];
      arr.push(e);
      map.set(e.daysPerWeek, arr);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0]) // highest commitment first
      .map(([daysPerWeek, enrollments]) => ({
        daysPerWeek,
        label: `${daysPerWeek} day${daysPerWeek !== 1 ? 's' : ''} / week`,
        enrollments,
      }));
  }

  const roster = useMemo((): BatchRoster[] => {
    return batchesForDay.map((batch) => {
      // Enrollments in this batch that include the selected day. Exclude
      // enrollments paused for this month and students whose lifecycle status
      // isn't ACTIVE (DORMANT/ON_HOLD/LEFT/GRADUATED stay in the data but
      // don't show on the roster).
      const allForBatch = enrollments.filter(
        (e) => e.batchId === batch.id && e.selectedDays.includes(dayOfWeek),
      );
      const batchEnrollments = allForBatch.filter((e) => {
        if (e.pausedMonths?.includes(month)) return false;
        const s = studentMap.get(e.studentId);
        return s ? s.status === 'ACTIVE' : false;
      });
      const excluded = allForBatch.length - batchEnrollments.length;

      let slots: SlotGroup[];

      if (batch.timeSlots.length === 0) {
        // Single undivided batch — one slot containing all plan groups
        slots = [{
          slotKey: 'all',
          label: `${batch.startTime}–${batch.endTime}`,
          planGroups: groupByPlan(batchEnrollments),
          total: batchEnrollments.length,
        }];
      } else {
        // Group by time slot, then by plan within each slot
        const slotMap = new Map<string, EnrollmentDocument[]>();
        batch.timeSlots.forEach((s) => slotMap.set(s.startTime, []));
        slotMap.set('unassigned', []);

        batchEnrollments.forEach((e) => {
          const key = e.timeSlotStartTime ?? 'unassigned';
          if (!slotMap.has(key)) slotMap.set(key, []);
          slotMap.get(key)!.push(e);
        });

        slots = batch.timeSlots.map((s) => {
          const items = slotMap.get(s.startTime) ?? [];
          return {
            slotKey: s.startTime,
            label: `${s.startTime}–${s.endTime}${s.label ? ` (${s.label})` : ''}`,
            planGroups: groupByPlan(items),
            total: items.length,
          };
        });

        const unassigned = slotMap.get('unassigned') ?? [];
        if (unassigned.length > 0) {
          slots.push({
            slotKey: 'unassigned',
            label: 'No slot assigned',
            planGroups: groupByPlan(unassigned),
            total: unassigned.length,
          });
        }
      }

      return { batch, slots, total: batchEnrollments.length, excludedCount: excluded };
    });
  }, [batchesForDay, enrollments, dayOfWeek, month, studentMap]);

  const grandTotal = roster.reduce((sum, r) => sum + r.total, 0);
  const grandExcluded = roster.reduce((sum, r) => sum + r.excludedCount, 0);

  return (
    <div>
      {/* Header + filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Daily Roster</h1>
          <p className="text-sm text-gray-500">
            {grandTotal} student{grandTotal !== 1 ? 's' : ''} expected
            {' · '}{DAY_OF_WEEK_LABELS[dayOfWeek]}
            {grandExcluded > 0 && (
              <span className="ml-1 text-xs text-gray-400">
                · {grandExcluded} hidden (dormant / paused this month)
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={centreId}
            onChange={(e) => setCentreId(e.target.value)}
            className="input w-auto py-2 text-sm"
          >
            {centres.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="flex gap-1">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDayOfWeek(d)}
                className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition ${
                  dayOfWeek === d
                    ? 'border-brand-primary bg-brand-primary text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {DAY_OF_WEEK_SHORT[d]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <CardSkeleton count={4} />
      ) : roster.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={48} />}
          title="No batches on this day"
          description="No active batches at this centre run on the selected day."
        />
      ) : (
        <div className="space-y-4">
          {roster.map(({ batch, slots, total, excludedCount }) => (
            <div key={batch.id} className="card">
              {/* Batch header */}
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-brand-secondary">{batch.name}</h2>
                  <p className="text-xs text-gray-400">
                    {batch.startTime}–{batch.endTime} · {batch.level}
                    {excludedCount > 0 && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600">
                        <AlertCircle size={10} /> {excludedCount} hidden
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-brand-primary-light px-3 py-1">
                  <Users size={13} className="text-brand-primary" />
                  <span className="text-sm font-bold text-brand-primary">{total}</span>
                </div>
              </div>

              {/* Slots, each grouped by plan */}
              <div className="space-y-4">
                {slots.map((slot) => (
                  <div key={slot.slotKey} className="rounded-lg border border-gray-100 p-3">
                    {/* Slot header */}
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-brand-secondary">
                        {slot.label}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {slot.total} student{slot.total !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {slot.total === 0 ? (
                      <p className="text-xs italic text-gray-400">No students in this slot.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {slot.planGroups.map((pg) => (
                          <div key={pg.daysPerWeek}>
                            <div className="mb-1.5 flex items-center gap-2">
                              <span
                                className={cn(
                                  'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                  planChipClass(pg.daysPerWeek),
                                )}
                              >
                                {pg.label}
                              </span>
                              <span className="text-[11px] text-gray-400">
                                {pg.enrollments.length} student{pg.enrollments.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {pg.enrollments.map((e) => {
                                const s = studentMap.get(e.studentId);
                                return (
                                  <div
                                    key={e.id}
                                    className={cn(
                                      'rounded-full border px-2.5 py-0.5 text-xs',
                                      planChipClass(pg.daysPerWeek),
                                    )}
                                  >
                                    {s?.name ?? e.studentId}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
