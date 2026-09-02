/**
 * Ruia College attendance — marked off the slot-booking roster.
 *
 * Ruia does not run on batches and enrolments. Its students pay through the
 * slot-booking flow, which creates a booking with a chosen plan, time slot and
 * set of weekdays — and no enrolment at all. QuickAttendance derives its
 * register from /enrollments, so the Ruia coach opened attendance to an empty
 * list every single day, with no way to mark anyone.
 *
 * This builds the register from the bookings instead, through the SAME
 * buildDayRoster() the admin Daily Roster uses. That shared helper is the
 * point: the coach's register and the roster Jaydeep looks at are computed by
 * one function, so they cannot disagree about who is expected or how a slot is
 * labelled.
 *
 * ── How marks are stored ──
 * Attendance is keyed by BOOKING id under a synthetic batch id, because a
 * booking is what exists here — there is no enrolment to point at, and the
 * student record behind a booking is not linked to it. Records carry
 * studentId: null with the participant's name, the same shape a walk-in uses;
 * onAttendanceMarked already reads walkInName when studentId is absent, so
 * nothing downstream needs to know Ruia is different.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, X, Clock, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import {
  RUIA_SLOT_BOOKING_CENTRE_ID,
  DAY_OF_WEEK_LABELS,
  type SlotBookingDocument,
  type AttendanceStatus,
  type DayOfWeek,
} from '@bba/shared';
import { subscribeToBookings } from '@/services/slotBookingService';
import { buildDayRoster } from '@/lib/slotRoster';
import {
  getOrCreateSession,
  saveAttendanceMarks,
  getAttendanceRecords,
  type AttendanceMarkInput,
} from '@/services/attendanceService';

/**
 * Ruia's attendance lives under this key rather than a batch id, since there
 * is no batch. It is the same string the bookings carry as their centreId,
 * which keeps the path readable in the console.
 */
const RUIA_ATTENDANCE_KEY = RUIA_SLOT_BOOKING_CENTRE_ID;

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'PRESENT', label: 'Present', icon: <Check size={14} />, color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'ABSENT', label: 'Absent', icon: <X size={14} />, color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'LATE', label: 'Late', icon: <Clock size={14} />, color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'EXCUSED', label: 'Excused', icon: <ShieldCheck size={14} />, color: 'bg-blue-100 text-blue-700 border-blue-300' },
];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayOfWeekFromIso(iso: string): DayOfWeek {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay() as DayOfWeek;
}

interface Props {
  userId: string;
}

export function RuiaAttendance({ userId }: Props) {
  const [sessionDate, setSessionDate] = useState(todayStr);
  const [bookings, setBookings] = useState<SlotBookingDocument[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [existingCount, setExistingCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const dayOfWeek = useMemo(() => dayOfWeekFromIso(sessionDate), [sessionDate]);
  const month = sessionDate.slice(0, 7);

  // Bookings are read for the month the chosen date falls in, so stepping back
  // to last week — or to a date in the previous month — still shows the people
  // who were actually booked then.
  useEffect(() => {
    setBookingsLoading(true);
    const unsub = subscribeToBookings(RUIA_SLOT_BOOKING_CENTRE_ID, month, (data) => {
      setBookings(data);
      setBookingsLoading(false);
    });
    return unsub;
  }, [month]);

  const roster = useMemo(() => buildDayRoster(bookings, dayOfWeek), [bookings, dayOfWeek]);

  // Load whatever is already recorded for the day, once per date.
  useEffect(() => {
    let cancelled = false;
    setSaveError('');
    setSavedAt(null);
    setMarks({});
    (async () => {
      const existing = await getAttendanceRecords(RUIA_ATTENDANCE_KEY, sessionDate).catch(() => []);
      if (cancelled) return;
      setExistingCount(existing.length);
      const seeded: Record<string, AttendanceStatus> = {};
      existing.forEach((r) => { seeded[r.id] = r.status; });
      setMarks(seeded);
    })();
    return () => { cancelled = true; };
  }, [sessionDate]);

  /**
   * Give anyone on today's roster a default of PRESENT — a coach is noting the
   * absences, not confirming forty people one at a time.
   *
   * This MERGES rather than replaces. Bookings arrive over a live
   * subscription, so a payment verified in the office mid-session re-emits the
   * whole list; rebuilding the marks from scratch there would silently reset
   * every absence the coach had already tapped.
   */
  useEffect(() => {
    const ids = roster.groups.flatMap((g) => g.bookings.map((b) => b.id));
    setMarks((prev) => {
      const missing = ids.filter((id) => !(id in prev));
      if (missing.length === 0) return prev;
      const next = { ...prev };
      missing.forEach((id) => { next[id] = 'PRESENT'; });
      return next;
    });
  }, [roster]);

  // Counted over today's roster only. `marks` can still hold ids from records
  // saved for people who have since been taken off this day, and those must
  // not inflate the tally the coach is checking before saving.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    roster.groups.forEach((g) => g.bookings.forEach((b) => {
      const st = marks[b.id] ?? 'PRESENT';
      c[st] = (c[st] ?? 0) + 1;
    }));
    return c;
  }, [marks, roster]);

  function setAll(status: AttendanceStatus) {
    const ids = roster.groups.flatMap((g) => g.bookings.map((b) => b.id));
    setMarks((prev) => {
      const next = { ...prev };
      ids.forEach((id) => { next[id] = status; });
      return next;
    });
  }

  function setSlot(label: string, status: AttendanceStatus) {
    const ids = roster.groups.find((g) => g.label === label)?.bookings.map((b) => b.id) ?? [];
    setMarks((prev) => {
      const next = { ...prev };
      ids.forEach((id) => { next[id] = status; });
      return next;
    });
  }

  async function handleSave() {
    if (roster.total === 0) return;
    setSaving(true);
    setSaveError('');
    try {
      await getOrCreateSession(RUIA_ATTENDANCE_KEY, RUIA_SLOT_BOOKING_CENTRE_ID, sessionDate, userId);

      const input: AttendanceMarkInput[] = roster.groups.flatMap((g) => g.bookings.map((b) => ({
        // Keyed by booking id. No studentId: a booking is not linked to a
        // student record, and inventing a link by matching names is exactly
        // how the wrong child gets marked absent.
        recordId: b.id,
        studentId: null,
        attendeeType: 'REGULAR' as const,
        status: marks[b.id] ?? 'PRESENT',
        walkIn: { name: b.participantName, phone: '' },
      })));

      await saveAttendanceMarks(RUIA_ATTENDANCE_KEY, sessionDate, sessionDate, input, userId);
      toast.success(`Attendance saved for ${roster.total} student${roster.total === 1 ? '' : 's'}`);
      setSavedAt(new Date());
      setExistingCount(roster.total);
    } catch (err) {
      console.error(err);
      const code = (err as { code?: string })?.code ?? '';
      setSaveError(
        code === 'permission-denied'
          ? "You don't have permission to mark attendance here. Ask your admin to check your access."
          : code === 'unavailable' || code === 'deadline-exceeded'
            ? 'No connection to the server. Your marks are still on screen — try again once you have signal.'
            : (err as Error)?.message || 'Unknown error',
      );
      toast.error('Attendance not saved');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-3">
        <div className="w-44">
          <label className="label">Date</label>
          <input
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="input"
            disabled={saving}
          />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-brand-secondary">{DAY_OF_WEEK_LABELS[dayOfWeek]}</p>
          <p className="text-xs text-gray-400">
            Ruia College · {roster.total} booked
          </p>
        </div>
      </div>

      {existingCount > 0 && !savedAt && (
        <p className="text-xs text-yellow-600">
          Attendance was already recorded for this day. You are editing it.
        </p>
      )}

      {roster.unassigned.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {roster.unassigned.length} paid booking{roster.unassigned.length === 1 ? '' : 's'} have no
          preferred days recorded, so they appear on no day. Ask your admin to set their days.
        </p>
      )}

      {bookingsLoading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
      ) : roster.total === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          No one is booked for {DAY_OF_WEEK_LABELS[dayOfWeek]}.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Mark all:</span>
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setAll(o.value)}
                disabled={saving}
                className={cn('rounded border px-2 py-1 text-xs font-medium', o.color)}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {roster.groups.map((group) => (
              <div key={group.label} className="rounded-lg border border-gray-200">
                <div className="flex items-center justify-between rounded-t-lg bg-gray-50 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-brand-secondary">{group.label}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600 shadow-sm">
                      {group.bookings.length}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {STATUS_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setSlot(group.label, o.value)}
                        disabled={saving}
                        className={cn('rounded border px-1.5 py-0.5 text-[10px] font-medium', o.color)}
                      >
                        All {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 p-3">
                  {group.bookings.map((b) => {
                    const status = marks[b.id] ?? 'PRESENT';
                    return (
                      <div
                        key={b.id}
                        className={cn(
                          'flex flex-col gap-1.5 rounded-lg border p-2.5 sm:flex-row sm:items-center',
                          status === 'PRESENT' ? 'border-green-100 bg-green-50/30'
                            : status === 'ABSENT' ? 'border-red-100 bg-red-50/30'
                              : 'border-gray-100',
                        )}
                      >
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-brand-secondary">
                          {b.participantName}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {STATUS_OPTIONS.map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => setMarks((p) => ({ ...p, [b.id]: o.value }))}
                              disabled={saving}
                              className={cn(
                                'flex items-center gap-0.5 rounded-full border px-2 py-1 text-xs font-medium transition-colors',
                                status === o.value ? o.color : 'border-gray-200 text-gray-400',
                              )}
                            >
                              {o.icon}
                              <span className="hidden sm:inline">{o.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              <span className="text-green-600">{counts.PRESENT ?? 0} present</span>
              <span className="text-yellow-600">{counts.LATE ?? 0} late</span>
              <span className="text-red-600">{counts.ABSENT ?? 0} absent</span>
              <span className="text-blue-600">{counts.EXCUSED ?? 0} excused</span>
            </div>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? `Saving ${roster.total}…` : existingCount > 0 ? 'Update Attendance' : 'Save Attendance'}
            </button>
          </div>
        </>
      )}

      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-800">Attendance was not saved</p>
          <p className="mt-1 text-xs text-red-700">{saveError}</p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="mt-2 rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            Try again
          </button>
        </div>
      )}

      {savedAt && !saveError && (
        <p className="text-center text-xs text-green-700">
          Saved at {savedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.
        </p>
      )}
    </div>
  );
}
