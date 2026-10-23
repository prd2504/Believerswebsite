/**
 * Student attendance page — view attendance history across enrolled batches.
 */

import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getAllBatches } from '@/services/batchService';
import { getSessionsByBatch, getAttendanceRecords } from '@/services/attendanceService';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { cn } from '@/lib/cn';
import type { BatchDocument, AttendanceRecord } from '@bba/shared';

const STATUS_STYLE: Record<string, string> = {
  PRESENT: 'bg-green-100 text-green-700',
  ABSENT: 'bg-red-100 text-red-700',
  LATE: 'bg-yellow-100 text-yellow-700',
  EXCUSED: 'bg-blue-100 text-blue-700',
};

interface DayRecord {
  date: string;
  batchName: string;
  status: string;
  note: string | null;
}

export default function StudentAttendance() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const studentIds = profile.linkedStudentIds?.length
        ? profile.linkedStudentIds
        : [profile.id];

      const allBatches = await getAllBatches();
      const myBatches = allBatches.filter((b) =>
        b.studentIds.some((sid) => studentIds.includes(sid)),
      );

      const allRecords: DayRecord[] = [];
      for (const batch of myBatches) {
        const sessions = await getSessionsByBatch(batch.id);
        for (const session of sessions.slice(0, 30)) {
          const recs = await getAttendanceRecords(batch.id, session.id);
          const myRec = recs.find((r) => r.studentId != null && studentIds.includes(r.studentId));
          if (myRec) {
            allRecords.push({
              date: session.sessionDate,
              batchName: batch.name,
              status: myRec.status,
              note: myRec.note,
            });
          }
        }
      }
      allRecords.sort((a, b) => b.date.localeCompare(a.date));
      setRecords(allRecords);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const presentCount = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
  const attendancePct = records.length > 0 ? Math.round((presentCount / records.length) * 100) : 0;

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Attendance</h1>
        <CardSkeleton count={4} />
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Attendance</h1>
        <EmptyState
          icon={<ClipboardCheck size={48} />}
          title="No attendance records"
          description="Your attendance history will appear here once your coach starts marking sessions."
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Attendance</h1>

      {/* Summary */}
      <div className="mb-5 card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Overall Attendance</p>
            <p className="text-2xl font-bold text-brand-secondary">{attendancePct}%</p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>{presentCount} present out of {records.length} sessions</p>
          </div>
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
          <div
            className={cn(
              'h-2 rounded-full',
              attendancePct >= 75 ? 'bg-green-400' : attendancePct >= 50 ? 'bg-yellow-400' : 'bg-red-400',
            )}
            style={{ width: `${attendancePct}%` }}
          />
        </div>
      </div>

      {/* Records */}
      <div className="space-y-1.5">
        {records.map((r, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-gray-100 p-2.5">
            <div>
              <p className="text-xs font-medium text-brand-secondary">{r.date}</p>
              <p className="text-[10px] text-gray-400">{r.batchName}</p>
            </div>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_STYLE[r.status] ?? 'bg-gray-100 text-gray-500')}>
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
