/**
 * Daily Roster — answers "who is coming on [day] at [centre] in each hour slot?"
 *
 * For every active batch at the selected centre that runs on the selected day,
 * the page groups enrolled students by their time slot. Shows name + plan.
 * No payment data shown.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarDays, Users } from 'lucide-react';
import { toast } from 'sonner';
import { getAllCentres } from '@/services/centreService';
import { getAllBatches } from '@/services/batchService';
import { getAllStudents } from '@/services/studentService';
import { getEnrollmentsByCentre } from '@/services/enrollmentService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { DAY_OF_WEEK_LABELS, DAY_OF_WEEK_SHORT } from '@bba/shared';
import type { CentreDocument, BatchDocument, StudentDocument, EnrollmentDocument, DayOfWeek } from '@bba/shared';

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0] as DayOfWeek[];

export default function RosterPage() {
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [centreId, setCentreId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(new Date().getDay() as DayOfWeek);

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

  // For each batch, group enrollments by time slot
  type SlotGroup = {
    slotKey: string; // "HH:mm" or "all" for single-slot batches
    label: string;
    enrollments: EnrollmentDocument[];
  };

  type BatchRoster = {
    batch: BatchDocument;
    slots: SlotGroup[];
    total: number;
  };

  const roster = useMemo((): BatchRoster[] => {
    return batchesForDay.map((batch) => {
      // Enrollments in this batch that include the selected day
      const batchEnrollments = enrollments.filter(
        (e) => e.batchId === batch.id && e.selectedDays.includes(dayOfWeek),
      );

      let slots: SlotGroup[];

      if (batch.timeSlots.length === 0) {
        // Single undivided batch
        slots = [{
          slotKey: 'all',
          label: `${batch.startTime}–${batch.endTime}`,
          enrollments: batchEnrollments,
        }];
      } else {
        // Group by time slot
        const slotMap = new Map<string, EnrollmentDocument[]>();
        // Initialise all defined slots (preserves order)
        batch.timeSlots.forEach((s) => slotMap.set(s.startTime, []));
        // Bucket with no slot assigned
        slotMap.set('unassigned', []);

        batchEnrollments.forEach((e) => {
          const key = e.timeSlotStartTime ?? 'unassigned';
          if (!slotMap.has(key)) slotMap.set(key, []);
          slotMap.get(key)!.push(e);
        });

        slots = batch.timeSlots.map((s) => ({
          slotKey: s.startTime,
          label: `${s.startTime}–${s.endTime}${s.label ? ` (${s.label})` : ''}`,
          enrollments: slotMap.get(s.startTime) ?? [],
        }));

        const unassigned = slotMap.get('unassigned') ?? [];
        if (unassigned.length > 0) {
          slots.push({ slotKey: 'unassigned', label: 'No slot assigned', enrollments: unassigned });
        }
      }

      return { batch, slots, total: batchEnrollments.length };
    });
  }, [batchesForDay, enrollments, dayOfWeek]);

  const grandTotal = roster.reduce((sum, r) => sum + r.total, 0);

  return (
    <div>
      {/* Header + filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Daily Roster</h1>
          <p className="text-sm text-gray-500">
            {grandTotal} student{grandTotal !== 1 ? 's' : ''} expected
            {' · '}{DAY_OF_WEEK_LABELS[dayOfWeek]}
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
          {roster.map(({ batch, slots, total }) => (
            <div key={batch.id} className="card">
              {/* Batch header */}
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-brand-secondary">{batch.name}</h2>
                  <p className="text-xs text-gray-400">
                    {batch.startTime}–{batch.endTime} · {batch.level}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-brand-primary-light px-3 py-1">
                  <Users size={13} className="text-brand-primary" />
                  <span className="text-sm font-bold text-brand-primary">{total}</span>
                </div>
              </div>

              {/* Slots */}
              <div className="space-y-3">
                {slots.map((slot) => (
                  <div key={slot.slotKey}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-xs font-semibold text-brand-secondary">
                        {slot.label}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        {slot.enrollments.length}
                      </span>
                    </div>
                    {slot.enrollments.length === 0 ? (
                      <p className="text-xs text-gray-400">No students in this slot.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {slot.enrollments.map((e) => {
                          const s = studentMap.get(e.studentId);
                          return (
                            <div
                              key={e.id}
                              className="flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1"
                            >
                              <span className="text-xs text-gray-700">
                                {s?.name ?? e.studentId}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {e.daysPerWeek}d/wk
                              </span>
                            </div>
                          );
                        })}
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
