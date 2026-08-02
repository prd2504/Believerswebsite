/**
 * Daily Roster — answers "who is coming on [day] at [centre] in each hour slot?"
 *
 * For every active batch at the selected centre that runs on the selected day,
 * the page groups enrolled students by their time slot. Shows name + plan.
 *
 * Admin/manager users can also add or remove students from batches directly
 * from this page (quick enrol/unenrol without navigating to Students page).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarDays, Users, AlertCircle, UserPlus, X, Search, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { getAllCentres } from '@/services/centreService';
import { getAllBatches } from '@/services/batchService';
import { getAllStudents } from '@/services/studentService';
import { getEnrollmentsByCentre, enrollStudent, endEnrollment } from '@/services/enrollmentService';
import { subscribeToBookings } from '@/services/slotBookingService';
import { buildDayRoster, ROSTER_STATUSES } from '@/lib/slotRoster';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import {
  DAY_OF_WEEK_LABELS,
  DAY_OF_WEEK_SHORT,
  UserRole,
  ADMIN_LIKE_ROLES,
  makeEnrollmentId,
  formatINR,
  RUIA_CENTRE_CODE,
  RUIA_SLOT_BOOKING_CENTRE_ID,
  SlotBookingStatus,
} from '@bba/shared';
import type {
  CentreDocument,
  BatchDocument,
  StudentDocument,
  EnrollmentDocument,
  SlotBookingDocument,
  DayOfWeek,
  FrequencyPlan,
} from '@bba/shared';

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0] as DayOfWeek[];

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const { profile } = useAuth();
  const isAdmin = profile && (ADMIN_LIKE_ROLES as readonly string[]).includes(profile.role);

  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [centreId, setCentreId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(new Date().getDay() as DayOfWeek);
  const [month] = useState(currentMonth);

  // Enrol dialog state
  const [enrolBatch, setEnrolBatch] = useState<BatchDocument | null>(null);
  // Unenrol confirmation
  const [unenrolTarget, setUnenrolTarget] = useState<{ enrollment: EnrollmentDocument; studentName: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Ruia runs on the slot-booking flow, not batches — students never get a
  // batch enrolment, they get a paid slotBooking. Without this the page could
  // only ever show "no batches scheduled", including for the Tue/Thu 6–7 AM
  // session that has real, paying bookings and simply has no batch to match.
  const [slotBookings, setSlotBookings] = useState<SlotBookingDocument[]>([]);
  const [slotBookingsLoading, setSlotBookingsLoading] = useState(true);

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

  // The slot-booking flow uses a fixed namespace id ('ruia-college') decoupled
  // from the real centre document, so the bridge from "selected centre" to
  // "which bookings to fetch" has to go via centreCode, not centreId.
  const selectedCentreDoc = useMemo(() => centres.find((c) => c.id === centreId), [centres, centreId]);
  const isRuia = selectedCentreDoc?.centreCode === RUIA_CENTRE_CODE;

  useEffect(() => {
    if (!isRuia) {
      setSlotBookings([]);
      return;
    }
    setSlotBookingsLoading(true);
    const unsub = subscribeToBookings(RUIA_SLOT_BOOKING_CENTRE_ID, month, (data) => {
      setSlotBookings(data);
      setSlotBookingsLoading(false);
    });
    return unsub;
  }, [isRuia, month]);

  const dayRoster = useMemo(() => buildDayRoster(slotBookings, dayOfWeek), [slotBookings, dayOfWeek]);

  // Paid/confirmed bookings with no captured day preference at all — legacy
  // records from before day-capture existed. Same across every day, so
  // computed once rather than off whichever day happens to be selected.
  const unassignedBookings = useMemo(
    () => slotBookings.filter((b) => ROSTER_STATUSES.has(b.status) && (!b.selectedDays || b.selectedDays.length === 0)),
    [slotBookings],
  );

  const studentMap = useMemo(() => {
    const m = new Map<string, StudentDocument>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  const batchesForDay = useMemo(() =>
    batches.filter(
      (b) =>
        b.centreId === centreId &&
        b.status === 'ACTIVE' &&
        b.offeredDays.includes(dayOfWeek),
    ).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  [batches, centreId, dayOfWeek]);

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
      .sort((a, b) => b[0] - a[0])
      .map(([daysPerWeek, enrollments]) => ({
        daysPerWeek,
        label: `${daysPerWeek} day${daysPerWeek !== 1 ? 's' : ''} / week`,
        enrollments,
      }));
  }

  const roster = useMemo((): BatchRoster[] => {
    return batchesForDay.map((batch) => {
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
        slots = [{
          slotKey: 'all',
          label: `${batch.startTime}–${batch.endTime}`,
          planGroups: groupByPlan(batchEnrollments),
          total: batchEnrollments.length,
        }];
      } else {
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

  async function handleQuickEnrol(
    studentId: string,
    batch: BatchDocument,
    plan: FrequencyPlan,
    selectedDays: DayOfWeek[],
    timeSlotStartTime: string | null,
  ) {
    if (!profile) return;
    setBusy(true);
    try {
      await enrollStudent(
        {
          studentId,
          batchId: batch.id,
          centreId: batch.centreId,
          daysPerWeek: plan.daysPerWeek,
          monthlyFeePaise: plan.monthlyFeePaise,
          selectedDays,
          timeSlotStartTime,
          startDate: todayStr(),
        },
        profile.id,
      );
      toast.success('Student enrolled — roster refreshed');
      setEnrolBatch(null);
      await load(centreId);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to enrol student');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnenrol() {
    if (!profile || !unenrolTarget) return;
    setBusy(true);
    try {
      await endEnrollment(unenrolTarget.enrollment.id, todayStr(), profile.id);
      toast.success(`${unenrolTarget.studentName} removed from batch`);
      setUnenrolTarget(null);
      await load(centreId);
    } catch (err) {
      console.error(err);
      toast.error('Failed to remove student');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Header + filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Daily Roster</h1>
          <p className="text-sm text-gray-500">
            {isRuia ? dayRoster.total : grandTotal} student{(isRuia ? dayRoster.total : grandTotal) !== 1 ? 's' : ''} expected
            {' · '}{DAY_OF_WEEK_LABELS[dayOfWeek]}
            {isRuia
              ? unassignedBookings.length > 0 && (
                  <span className="ml-1 text-xs text-amber-600">
                    · {unassignedBookings.length} paid booking{unassignedBookings.length !== 1 ? 's' : ''} with no day set
                  </span>
                )
              : grandExcluded > 0 && (
                  <span className="ml-1 text-xs text-gray-400">
                    · {grandExcluded} hidden (dormant / paused this month)
                  </span>
                )}
          </p>
          {isRuia && (
            <p className="mt-0.5 text-xs text-gray-400">
              Live from Slot Bookings — updates as parents pay and pick days.
            </p>
          )}
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

      {isRuia ? (
        slotBookingsLoading ? (
          <CardSkeleton count={2} />
        ) : (
          <div className="space-y-4">
            {unassignedBookings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <strong>{unassignedBookings.length}</strong> paid booking{unassignedBookings.length !== 1 ? 's' : ''} with no
                preferred day captured — not shown on any day below:{' '}
                {unassignedBookings.map((b) => b.participantName).join(', ')}
              </div>
            )}

            <div className="card">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-brand-secondary">Ruia College — Slot Bookings</h2>
                  <p className="text-xs text-gray-400">
                    Paid or confirmed bookings for {DAY_OF_WEEK_LABELS[dayOfWeek]}
                  </p>
                </div>
                <a
                  href="/admin/payments"
                  className="flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline"
                >
                  Manage bookings <ExternalLink size={11} />
                </a>
              </div>

              {dayRoster.total === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">
                  No one booked for {DAY_OF_WEEK_LABELS[dayOfWeek]} yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {dayRoster.groups.map((group) => (
                    <div key={group.label} className="rounded-lg border border-gray-100 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-brand-secondary">{group.label}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          {group.bookings.length} student{group.bookings.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.bookings.map((b) => (
                          <div
                            key={b.id}
                            className={cn(
                              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                              b.status === SlotBookingStatus.CONFIRMED
                                ? 'border-green-200 bg-green-50 text-green-800'
                                : 'border-amber-200 bg-amber-50 text-amber-800',
                            )}
                            title={b.status === SlotBookingStatus.CONFIRMED ? 'Confirmed' : 'Payment pending verification'}
                          >
                            <span className={cn(
                              'h-1.5 w-1.5 shrink-0 rounded-full',
                              b.status === SlotBookingStatus.CONFIRMED ? 'bg-green-500' : 'bg-amber-500',
                            )} />
                            {b.participantName}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      ) : loading ? (
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
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <button
                      onClick={() => setEnrolBatch(batch)}
                      className="flex items-center gap-1 rounded-lg border border-dashed border-brand-primary px-2.5 py-1 text-xs font-medium text-brand-primary hover:bg-brand-primary-light transition"
                    >
                      <UserPlus size={13} /> Add Student
                    </button>
                  )}
                  <div className="flex items-center gap-1.5 rounded-full bg-brand-primary-light px-3 py-1">
                    <Users size={13} className="text-brand-primary" />
                    <span className="text-sm font-bold text-brand-primary">{total}</span>
                  </div>
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
                                      'group/chip relative rounded-full border px-2.5 py-0.5 text-xs',
                                      planChipClass(pg.daysPerWeek),
                                    )}
                                  >
                                    {s?.name ?? e.studentId}
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setUnenrolTarget({
                                            enrollment: e,
                                            studentName: s?.name ?? e.studentId,
                                          })
                                        }
                                        className="absolute -right-1 -top-1 hidden rounded-full bg-red-500 p-0.5 text-white shadow-sm group-hover/chip:block"
                                        title="Remove from batch"
                                      >
                                        <X size={8} />
                                      </button>
                                    )}
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

      {/* Quick Enrol Dialog */}
      {enrolBatch && profile && (
        <QuickEnrolDialog
          batch={enrolBatch}
          students={students}
          enrolledStudentIds={new Set(
            enrollments.filter((e) => e.batchId === enrolBatch.id).map((e) => e.studentId),
          )}
          dayOfWeek={dayOfWeek}
          onEnrol={(studentId, plan, selectedDays, timeSlot) =>
            handleQuickEnrol(studentId, enrolBatch, plan, selectedDays, timeSlot)
          }
          onClose={() => setEnrolBatch(null)}
          busy={busy}
        />
      )}

      {/* Unenrol Confirmation */}
      {unenrolTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white shadow-xl">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-brand-secondary">Remove from batch?</h3>
              <p className="mt-2 text-xs text-gray-500">
                This will end <strong>{unenrolTarget.studentName}</strong>&apos;s enrollment in this batch.
                Their historical attendance data is preserved.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 p-3">
              <button onClick={() => setUnenrolTarget(null)} className="btn-secondary text-xs" disabled={busy}>
                Cancel
              </button>
              <button onClick={handleUnenrol} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50" disabled={busy}>
                {busy ? 'Removing…' : 'Remove Student'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Enrol Dialog — streamlined enrolment directly from the roster page

interface QuickEnrolDialogProps {
  batch: BatchDocument;
  students: StudentDocument[];
  enrolledStudentIds: Set<string>;
  dayOfWeek: DayOfWeek;
  onEnrol: (
    studentId: string,
    plan: FrequencyPlan,
    selectedDays: DayOfWeek[],
    timeSlotStartTime: string | null,
  ) => void;
  onClose: () => void;
  busy: boolean;
}

function QuickEnrolDialog({
  batch,
  students,
  enrolledStudentIds,
  dayOfWeek,
  onEnrol,
  onClose,
  busy,
}: QuickEnrolDialogProps) {
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentDocument | null>(null);
  const [planIdx, setPlanIdx] = useState(0);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([dayOfWeek]);
  const [timeSlotStartTime, setTimeSlotStartTime] = useState<string | null>(
    batch.timeSlots.length > 0 ? batch.timeSlots[0].startTime : null,
  );

  const plan = batch.frequencyPlans[planIdx];

  const availableStudents = useMemo(() => {
    let filtered = students.filter(
      (s) => s.status === 'ACTIVE' && !enrolledStudentIds.has(s.id),
    );
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.guardianName.toLowerCase().includes(q) ||
          s.phone?.includes(q),
      );
    }
    return filtered.slice(0, 15);
  }, [students, enrolledStudentIds, search]);

  useEffect(() => {
    if (plan) {
      setSelectedDays((prev) => {
        if (prev.length <= plan.daysPerWeek) return prev;
        return prev.slice(0, plan.daysPerWeek);
      });
    }
  }, [planIdx, plan]);

  function toggleDay(d: DayOfWeek) {
    setSelectedDays((prev) => {
      if (prev.includes(d)) return prev.filter((x) => x !== d);
      if (plan && prev.length >= plan.daysPerWeek) {
        toast.info(`This plan is ${plan.daysPerWeek} days/week — deselect a day first.`);
        return prev;
      }
      return [...prev, d].sort((a, b) => a - b) as DayOfWeek[];
    });
  }

  const canSubmit =
    selectedStudent &&
    plan &&
    selectedDays.length === plan.daysPerWeek &&
    !(batch.timeSlots.length > 0 && !timeSlotStartTime);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white p-4">
          <div>
            <h2 className="text-base font-semibold text-brand-secondary">
              Quick Enrol → {batch.name}
            </h2>
            <p className="text-xs text-gray-400">
              {batch.startTime}–{batch.endTime} · {batch.level}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5" disabled={busy}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Step 1: Pick student */}
          {!selectedStudent ? (
            <div>
              <label className="label">Search student</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Name, guardian, or phone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input pl-8"
                  autoFocus
                />
              </div>
              <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                {availableStudents.length === 0 ? (
                  <p className="py-3 text-center text-xs text-gray-400">
                    {search ? 'No matching students' : 'All students already enrolled'}
                  </p>
                ) : (
                  availableStudents.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedStudent(s)}
                      className="w-full rounded-lg p-2.5 text-left hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium text-brand-secondary">{s.name}</p>
                      <p className="text-xs text-gray-400">
                        {s.guardianName} {s.phone && `· ${s.phone}`} · {s.level}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Selected student header */}
              <div className="flex items-center justify-between rounded-lg bg-brand-primary-light p-3">
                <div>
                  <p className="text-sm font-semibold text-brand-secondary">{selectedStudent.name}</p>
                  <p className="text-xs text-gray-500">
                    {selectedStudent.guardianName} · {selectedStudent.level}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStudent(null)}
                  className="text-xs text-brand-primary hover:underline"
                >
                  Change
                </button>
              </div>

              {/* Step 2: Pick plan */}
              {batch.frequencyPlans.length > 0 && (
                <div>
                  <label className="label">Frequency plan</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {batch.frequencyPlans.map((p, idx) => (
                      <button
                        key={p.daysPerWeek}
                        type="button"
                        onClick={() => setPlanIdx(idx)}
                        disabled={busy}
                        className={cn(
                          'rounded-lg border p-2 text-center transition',
                          planIdx === idx
                            ? 'border-brand-primary bg-brand-primary-light'
                            : 'border-gray-200 hover:border-gray-300',
                        )}
                      >
                        <p className="text-xs font-semibold text-brand-secondary">
                          {p.daysPerWeek} days/wk
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatINR(p.monthlyFeePaise, { withDecimals: false })}/mo
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Pick days */}
              {plan && (
                <div>
                  <label className="label">
                    Which days? ({selectedDays.length}/{plan.daysPerWeek})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {batch.offeredDays.map((d) => {
                      const active = selectedDays.includes(d);
                      return (
                        <button
                          type="button"
                          key={d}
                          onClick={() => toggleDay(d)}
                          disabled={busy}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-sm transition',
                            active
                              ? 'border-brand-primary bg-brand-primary text-white'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                          )}
                        >
                          {DAY_OF_WEEK_SHORT[d]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 4: Pick time slot (if batch has sub-slots) */}
              {batch.timeSlots.length > 0 && (
                <div>
                  <label className="label">Time slot</label>
                  <div className="flex flex-wrap gap-2">
                    {batch.timeSlots.map((slot) => (
                      <button
                        key={slot.startTime}
                        type="button"
                        onClick={() => setTimeSlotStartTime(slot.startTime)}
                        disabled={busy}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-sm transition',
                          timeSlotStartTime === slot.startTime
                            ? 'border-brand-primary bg-brand-primary text-white'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                        )}
                      >
                        {slot.startTime}–{slot.endTime}
                        {slot.label && <span className="ml-1 text-xs opacity-80">({slot.label})</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-gray-100 bg-white p-4">
          <button onClick={onClose} className="btn-secondary" disabled={busy}>
            Cancel
          </button>
          <button
            onClick={() => {
              if (!selectedStudent || !plan) return;
              onEnrol(selectedStudent.id, plan, selectedDays, batch.timeSlots.length > 0 ? timeSlotStartTime : null);
            }}
            className="btn-primary"
            disabled={busy || !canSubmit}
          >
            {busy ? 'Enrolling…' : 'Enrol Student'}
          </button>
        </div>
      </div>
    </div>
  );
}
