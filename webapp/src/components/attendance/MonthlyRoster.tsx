/**
 * MonthlyRoster — spreadsheet-style attendance grid.
 * Rows = students, Columns = dates in the selected month.
 * Cells show P/A/L/E with colour coding.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Download, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  getSessionsByDateRange,
  getAttendanceRecords,
} from '@/services/attendanceService';
import { getEnrollmentsByBatch } from '@/services/enrollmentService';
import { cn } from '@/lib/cn';
import type { BatchDocument, StudentDocument, AttendanceRecord, SessionDocument } from '@bba/shared';

const STATUS_CELL: Record<string, { label: string; bg: string; text: string }> = {
  PRESENT: { label: 'P', bg: 'bg-green-100', text: 'text-green-700' },
  ABSENT: { label: 'A', bg: 'bg-red-100', text: 'text-red-700' },
  LATE: { label: 'L', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  EXCUSED: { label: 'E', bg: 'bg-blue-100', text: 'text-blue-700' },
};

interface MonthlyRosterProps {
  batches: BatchDocument[];
  students: StudentDocument[];
  centreFilter: string;
}

export function MonthlyRoster({ batches, students, centreFilter }: MonthlyRosterProps) {
  const [batchId, setBatchId] = useState(batches[0]?.id ?? '');
  /**
   * Student ids with an ACTIVE enrolment in the selected batch.
   *
   * Read from /enrollments rather than `batch.studentIds`. That array is a
   * denormalised mirror that no single code path owned: deleting a student
   * never cleaned it, imports and direct edits never wrote it, and batches
   * predating the mirror never had it at all. A batch whose mirror was empty
   * rendered "No students enrolled" over a roster full of people.
   */
  const [enrolledIds, setEnrolledIds] = useState<string[]>([]);
  const [enrolLoading, setEnrolLoading] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [sessions, setSessions] = useState<SessionDocument[]>([]);
  const [records, setRecords] = useState<Map<string, AttendanceRecord[]>>(new Map());
  const [loading, setLoading] = useState(false);

  const filteredBatches = useMemo(() => {
    return centreFilter ? batches.filter((b) => b.centreId === centreFilter) : batches;
  }, [batches, centreFilter]);

  // Keep the selection inside the list the dropdown actually offers. Without
  // this, changing the centre filter left `batchId` pointing at a batch that
  // is no longer an option: the <select> falls back to displaying the first
  // one while the grid below still renders the old batch, so the page names
  // one batch and shows another.
  useEffect(() => {
    if (filteredBatches.length === 0) { setBatchId(''); return; }
    if (!filteredBatches.some((b) => b.id === batchId)) setBatchId(filteredBatches[0].id);
  }, [filteredBatches, batchId]);

  const selectedBatch = batches.find((b) => b.id === batchId);

  useEffect(() => {
    if (!batchId) { setEnrolledIds([]); return; }
    let cancelled = false;
    setEnrolLoading(true);
    getEnrollmentsByBatch(batchId)
      .then((rows) => {
        if (cancelled) return;
        setEnrolledIds(rows.filter((e) => e.status === 'ACTIVE').map((e) => e.studentId));
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) { setEnrolledIds([]); toast.error('Could not load the batch roster'); }
      })
      .finally(() => { if (!cancelled) setEnrolLoading(false); });
    return () => { cancelled = true; };
  }, [batchId]);

  const batchStudents = useMemo(() => {
    const ids = new Set(enrolledIds);
    return students
      .filter((s) => ids.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [enrolledIds, students]);

  /**
   * Enrolled students whose /students document is missing or unreadable.
   * Silently dropping them is how a roster quietly loses a person; naming the
   * count at least says the grid is short.
   */
  const missingStudentCount = Math.max(0, new Set(enrolledIds).size - batchStudents.length);

  // Dates in month
  const datesInMonth = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const dates: string[] = [];
    for (let d = 1; d <= days; d++) {
      dates.push(`${month}-${String(d).padStart(2, '0')}`);
    }
    return dates;
  }, [month]);

  // Session dates set (to know which dates had sessions)
  const sessionDateSet = useMemo(() => {
    const s = new Set<string>();
    sessions.forEach((sess) => s.add(sess.sessionDate));
    return s;
  }, [sessions]);

  const loadData = useCallback(async () => {
    if (!batchId || !month) return;
    setLoading(true);
    try {
      const [y, m] = month.split('-').map(Number);
      const start = `${month}-01`;
      const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
      const sessData = await getSessionsByDateRange(batchId, start, end);
      setSessions(sessData);

      // Load records for all sessions
      const recordMap = new Map<string, AttendanceRecord[]>();
      await Promise.all(
        sessData.map(async (s) => {
          const recs = await getAttendanceRecords(batchId, s.id);
          recordMap.set(s.sessionDate, recs);
        }),
      );
      setRecords(recordMap);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  }, [batchId, month]);

  useEffect(() => { loadData(); }, [loadData]);

  // Build grid data: studentId -> date -> status
  const grid = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    batchStudents.forEach((s) => map.set(s.id, new Map()));
    records.forEach((recs, date) => {
      recs.forEach((r) => {
        if (r.studentId && map.has(r.studentId)) {
          map.get(r.studentId)!.set(date, r.status);
        }
      });
    });
    return map;
  }, [batchStudents, records]);

  // Summary stats per student
  const studentStats = useMemo(() => {
    const stats = new Map<string, { present: number; total: number; pct: number }>();
    batchStudents.forEach((s) => {
      const row = grid.get(s.id);
      if (!row) { stats.set(s.id, { present: 0, total: 0, pct: 0 }); return; }
      let present = 0;
      let total = 0;
      row.forEach((status) => {
        total++;
        if (status === 'PRESENT' || status === 'LATE') present++;
      });
      stats.set(s.id, { present, total, pct: total > 0 ? Math.round((present / total) * 100) : 0 });
    });
    return stats;
  }, [grid, batchStudents]);

  function prevMonth() {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  function nextMonth() {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  function monthLabel() {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  function dayLabel(date: string) {
    return new Date(date + 'T00:00:00').getDate().toString();
  }

  function dayOfWeek(date: string) {
    return new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'narrow' });
  }

  // Export CSV
  function handleExport() {
    if (batchStudents.length === 0) return;
    const headers = ['Student', ...datesInMonth.filter((d) => sessionDateSet.has(d)).map((d) => d.slice(5)), '% Attendance'];
    const rows = batchStudents.map((s) => {
      const row = grid.get(s.id)!;
      const cells = datesInMonth
        .filter((d) => sessionDateSet.has(d))
        .map((d) => {
          const status = row.get(d);
          return status ? STATUS_CELL[status]?.label ?? '-' : '-';
        });
      const stat = studentStats.get(s.id);
      return [s.name, ...cells, `${stat?.pct ?? 0}%`];
    });

    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${selectedBatch?.name ?? 'batch'}_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Roster exported');
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            className="input w-auto py-2 text-sm"
          >
            {filteredBatches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="btn-ghost p-1.5"><ChevronLeft size={16} /></button>
            <span className="text-sm font-medium text-brand-secondary min-w-[130px] text-center">
              {monthLabel()}
            </span>
            <button onClick={nextMonth} className="btn-ghost p-1.5"><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} · {batchStudents.length} students
          </span>
          <button onClick={handleExport} className="btn-secondary text-sm" disabled={batchStudents.length === 0}>
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(STATUS_CELL).map(([key, val]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={cn('inline-block h-4 w-4 rounded text-center text-[10px] font-bold leading-4', val.bg, val.text)}>
              {val.label}
            </span>
            <span className="text-gray-500 capitalize">{key.toLowerCase()}</span>
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-4 rounded bg-gray-50 text-center text-[10px] font-bold leading-4 text-gray-300">-</span>
          <span className="text-gray-500">No session</span>
        </span>
      </div>

      {/* Grid */}
      {missingStudentCount > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {missingStudentCount} enrolled student{missingStudentCount === 1 ? ' has' : 's have'} no
          student record and {missingStudentCount === 1 ? 'is' : 'are'} not shown below.
        </p>
      )}

      {loading || enrolLoading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading roster…</div>
      ) : !selectedBatch ? (
        <div className="py-12 text-center text-sm text-gray-400">
          <Users size={32} className="mx-auto mb-2 text-gray-300" />
          No batch selected{centreFilter ? ' for this centre' : ''}.
        </div>
      ) : batchStudents.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          <Users size={32} className="mx-auto mb-2 text-gray-300" />
          No active enrolments in {selectedBatch.name}.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 min-w-[140px]">
                  Student
                </th>
                {datesInMonth.map((date) => {
                  const hasSession = sessionDateSet.has(date);
                  return (
                    <th
                      key={date}
                      className={cn(
                        'px-1 py-2 text-center font-medium min-w-[28px]',
                        hasSession ? 'text-gray-600' : 'text-gray-300',
                      )}
                    >
                      <div className="text-[10px] text-gray-400">{dayOfWeek(date)}</div>
                      <div>{dayLabel(date)}</div>
                    </th>
                  );
                })}
                <th className="sticky right-0 z-20 bg-gray-50 px-3 py-2 text-center font-semibold text-gray-600 min-w-[50px]">
                  %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {batchStudents.map((student) => {
                const row = grid.get(student.id)!;
                const stat = studentStats.get(student.id)!;
                return (
                  <tr key={student.id} className="hover:bg-gray-50/50">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-gray-800 whitespace-nowrap border-r border-gray-50">
                      {student.name}
                    </td>
                    {datesInMonth.map((date) => {
                      const hasSession = sessionDateSet.has(date);
                      const status = row.get(date);
                      const cell = status ? STATUS_CELL[status] : null;
                      return (
                        <td key={date} className="px-1 py-1.5 text-center">
                          {hasSession && cell ? (
                            <span
                              className={cn(
                                'inline-block h-5 w-5 rounded text-[10px] font-bold leading-5',
                                cell.bg,
                                cell.text,
                              )}
                              title={`${student.name} — ${date} — ${status}`}
                            >
                              {cell.label}
                            </span>
                          ) : hasSession && !cell ? (
                            <span className="inline-block h-5 w-5 rounded bg-gray-100 text-[10px] font-bold leading-5 text-gray-400">
                              -
                            </span>
                          ) : (
                            <span className="inline-block h-5 w-5" />
                          )}
                        </td>
                      );
                    })}
                    <td className={cn(
                      'sticky right-0 z-10 bg-white px-3 py-2 text-center font-bold border-l border-gray-50',
                      stat.pct >= 75 ? 'text-green-600' :
                      stat.pct >= 50 ? 'text-yellow-600' : 'text-red-600',
                    )}>
                      {stat.total > 0 ? `${stat.pct}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
