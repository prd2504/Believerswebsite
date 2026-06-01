/**
 * Unified attendance marking — shows ALL expected students for a given day/centre
 * across ALL batches in a single flat list grouped by time slot. Coach marks
 * absences only (everyone defaults to PRESENT). On save, marks are distributed
 * back to the correct batch sessions.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, X, Clock, ShieldCheck, UserPlus, Sparkles, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import {
  type BatchDocument,
  type StudentDocument,
  type AttendanceStatus,
  type AttendanceRecord,
  type AttendeeType,
  type DayOfWeek,
  DAY_OF_WEEK_LABELS,
} from '@bba/shared';
import {
  getOrCreateSession,
  saveAttendanceMarks,
  getAttendanceRecords,
  type AttendanceMarkInput,
} from '@/services/attendanceService';
import { getEnrollmentsForBatchOnDay } from '@/services/enrollmentService';
import { getStudentById, getAllStudents } from '@/services/studentService';

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

interface QuickRow {
  key: string;
  studentId: string | null;
  batchId: string;
  batchName: string;
  attendeeType: AttendeeType;
  displayName: string;
  status: AttendanceStatus;
  note: string;
  timeSlot: string;
  walkIn?: { name: string; phone: string; notes?: string };
}

interface SlotGroup {
  slotLabel: string;
  slotKey: string;
  rows: QuickRow[];
}

interface QuickAttendanceProps {
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
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return date.getUTCDay() as DayOfWeek;
}

export function QuickAttendance({ batches, centreId, userId, onDone }: QuickAttendanceProps) {
  const [sessionDate, setSessionDate] = useState(todayStr);
  const [rows, setRows] = useState<QuickRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [showPicker, setShowPicker] = useState<null | 'student' | 'trial'>(null);
  const [pickerBatchId, setPickerBatchId] = useState('');
  const [collapsedSlots, setCollapsedSlots] = useState<Set<string>>(new Set());

  const dayOfWeek = useMemo(() => dayOfWeekFromIso(sessionDate), [sessionDate]);

  const batchesForDay = useMemo(
    () => batches.filter((b) => b.status === 'ACTIVE' && b.offeredDays.includes(dayOfWeek)),
    [batches, dayOfWeek],
  );

  useEffect(() => {
    if (batchesForDay.length === 0) {
      setRows([]);
      setHasExisting(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const allRows: QuickRow[] = [];
        let foundExisting = false;

        for (const batch of batchesForDay) {
          const [enrollments, records] = await Promise.all([
            getEnrollmentsForBatchOnDay(batch.id, dayOfWeek),
            getAttendanceRecords(batch.id, sessionDate).catch(() => []),
          ]);

          if (records.length > 0) foundExisting = true;
          const recordById = new Map(records.map((r) => [r.id, r]));

          const studentDocs: StudentDocument[] = (
            await Promise.all(enrollments.map((e) => getStudentById(e.studentId)))
          ).filter((s): s is StudentDocument => s !== null);

          const studentDocMap = new Map(studentDocs.map((s) => [s.id, s]));

          for (const enrollment of enrollments) {
            const s = studentDocMap.get(enrollment.studentId);
            if (!s || s.status !== 'ACTIVE') continue;

            const r = recordById.get(s.id);
            const slotStart = enrollment.timeSlotStartTime;
            let timeSlot: string;

            if (slotStart) {
              const slotDef = batch.timeSlots.find((ts) => ts.startTime === slotStart);
              timeSlot = slotDef
                ? `${slotDef.startTime}–${slotDef.endTime}`
                : `${slotStart}`;
            } else {
              timeSlot = `${batch.startTime}–${batch.endTime}`;
            }

            allRows.push({
              key: `${s.id}_${batch.id}`,
              studentId: s.id,
              batchId: batch.id,
              batchName: batch.name,
              attendeeType: (r?.attendeeType ?? 'REGULAR') as AttendeeType,
              displayName: s.name,
              status: r?.status ?? 'PRESENT',
              note: r?.note ?? '',
              timeSlot,
            });
          }

          const regularStudentIds = new Set(enrollments.map((e) => e.studentId));
          const adhocRecords = records.filter(
            (r) => !r.studentId || !regularStudentIds.has(r.studentId),
          );

          for (const r of adhocRecords) {
            let displayName = r.walkInName ?? 'Walk-in';
            if (r.studentId) {
              const stu = await getStudentById(r.studentId);
              if (stu) displayName = stu.name;
            }

            allRows.push({
              key: `adhoc_${r.id}_${batch.id}`,
              studentId: r.studentId,
              batchId: batch.id,
              batchName: batch.name,
              attendeeType: r.attendeeType,
              displayName,
              status: r.status,
              note: r.note ?? '',
              timeSlot: `${batch.startTime}–${batch.endTime}`,
              walkIn:
                r.attendeeType === 'TRIAL' && !r.studentId
                  ? { name: r.walkInName ?? '', phone: r.walkInPhone ?? '', notes: r.walkInNotes ?? '' }
                  : undefined,
            });
          }
        }

        setRows(allRows);
        setHasExisting(foundExisting);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load attendance roster');
      } finally {
        setLoading(false);
      }
    })();
  }, [batchesForDay, sessionDate, dayOfWeek]);

  const slotGroups = useMemo((): SlotGroup[] => {
    const map = new Map<string, QuickRow[]>();
    rows.forEach((r) => {
      const arr = map.get(r.timeSlot) ?? [];
      arr.push(r);
      map.set(r.timeSlot, arr);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([slotLabel, slotRows]) => ({
        slotLabel,
        slotKey: slotLabel,
        rows: slotRows.sort((a, b) => a.displayName.localeCompare(b.displayName)),
      }));
  }, [rows]);

  function patch(key: string, p: Partial<QuickRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function toggleSlotCollapse(slotKey: string) {
    setCollapsedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slotKey)) next.delete(slotKey);
      else next.add(slotKey);
      return next;
    });
  }

  function markAllAs(status: AttendanceStatus) {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
  }

  function markSlotAs(slotKey: string, status: AttendanceStatus) {
    setRows((prev) =>
      prev.map((r) => (r.timeSlot === slotKey ? { ...r, status } : r)),
    );
  }

  function addExistingStudent(student: StudentDocument, type: AttendeeType, batchId: string) {
    if (rows.find((r) => r.studentId === student.id && r.batchId === batchId)) {
      toast.info(`${student.name} is already on the list.`);
      setShowPicker(null);
      return;
    }
    const batch = batchesForDay.find((b) => b.id === batchId);
    if (!batch) return;

    setRows((prev) => [
      ...prev,
      {
        key: `${student.id}_${batchId}`,
        studentId: student.id,
        batchId,
        batchName: batch.name,
        attendeeType: type,
        displayName: student.name,
        status: 'PRESENT',
        note: '',
        timeSlot: `${batch.startTime}–${batch.endTime}`,
      },
    ]);
    setShowPicker(null);
  }

  function addTrial(name: string, phone: string, notes: string, batchId: string) {
    if (!name.trim()) {
      toast.error('Name is required for trial.');
      return;
    }
    const batch = batchesForDay.find((b) => b.id === batchId);
    if (!batch) return;

    const phoneSlug = phone.replace(/\D/g, '') || `${Date.now()}`;
    const key = `trial:${phoneSlug}_${batchId}`;
    if (rows.find((r) => r.key === key)) {
      toast.info('That trial entry already exists.');
      return;
    }

    setRows((prev) => [
      ...prev,
      {
        key,
        studentId: null,
        batchId,
        batchName: batch.name,
        attendeeType: 'TRIAL',
        displayName: name.trim(),
        status: 'PRESENT',
        note: '',
        timeSlot: `${batch.startTime}–${batch.endTime}`,
        walkIn: { name: name.trim(), phone: phone.trim(), notes: notes.trim() || undefined },
      },
    ]);
    setShowPicker(null);
  }

  async function handleSave() {
    if (rows.length === 0) return;
    setSaving(true);

    try {
      const byBatch = new Map<string, QuickRow[]>();
      rows.forEach((r) => {
        const arr = byBatch.get(r.batchId) ?? [];
        arr.push(r);
        byBatch.set(r.batchId, arr);
      });

      for (const [batchId, batchRows] of byBatch) {
        const batch = batchesForDay.find((b) => b.id === batchId);
        if (!batch) continue;

        await getOrCreateSession(batchId, batch.centreId, sessionDate, userId);
        const marks: AttendanceMarkInput[] = batchRows.map((r) => ({
          studentId: r.studentId,
          attendeeType: r.attendeeType,
          status: r.status,
          note: r.note || undefined,
          walkIn: r.walkIn,
        }));
        await saveAttendanceMarks(batchId, sessionDate, sessionDate, marks, userId);
      }

      toast.success(`Attendance saved for ${rows.length} students across ${byBatch.size} batch${byBatch.size !== 1 ? 'es' : ''}`);
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
      {/* Date selector */}
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
          <p className="text-sm font-medium text-brand-secondary">
            {DAY_OF_WEEK_LABELS[dayOfWeek]}
          </p>
          <p className="text-xs text-gray-400">
            {batchesForDay.length} batch{batchesForDay.length !== 1 ? 'es' : ''} scheduled
            {rows.length > 0 && ` · ${rows.length} students`}
          </p>
        </div>
      </div>

      {hasExisting && (
        <p className="text-xs text-yellow-600">
          Attendance was already recorded for some batches. You are editing existing records.
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

      {/* Roster grouped by time slot */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          {batchesForDay.length === 0
            ? 'No batches scheduled for this day.'
            : 'No expected attendees today.'}
        </p>
      ) : (
        <div className="space-y-4">
          {slotGroups.map((group) => {
            const collapsed = collapsedSlots.has(group.slotKey);
            const slotCounts = group.rows.reduce(
              (acc, r) => {
                acc[r.status] = (acc[r.status] ?? 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            );

            return (
              <div key={group.slotKey} className="rounded-lg border border-gray-200">
                {/* Slot header */}
                <button
                  type="button"
                  onClick={() => toggleSlotCollapse(group.slotKey)}
                  className="flex w-full items-center justify-between rounded-t-lg bg-gray-50 px-4 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-brand-secondary">
                      {group.slotLabel}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600 shadow-sm">
                      {group.rows.length} student{group.rows.length !== 1 ? 's' : ''}
                    </span>
                    {(slotCounts.ABSENT ?? 0) > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                        {slotCounts.ABSENT} absent
                      </span>
                    )}
                  </div>
                  {collapsed ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronUp size={16} className="text-gray-400" />}
                </button>

                {!collapsed && (
                  <div className="p-3">
                    {/* Per-slot mark all */}
                    <div className="mb-2 flex flex-wrap gap-1">
                      {STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => markSlotAs(group.slotKey, opt.value)}
                          className={cn('rounded border px-1.5 py-0.5 text-[10px] font-medium', opt.color)}
                          disabled={saving}
                        >
                          All {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      {group.rows.map((row) => (
                        <div
                          key={row.key}
                          className={cn(
                            'flex flex-col gap-1.5 rounded-lg border p-2.5 sm:flex-row sm:items-center',
                            row.status === 'PRESENT'
                              ? 'border-green-100 bg-green-50/30'
                              : row.status === 'ABSENT'
                                ? 'border-red-100 bg-red-50/30'
                                : 'border-gray-100',
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-medium text-brand-secondary">
                                {row.displayName}
                              </p>
                              {row.attendeeType !== 'REGULAR' && (
                                <span className={cn(
                                  'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                  row.attendeeType === 'MAKEUP' ? 'bg-purple-100 text-purple-700' :
                                  row.attendeeType === 'EXTRA' ? 'bg-indigo-100 text-indigo-700' :
                                  'bg-pink-100 text-pink-700',
                                )}>
                                  {row.attendeeType}
                                </span>
                              )}
                            </div>
                            {row.walkIn?.phone && (
                              <p className="text-xs text-gray-400">{row.walkIn.phone}</p>
                            )}
                          </div>

                          {/* Status toggle — simplified: tap toggles PRESENT ↔ ABSENT, long press shows all options */}
                          <div className="flex items-center gap-1.5">
                            {STATUS_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => patch(row.key, { status: opt.value })}
                                disabled={saving}
                                className={cn(
                                  'flex items-center gap-0.5 rounded-full border px-2 py-1 text-xs font-medium transition-colors',
                                  row.status === opt.value
                                    ? opt.color
                                    : 'border-gray-200 text-gray-400 hover:border-gray-300',
                                )}
                              >
                                {opt.icon}
                                <span className="hidden sm:inline">{opt.label}</span>
                              </button>
                            ))}

                            {row.attendeeType !== 'REGULAR' && (
                              <button
                                type="button"
                                onClick={() => removeRow(row.key)}
                                className="btn-ghost p-1 text-red-400 hover:text-red-600"
                                disabled={saving}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>

                          {row.status !== 'PRESENT' && (
                            <input
                              type="text"
                              placeholder="Note"
                              value={row.note}
                              onChange={(e) => patch(row.key, { note: e.target.value })}
                              className="input mt-1 py-1 text-xs sm:mt-0 sm:w-36"
                              disabled={saving}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add attendee */}
      {batchesForDay.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={() => {
              setPickerBatchId(batchesForDay[0]?.id ?? '');
              setShowPicker('student');
            }}
            className="btn-secondary text-xs"
            disabled={saving}
          >
            <UserPlus size={14} /> Add student (makeup / extra)
          </button>
          <button
            type="button"
            onClick={() => {
              setPickerBatchId(batchesForDay[0]?.id ?? '');
              setShowPicker('trial');
            }}
            className="btn-secondary text-xs"
            disabled={saving}
          >
            <Sparkles size={14} /> Add trial / walk-in
          </button>
        </div>
      )}

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
            {saving ? 'Saving…' : hasExisting ? 'Update Attendance' : 'Save Attendance'}
          </button>
        </div>
      )}

      {/* Picker modals */}
      {showPicker === 'student' && (
        <StudentPickerWithBatch
          batches={batchesForDay}
          defaultBatchId={pickerBatchId}
          excludeKeys={new Set(rows.map((r) => r.key))}
          onPick={(student, type, batchId) => addExistingStudent(student, type, batchId)}
          onClose={() => setShowPicker(null)}
        />
      )}
      {showPicker === 'trial' && (
        <TrialDialogWithBatch
          batches={batchesForDay}
          defaultBatchId={pickerBatchId}
          onAdd={(name, phone, notes, batchId) => addTrial(name, phone, notes, batchId)}
          onClose={() => setShowPicker(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Student Picker with batch selection

interface StudentPickerWithBatchProps {
  batches: BatchDocument[];
  defaultBatchId: string;
  excludeKeys: Set<string>;
  onPick: (s: StudentDocument, type: AttendeeType, batchId: string) => void;
  onClose: () => void;
}

function StudentPickerWithBatch({ batches, defaultBatchId, excludeKeys, onPick, onClose }: StudentPickerWithBatchProps) {
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<AttendeeType>('MAKEUP');
  const [batchId, setBatchId] = useState(defaultBatchId);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllStudents()
      .then((all) => setStudents(all.filter((s) => s.status === 'ACTIVE')))
      .catch((err) => { console.error(err); toast.error('Failed to load students'); })
      .finally(() => setLoading(false));
  }, []);

  const matches = useMemo(() => {
    let filtered = students.filter((s) => !excludeKeys.has(`${s.id}_${batchId}`));
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (s) => s.name.toLowerCase().includes(q) || s.guardianName.toLowerCase().includes(q) || s.phone?.includes(q),
      );
    }
    return filtered.slice(0, 20);
  }, [students, search, excludeKeys, batchId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-3">
          <h3 className="text-sm font-semibold text-brand-secondary">Add student to roster</h3>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <div className="p-3 space-y-2">
          {batches.length > 1 && (
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="input text-sm">
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setType('MAKEUP')} className={cn('flex-1 rounded border px-2 py-1 text-xs', type === 'MAKEUP' ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500')}>
              Makeup
            </button>
            <button type="button" onClick={() => setType('EXTRA')} className={cn('flex-1 rounded border px-2 py-1 text-xs', type === 'EXTRA' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500')}>
              Extra session
            </button>
          </div>
          <input type="text" placeholder="Search by name, guardian, phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="input" autoFocus />
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {loading ? (
              <p className="py-4 text-center text-xs text-gray-400">Loading…</p>
            ) : matches.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-400">No matches</p>
            ) : (
              matches.map((s) => (
                <button key={s.id} type="button" onClick={() => onPick(s, type, batchId)} className="w-full rounded p-2 text-left text-sm hover:bg-gray-50">
                  <p className="font-medium text-brand-secondary">{s.name}</p>
                  <p className="text-xs text-gray-400">{s.guardianName} {s.phone && `· ${s.phone}`}</p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Trial Dialog with batch selection

interface TrialDialogWithBatchProps {
  batches: BatchDocument[];
  defaultBatchId: string;
  onAdd: (name: string, phone: string, notes: string, batchId: string) => void;
  onClose: () => void;
}

function TrialDialogWithBatch({ batches, defaultBatchId, onAdd, onClose }: TrialDialogWithBatchProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [batchId, setBatchId] = useState(defaultBatchId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-3">
          <h3 className="text-sm font-semibold text-brand-secondary">Add trial / walk-in</h3>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <div className="space-y-3 p-3">
          {batches.length > 1 && (
            <div>
              <label className="label">Batch</label>
              <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="input text-sm">
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label">Name</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Trial attendee's name" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="+91 98765 43210" />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="How did they hear about us?" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 p-3">
          <button onClick={onClose} className="btn-secondary text-xs">Cancel</button>
          <button onClick={() => onAdd(name, phone, notes, batchId)} className="btn-primary text-xs">Add</button>
        </div>
      </div>
    </div>
  );
}
