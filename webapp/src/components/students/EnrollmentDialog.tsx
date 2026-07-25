/**
 * Enrol-a-student dialog. Detects if the student is already enrolled in the selected
 * batch and switches to "update" mode — letting the admin assign/change the time slot,
 * days, or plan without triggering the "already enrolled" error.
 */

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import {
  type StudentDocument,
  type BatchDocument,
  type DayOfWeek,
  type FrequencyPlan,
  DAY_OF_WEEK_SHORT,
  formatINR,
} from '@bba/shared';
import {
  enrollStudent,
  getEnrollment,
  updateEnrollmentPlan,
  updateEnrollmentTimeSlot,
} from '@/services/enrollmentService';
import { makeEnrollmentId, type EnrollmentDocument } from '@bba/shared';
import { cn } from '@/lib/cn';

interface EnrollmentDialogProps {
  student: StudentDocument;
  batches: BatchDocument[];
  userId: string;
  onClose: () => void;
  onEnrolled: () => void;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function EnrollmentDialog({
  student,
  batches,
  userId,
  onClose,
  onEnrolled,
}: EnrollmentDialogProps) {
  const [batchId, setBatchId] = useState<string>(batches[0]?.id ?? '');
  const [planIdx, setPlanIdx] = useState<number>(0);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [timeSlotStartTime, setTimeSlotStartTime] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>(todayStr());
  const [notes, setNotes] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [existingEnrollment, setExistingEnrollment] = useState<EnrollmentDocument | null>(null);
  const [checkingEnrollment, setCheckingEnrollment] = useState(false);

  const batch = useMemo(() => batches.find((b) => b.id === batchId), [batches, batchId]);
  const plan: FrequencyPlan | undefined = batch?.frequencyPlans[planIdx];
  const isUpdateMode = existingEnrollment !== null;

  // When batch changes, check if student already has an active enrollment
  useEffect(() => {
    if (!batchId || !student.id) return;
    setCheckingEnrollment(true);
    getEnrollment(student.id, batchId)
      .then((existing) => {
        const active = existing?.status === 'ACTIVE' ? existing : null;
        setExistingEnrollment(active);
        if (active) {
          // Pre-fill from existing enrollment
          setSelectedDays([...active.selectedDays]);
          setTimeSlotStartTime(active.timeSlotStartTime ?? null);
          // Find the matching plan index
          const pIdx = batch?.frequencyPlans.findIndex(
            (p) => p.daysPerWeek === active.daysPerWeek,
          ) ?? 0;
          setPlanIdx(pIdx >= 0 ? pIdx : 0);
        } else {
          setSelectedDays([]);
          setTimeSlotStartTime(null);
          setPlanIdx(0);
        }
      })
      .catch(console.error)
      .finally(() => setCheckingEnrollment(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, student.id]);

  // When plan changes (user switches plan), reset day selection only for new enrollments
  useEffect(() => {
    if (!isUpdateMode) setSelectedDays([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planIdx]);

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

  async function handleSubmit() {
    if (!batch || !plan) return;
    if (batch.timeSlots.length > 0 && !timeSlotStartTime) {
      toast.error('Pick a time slot for this batch.');
      return;
    }

    setBusy(true);
    try {
      if (isUpdateMode && existingEnrollment) {
        // If only the slot changed (days/plan same), use the lightweight updater
        const slotChanged = existingEnrollment.timeSlotStartTime !== timeSlotStartTime;
        const daysChanged =
          existingEnrollment.daysPerWeek !== plan.daysPerWeek ||
          JSON.stringify([...existingEnrollment.selectedDays].sort()) !==
            JSON.stringify([...selectedDays].sort());

        if (selectedDays.length !== plan.daysPerWeek) {
          toast.error(`Pick exactly ${plan.daysPerWeek} days for this plan.`);
          setBusy(false);
          return;
        }

        if (daysChanged) {
          await updateEnrollmentPlan(
            makeEnrollmentId(student.id, batch.id),
            plan.daysPerWeek,
            plan.monthlyFeePaise,
            selectedDays,
            userId,
            notes || undefined,
          );
        }
        if (slotChanged || !daysChanged) {
          await updateEnrollmentTimeSlot(
            makeEnrollmentId(student.id, batch.id),
            timeSlotStartTime,
            userId,
          );
        }
        toast.success(`Updated enrollment for ${student.name}`);
      } else {
        if (selectedDays.length !== plan.daysPerWeek) {
          toast.error(`Pick exactly ${plan.daysPerWeek} days for this plan.`);
          setBusy(false);
          return;
        }
        await enrollStudent(
          {
            studentId: student.id,
            batchId: batch.id,
            centreId: batch.centreId,
            daysPerWeek: plan.daysPerWeek,
            monthlyFeePaise: plan.monthlyFeePaise,
            selectedDays,
            timeSlotStartTime: batch.timeSlots.length > 0 ? timeSlotStartTime : null,
            startDate,
            notes,
          },
          userId,
        );
        toast.success(`${student.name} enrolled in ${batch.name}`);
      }
      onEnrolled();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to save enrollment');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !!batch &&
    !!plan &&
    selectedDays.length === plan.daysPerWeek &&
    !(batch.timeSlots.length > 0 && !timeSlotStartTime);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <div>
            <h2 className="text-base font-semibold text-brand-secondary">
              {isUpdateMode ? `Update: ${student.name}` : `Enrol ${student.name}`}
            </h2>
            <p className="text-xs text-gray-400">
              {isUpdateMode
                ? 'Student is already enrolled — update their slot, days, or plan.'
                : 'Pick a batch, a plan, and the days the student will attend.'}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5" disabled={busy} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {batches.length === 0 ? (
            <p className="rounded bg-yellow-50 p-3 text-xs text-yellow-700">
              No active batches at this centre. Create a batch first.
            </p>
          ) : (
            <>
              {/* Batch */}
              <div>
                <label className="label">Batch</label>
                <select
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  className="input"
                  disabled={busy}
                >
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.startTime}–{b.endTime})
                    </option>
                  ))}
                </select>
              </div>

              {checkingEnrollment && (
                <p className="text-xs text-gray-400">Checking enrollment…</p>
              )}

              {isUpdateMode && (
                <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  Already enrolled — their current days are pre-filled below (possibly a guess,
                  if this came from a self-registration). Click a day to remove it, then pick
                  the correct ones if they don't match.
                </div>
              )}

              {/* Plan picker */}
              {batch && batch.frequencyPlans.length > 0 && (
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
                          {p.daysPerWeek} days/week
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatINR(p.monthlyFeePaise, { withDecimals: false })}/mo
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Day selector */}
              {batch && plan && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="label">
                      Which days? ({selectedDays.length}/{plan.daysPerWeek} selected)
                    </label>
                    {selectedDays.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedDays([])}
                        disabled={busy}
                        className="text-xs font-medium text-brand-primary hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
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

              {/* Time slot picker */}
              {batch && batch.timeSlots.length > 0 && (
                <div>
                  <label className="label">Which hour slot?</label>
                  <div className="flex flex-wrap gap-2">
                    {batch.timeSlots.map((slot) => {
                      const active = timeSlotStartTime === slot.startTime;
                      return (
                        <button
                          type="button"
                          key={slot.startTime}
                          onClick={() => setTimeSlotStartTime(slot.startTime)}
                          disabled={busy}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-center text-sm transition',
                            active
                              ? 'border-brand-primary bg-brand-primary text-white'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                          )}
                        >
                          <p className="font-medium">{slot.startTime}–{slot.endTime}</p>
                          {slot.label && <p className="text-xs opacity-80">{slot.label}</p>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Start date + notes — only for new enrollments */}
              {!isUpdateMode && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Start date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="input"
                      disabled={busy}
                    />
                  </div>
                  <div>
                    <label className="label">Notes (optional)</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="input"
                      placeholder="e.g. switching from Sat batch"
                      disabled={busy}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
          <button onClick={onClose} className="btn-secondary" disabled={busy}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary"
            disabled={busy || !canSubmit || checkingEnrollment}
          >
            {busy
              ? 'Saving…'
              : isUpdateMode
                ? 'Update Enrollment'
                : 'Enrol'}
          </button>
        </div>
      </div>
    </div>
  );
}
