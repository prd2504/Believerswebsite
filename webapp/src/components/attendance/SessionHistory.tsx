/**
 * Session history table — shows past attendance sessions for a batch
 * with summary counts (present/absent/late).
 */

import { useState, useEffect } from 'react';
import { Calendar, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import type { SessionDocument, AttendanceRecord } from '@bba/shared';
import { getSessionsByBatch, getAttendanceRecords } from '@/services/attendanceService';

const STATUS_DOT: Record<string, string> = {
  PRESENT: 'bg-green-500',
  ABSENT: 'bg-red-500',
  LATE: 'bg-yellow-500',
  EXCUSED: 'bg-blue-500',
};

interface SessionHistoryProps {
  batchId: string;
  batchName: string;
  /** Map of studentId → name for display */
  studentMap: Map<string, string>;
}

export function SessionHistory({ batchId, batchName, studentMap }: SessionHistoryProps) {
  const [sessions, setSessions] = useState<SessionDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedRecords, setExpandedRecords] = useState<AttendanceRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  useEffect(() => {
    if (!batchId) return;
    setLoading(true);
    getSessionsByBatch(batchId)
      .then(setSessions)
      .catch((err) => {
        console.error(err);
        toast.error('Failed to load session history');
      })
      .finally(() => setLoading(false));
  }, [batchId]);

  async function toggleExpand(sessionId: string) {
    if (expandedId === sessionId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(sessionId);
    setLoadingRecords(true);
    try {
      const records = await getAttendanceRecords(batchId, sessionId);
      setExpandedRecords(records);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load records');
    } finally {
      setLoadingRecords(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No attendance sessions recorded for {batchName} yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const isExpanded = expandedId === session.id;
        return (
          <div key={session.id} className="rounded-lg border border-gray-100">
            <button
              onClick={() => toggleExpand(session.id)}
              className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <Calendar size={14} className="text-gray-400" />
                <span className="text-sm font-medium text-brand-secondary">{session.sessionDate}</span>
                {session.cancelled && (
                  <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                    Cancelled
                  </span>
                )}
              </div>
              {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            </button>

            {isExpanded && (
              <div className="border-t border-gray-50 p-3">
                {loadingRecords ? (
                  <div className="h-10 animate-pulse rounded bg-gray-50" />
                ) : expandedRecords.length === 0 ? (
                  <p className="text-xs text-gray-400">No records for this session.</p>
                ) : (
                  <div className="space-y-1.5">
                    {expandedRecords.map((rec) => (
                      <div key={rec.id} className="flex items-center gap-2 text-xs">
                        <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[rec.status] ?? 'bg-gray-300')} />
                        <span className="flex-1 text-gray-700">
                          {studentMap.get(rec.studentId) ?? rec.studentId}
                        </span>
                        <span className="font-medium text-gray-500">{rec.status}</span>
                        {rec.note && <span className="text-gray-400">— {rec.note}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
