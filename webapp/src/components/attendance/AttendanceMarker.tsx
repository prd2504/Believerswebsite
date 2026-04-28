/**
 * Attendance marking UI. Coach (or super-admin) selects a batch + date; the roster
 * is auto-built from /enrollments — only students whose selectedDays includes that
 * day-of-week appear as REGULAR.
 *
 * Coaches can additionally:
 *   - "Add another student" → search any active student and mark them MAKEUP/EXTRA
 *   - "Add trial" → walk-in (name + phone) marked as TRIAL
 *
 * Default state for every row is PRESENT — typically the coach only flips the few
 * rows for absentees / late arrivals, then taps Save.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, X, Clock, ShieldCheck, UserPlus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import {
  type BatchDocument,
  type StudentDocument,
  type AttendanceStatus,
  type AttendanceRecord,
  type AttendeeType,
  type DayOfWeek,
} from '@bba/shared';
import {
  getOrCreateSession,
  saveAttendanceMarks,
  getAttendanceRecords,
  type AttendanceMarkInput,
} from '@/services/attendanceService';
import { getEnrollmentsForBatchOnDay } from '@/services/enrollmentService';
import { getStudentById, getStudentsByCentre } from '@/services/studentService';

const STATUS_OPTIONS: {
  value: AttendanceStatus;
  label: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  { value: 'PRESENT', label: 'Present', icon: <Check size={14} />, color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'ABSENT', label: 'Absent', icon: <X size={14} />, color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'LATE', label: 'Late', icon: <Clock size={14} />, color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'EXCUSED', label: 'Excused', icon: <ShieldCheck size={14} />, color: 'bg-blue-100 text-blue-700 border-blue-300' },
];

const TYPE_BADGE: Record<AttendeeType, string> = {
  REGULAR: 'bg-gray-100 text-gray-600',
  MAKEUP: 'bg-purple-100 text-purple-700',
  EXTRA: 'bg-indigo-100 text-indigo-700',
  TRIAL: 'bg-pink-100 text-pink-700',
};

interface RowState {
  /** Stable UI key — studentId or "trial:<phone-or-ts>". */
  key: string;
  studentId: string | null;
  attendeeType: AttendeeType;
  displayName: string;
  guardianName?: string;
  status: AttendanceStatus;
  note: string;
  walkIn?: { name: string; phone: string; notes?: string };
}

interface AttendanceMarkerProps {
  batches: BatchDocument[];
  centreId: string;
  userId: string;
  onDone?: () => void;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayOfWeekFromIso(iso: string): DayOfWeek {
  // iso is YYYY-MM-DD in IST; constructing a Date from it gives midnight-UTC,
  // which yields the correct day-of-week as long as the date is treated as a
  // calendar date (no time-of-day).
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return date.getUTCDay() as DayOfWeek;
}

export function AttendanceMarker({ batches, centreId, userId, onDone }: AttendanceMarkerProps) {
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.id ?? '');
  const [sessionDate, setSessionDate] = useState(todayStr);
  const [rows, setRows] = useState<RowState[]>([]);
  const [existingRecords, setExistingRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState<null | 'student' | 'trial'>(null);

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === selectedBatchId),
    [batches, selectedBatchId],
  );

  // Load roster (regular enrolments + existing records) when batch/date changes.
  useEffect(() => {
    if (!selectedBatchId || !sessionDate) return;
    const dow = dayOfWeekFromIso(sessionDate);

    setLoading(true);
    (async () => {
      try {
        const [enrollments, records] = await Promise.all([
          getEnrollmentsForBatchOnDay(selectedBatchId, dow),
          getAttendanceRecords(selectedBatchId, sessionDate).catch(() => []),
        ]);
        setExistingRecords(records);

        const recordById = new Map(records.map((r) => [r.id, r]));

        // Resolve student names for each enrolment (single fetch per id)
        const studentDocs: StudentDocument[] = (
          await Promise.all(enrollments.map((e) => getStudentById(e.studentId)))
        ).filter((s): s is StudentDocument => s !== null);

        // Build REGULAR rows from enrolments
        const regularRows: RowState[] = studentDocs.map((s) => {
          const r = recordById.get(s.id);
          return {
            key: s.id,
            studentId: s.id,
            attendeeType: (r?.attendeeType ?? 'REGULAR') as AttendeeType,
            displayName: s.name,
            guardianName: s.guardianName,
            status: r?.status ?? 'PRESENT',
            note: r?.note ?? '',
          };
        });

        // Add ad-hoc rows from any pre-existing record that isn't already in the regular roster.
        const regularIds = new Set(regularRows.map((r) => r.studentId));
        const adhocRows: RowState[] = records
          .filter((r) => !r.studentId || !regularIds.has(r.studentId))
          .map((r) => ({
            key: r.id,
            studentId: r.studentId,
            attendeeType: r.attendeeType,
            displayName: r.studentId ? '(student)' : (r.walkInName ?? 'Walk-in'),
            status: r.status,
            note: r.note ?? '',
            walkIn:
              r.attendeeType === 'TRIAL' && !r.studentId
                ? { name: r.walkInName ?? '', phone: r.walkInPhone ?? '', notes: r.walkInNotes ?? '' }
                : undefined,
          }));

        // Resolve names for ad-hoc rows that have a studentId (one extra fetch each)
        for (const row of adhocRows) {
          if (row.studentId && row.displayName === '(student)') {
            const stu = await getStudentById(row.studentId);
            if (stu) {
              row.displayName = stu.name;
              row.guardianName = stu.guardianName;
            }
          }
        }

        setRows([...regularRows, ...adhocRows]);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load roster');
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedBatchId, sessionDate]);

  function patch(key: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function markAllAs(status: AttendanceStatus) {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
  }

  function addExistingStudent(student: StudentDocument, type: AttendeeType) {
    if (rows.find((r) => r.studentId === student.id)) {
      toast.info(`${student.name} is already on the list.`);
      setShowPicker(null);
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        key: student.id,
        studentId: student.id,
        attendeeType: type,
        displayName: student.name,
        guardianName: student.guardianName,
        status: 'PRESENT',
        note: '',
      },
    ]);
    setShowPicker(null);
  }

  function addTrial(name: string, phone: string, notes: string) {
    if (!name.trim()) {
      toast.error('Name is required for trial.');
      return;
    }
    const phoneSlug = phone.replace(/\D/g, '') || `${Date.now()}`;
    const key = `trial:${phoneSlug}`;
    if (rows.find((r) => r.key === key)) {
      toast.info('That trial entry already exists.');
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        key,
        studentId: null,
        attendeeType: 'TRIAL',
        displayName: name.trim(),
        status: 'PRESENT',
        note: '',
        walkIn: { name: name.trim(), phone: phone.trim(), notes: notes.trim() || undefined },
      },
    ]);
    setShowPicker(null);
  }

  async function handleSave() {
    if (!selectedBatchId || rows.length === 0) return;
    setSaving(true);
    try {
      await getOrCreateSession(selectedBatchId, centreId, sessionDate, userId);
      const marks: AttendanceMarkInput[] = rows.map((r) => ({
        studentId: r.studentId,
        attendeeType: r.attendeeType,
        status: r.status,
        note: r.note || undefined,
        walkIn: r.walkIn,
      }));
      await saveAttendanceMarks(selectedBatchId, sessionDate, sessionDate, marks, userId);
      toast.success('Attendance saved');
      onDone?.();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save attendance');
    } finally {
      setSaving(false);
    }
  }

  const counts = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<AttendanceStatus, number>,
    );
  }, [rows]);

  return (
    <div className="space-y-5">
      {/* Batch & date selectors */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label className="label">Batch</label>
          <select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            className="input"
            disabled={saving}
          >
            <option value="">Select batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.startTime}–{b.endTime})
              </option>
            ))}
          </select>
        </div>
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
      </div>

      {selectedBatch && !selectedBatch.offeredDays.includes(dayOfWeekFromIso(sessionDate) as never) && (
        <p className="rounded bg-yellow-50 p-2 text-xs text-yellow-700">
          This batch isn&rsquo;t scheduled to run on this day. The expected roster will be empty —
          you can still add ad-hoc attendees below.
        </p>
      )}

      {existingRecords.length > 0 && (
        <p className="text-xs text-yellow-600">
          Attendance was already recorded for this session. You are editing existing records.
        </p>
      )}

      {/* Quick "mark all" */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Mark all:</span>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => markAllAs(opt.value)}
              className={cn('rounded border px-2 py-1 text-xs font-medium transition-colors', opt.color)}
              disabled={saving}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Roster */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          {selectedBatchId ? 'No expected attendees today.' : 'Select a batch to start.'}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3 sm:flex-row sm:items-center"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-brand-secondary">{row.displayName}</p>
                  <span
                    className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', TYPE_BADGE[row.attendeeType])}
                  >
                    {row.attendeeType}
                  </span>
                </div>
                {row.guardianName && (
                  <p className="text-xs text-gray-400">Guardian: {row.guardianName}</p>
                )}
                {row.walkIn?.phone && (
                  <p className="text-xs text-gray-400">{row.walkIn.phone}</p>
                )}
              </div>

              {/* Status buttons */}
              <div className="flex gap-1.5">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => patch(row.key, { status: opt.value })}
                    disabled={saving}
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      row.status === opt.value
                        ? opt.color
                        : 'border-gray-200 text-gray-400 hover:border-gray-300',
                    )}
                    aria-label={opt.label}
                  >
                    {opt.icon}
                    <span className="hidden sm:inline">{opt.label}</span>
                  </button>
                ))}
              </div>

              {/* Optional note for non-present */}
              {row.status !== 'PRESENT' && (
                <input
                  type="text"
                  placeholder="Note"
                  value={row.note}
                  onChange={(e) => patch(row.key, { note: e.target.value })}
                  className="input mt-1 py-1 text-xs sm:mt-0 sm:w-40"
                  disabled={saving}
                />
              )}

              {row.attendeeType !== 'REGULAR' && (
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  className="btn-ghost p-1 text-red-400 hover:text-red-600"
                  disabled={saving}
                  aria-label="Remove from roster"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add attendee */}
      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={() => setShowPicker('student')}
          className="btn-secondary text-xs"
          disabled={saving || !selectedBatchId}
        >
          <UserPlus size={14} /> Add student (makeup / extra)
        </button>
        <button
          type="button"
          onClick={() => setShowPicker('trial')}
          className="btn-secondary text-xs"
          disabled={saving || !selectedBatchId}
        >
          <Sparkles size={14} /> Add trial / walk-in
        </button>
      </div>

      {/* Summary & save */}
      {rows.length > 0 && (
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="text-green-600">{counts.PRESENT ?? 0} present</span>
            <span className="text-yellow-600">{counts.LATE ?? 0} late</span>
            <span className="text-red-600">{counts.ABSENT ?? 0} absent</span>
            <span className="text-blue-600">{counts.EXCUSED ?? 0} excused</span>
            <span className="text-gray-500">{rows.length} total</span>
          </div>
          <button onClick={handleSave} disabled={saving || rows.length === 0} className="btn-primary">
            {saving ? 'Saving…' : existingRecords.length > 0 ? 'Update Attendance' : 'Save Attendance'}
          </button>
        </div>
      )}

      {/* Picker overlays */}
      {showPicker === 'student' && (
        <StudentPicker
          centreId={centreId}
          excludeIds={rows.map((r) => r.studentId).filter((id): id is string => id !== null)}
          onPick={addExistingStudent}
          onClose={() => setShowPicker(null)}
        />
      )}
      {showPicker === 'trial' && (
        <TrialDialog onAdd={addTrial} onClose={() => setShowPicker(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components

interface StudentPickerProps {
  centreId: string;
  excludeIds: string[];
  onPick: (s: StudentDocument, type: AttendeeType) => void;
  onClose: () => void;
}

function StudentPicker({ centreId, excludeIds, onPick, onClose }: StudentPickerProps) {
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<AttendeeType>('MAKEUP');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const all = await getStudentsByCentre(centreId);
        setStudents(all.filter((s) => s.status === 'ACTIVE' && !excludeIds.includes(s.id)));
      } catch (err) {
        console.error(err);
        toast.error('Failed to load students');
      } finally {
        setLoading(false);
      }
    })();
  }, [centreId, excludeIds]);

  const matches = useMemo(() => {
    if (!search.trim()) return students.slice(0, 20);
    const q = search.toLowerCase();
    return students
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.guardianName.toLowerCase().includes(q) ||
          s.phone?.includes(q),
      )
      .slice(0, 20);
  }, [students, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-3">
          <h3 className="text-sm font-semibold text-brand-secondary">Add student to roster</h3>
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="p-3">
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => setType('MAKEUP')}
              className={cn(
                'flex-1 rounded border px-2 py-1 text-xs',
                type === 'MAKEUP' ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500',
              )}
            >
              Makeup
            </button>
            <button
              type="button"
              onClick={() => setType('EXTRA')}
              className={cn(
                'flex-1 rounded border px-2 py-1 text-xs',
                type === 'EXTRA' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500',
              )}
            >
              Extra session
            </button>
          </div>

          <input
            type="text"
            placeholder="Search by name, guardian, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input mb-2"
            autoFocus
          />

          <div className="max-h-80 space-y-1 overflow-y-auto">
            {loading ? (
              <p className="py-4 text-center text-xs text-gray-400">Loading…</p>
            ) : matches.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-400">No matches</p>
            ) : (
              matches.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onPick(s, type)}
                  className="w-full rounded p-2 text-left text-sm hover:bg-gray-50"
                >
                  <p className="font-medium text-brand-secondary">{s.name}</p>
                  <p className="text-xs text-gray-400">
                    {s.guardianName} {s.phone && `· ${s.phone}`}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TrialDialogProps {
  onAdd: (name: string, phone: string, notes: string) => void;
  onClose: () => void;
}

function TrialDialog({ onAdd, onClose }: TrialDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-3">
          <h3 className="text-sm font-semibold text-brand-secondary">Add trial / walk-in</h3>
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 p-3">
          <div>
            <label className="label">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Trial attendee's name"
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input"
              placeholder="+91 98765 43210"
            />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input"
              placeholder="How did they hear about us?"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 p-3">
          <button onClick={onClose} className="btn-secondary text-xs">
            Cancel
          </button>
          <button onClick={() => onAdd(name, phone, notes)} className="btn-primary text-xs">
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
