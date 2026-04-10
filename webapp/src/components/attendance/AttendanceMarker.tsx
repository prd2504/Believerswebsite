/**
 * Attendance marking UI. Coach selects a batch + date, then marks each
 * enrolled student. All marks are saved in one go.
 */

import { useState, useEffect } from 'react';
import { Check, X, Clock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import type { BatchDocument, StudentDocument, AttendanceStatus, AttendanceRecord } from '@bba/shared';
import {
  getOrCreateSession,
  saveAttendanceMarks,
  getAttendanceRecords,
} from '@/services/attendanceService';
import { getStudentsByBatch } from '@/services/studentService';

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'PRESENT', label: 'Present', icon: <Check size={14} />, color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'ABSENT', label: 'Absent', icon: <X size={14} />, color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'LATE', label: 'Late', icon: <Clock size={14} />, color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'EXCUSED', label: 'Excused', icon: <ShieldCheck size={14} />, color: 'bg-blue-100 text-blue-700 border-blue-300' },
];

interface MarkState {
  studentId: string;
  status: AttendanceStatus;
  note: string;
}

interface AttendanceMarkerProps {
  batches: BatchDocument[];
  centreId: string;
  userId: string;
  onDone?: () => void;
}

export function AttendanceMarker({ batches, centreId, userId, onDone }: AttendanceMarkerProps) {
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.id ?? '');
  const [sessionDate, setSessionDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [marks, setMarks] = useState<MarkState[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingRecords, setExistingRecords] = useState<AttendanceRecord[]>([]);

  // Load students and any existing records when batch/date changes
  useEffect(() => {
    if (!selectedBatchId || !sessionDate) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [studs, records] = await Promise.all([
          getStudentsByBatch(selectedBatchId),
          getAttendanceRecords(selectedBatchId, sessionDate).catch(() => []),
        ]);

        const activeStudents = studs.filter((s) => s.status === 'ACTIVE');
        setStudents(activeStudents);
        setExistingRecords(records);

        // Build marks from existing records or default to PRESENT
        const recordMap = new Map(records.map((r) => [r.studentId, r]));
        setMarks(
          activeStudents.map((s) => ({
            studentId: s.id,
            status: recordMap.get(s.id)?.status ?? 'PRESENT',
            note: recordMap.get(s.id)?.note ?? '',
          })),
        );
      } catch (err) {
        console.error(err);
        toast.error('Failed to load student list');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedBatchId, sessionDate]);

  function setStudentStatus(studentId: string, status: AttendanceStatus) {
    setMarks((prev) =>
      prev.map((m) => (m.studentId === studentId ? { ...m, status } : m)),
    );
  }

  function setStudentNote(studentId: string, note: string) {
    setMarks((prev) =>
      prev.map((m) => (m.studentId === studentId ? { ...m, note } : m)),
    );
  }

  function markAllAs(status: AttendanceStatus) {
    setMarks((prev) => prev.map((m) => ({ ...m, status })));
  }

  async function handleSave() {
    if (!selectedBatchId || marks.length === 0) return;
    setSaving(true);
    try {
      await getOrCreateSession(selectedBatchId, centreId, sessionDate, userId);
      await saveAttendanceMarks(
        selectedBatchId,
        sessionDate,
        sessionDate,
        marks.map((m) => ({ studentId: m.studentId, status: m.status, note: m.note || undefined })),
        userId,
      );
      toast.success('Attendance saved');
      onDone?.();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save attendance');
    } finally {
      setSaving(false);
    }
  }

  const presentCount = marks.filter((m) => m.status === 'PRESENT').length;
  const lateCount = marks.filter((m) => m.status === 'LATE').length;
  const absentCount = marks.filter((m) => m.status === 'ABSENT').length;

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
              <option key={b.id} value={b.id}>{b.name}</option>
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

      {existingRecords.length > 0 && (
        <p className="text-xs text-yellow-600">
          Attendance was already recorded for this session. You are editing existing records.
        </p>
      )}

      {/* Quick actions */}
      {students.length > 0 && (
        <div className="flex items-center gap-2">
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

      {/* Student list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          {selectedBatchId ? 'No active students in this batch.' : 'Select a batch to start.'}
        </p>
      ) : (
        <div className="space-y-2">
          {marks.map((mark) => {
            const student = students.find((s) => s.id === mark.studentId);
            if (!student) return null;

            return (
              <div
                key={mark.studentId}
                className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3 sm:flex-row sm:items-center"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-brand-secondary">{student.name}</p>
                  {student.guardianName && (
                    <p className="text-xs text-gray-400">Guardian: {student.guardianName}</p>
                  )}
                </div>

                {/* Status buttons */}
                <div className="flex gap-1.5">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStudentStatus(mark.studentId, opt.value)}
                      disabled={saving}
                      className={cn(
                        'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        mark.status === opt.value
                          ? opt.color
                          : 'border-gray-200 text-gray-400 hover:border-gray-300',
                      )}
                    >
                      {opt.icon}
                      <span className="hidden sm:inline">{opt.label}</span>
                    </button>
                  ))}
                </div>

                {/* Note input (shown when not PRESENT) */}
                {mark.status !== 'PRESENT' && (
                  <input
                    type="text"
                    placeholder="Note (optional)"
                    value={mark.note}
                    onChange={(e) => setStudentNote(mark.studentId, e.target.value)}
                    className="input mt-1 py-1 text-xs sm:mt-0 sm:w-40"
                    disabled={saving}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary & save */}
      {students.length > 0 && (
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <div className="flex gap-4 text-xs text-gray-500">
            <span className="text-green-600">{presentCount} present</span>
            <span className="text-yellow-600">{lateCount} late</span>
            <span className="text-red-600">{absentCount} absent</span>
            <span className="text-gray-500">{marks.length} total</span>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || marks.length === 0}
            className="btn-primary"
          >
            {saving ? 'Saving…' : existingRecords.length > 0 ? 'Update Attendance' : 'Save Attendance'}
          </button>
        </div>
      )}
    </div>
  );
}
