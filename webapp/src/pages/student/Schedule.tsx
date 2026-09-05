/**
 * Student schedule page — weekly view of the student's enrolled sessions.
 *
 * Uses the EnrollmentDocument's selectedDays so the calendar reflects exactly the
 * days the student picked at enrolment, not every day the batch is offered.
 */

import { useState, useEffect, useCallback } from 'react';
import { Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getAllBatches } from '@/services/batchService';
import { getAllCentres } from '@/services/centreService';
import { getEnrollmentsByStudent } from '@/services/enrollmentService';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { cn } from '@/lib/cn';
import type { BatchDocument, CentreDocument, EnrollmentDocument } from '@bba/shared';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function SchedulePage() {
  const { profile } = useAuth();
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const studentIds = profile.linkedStudentIds?.length
        ? profile.linkedStudentIds
        : [profile.id];

      const [bData, cData, ...enrollmentLists] = await Promise.all([
        getAllBatches(),
        getAllCentres(),
        ...studentIds.map((sid) => getEnrollmentsByStudent(sid)),
      ]);

      const allEnrollments = enrollmentLists.flat().filter((e) => e.status === 'ACTIVE');
      const batchIds = new Set(allEnrollments.map((e) => e.batchId));
      setBatches(bData.filter((b) => batchIds.has(b.id)));
      setCentres(cData);
      setEnrollments(allEnrollments);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const centreMap = new Map(centres.map((c) => [c.id, c.name]));
  const batchMap = new Map(batches.map((b) => [b.id, b]));
  const todayDow = new Date().getDay();

  // Build day-wise schedule from enrollments (not batches), so each day shows only
  // the sessions the student actually attends.
  const weekSchedule = DAY_LABELS.map((label, dow) => {
    const sessions = enrollments
      .filter((e) => e.selectedDays.includes(dow as never))
      .map((e) => {
        const batch = batchMap.get(e.batchId);
        return {
          batchName: batch?.name ?? 'Batch',
          centreName: centreMap.get(e.centreId) ?? '',
          startTime: batch?.startTime ?? '',
          endTime: batch?.endTime ?? '',
        };
      });
    return { label, dow, sessions };
  });

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Schedule</h1>
        <CardSkeleton count={4} />
      </div>
    );
  }

  if (enrollments.length === 0) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Schedule</h1>
        <EmptyState
          icon={<Calendar size={48} />}
          title="No schedule yet"
          description="You are not enrolled in any batches yet. Your schedule will appear here once you're added to a batch."
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Schedule</h1>

      <div className="space-y-2">
        {weekSchedule.map(({ label, dow, sessions }) => (
          <div
            key={dow}
            className={cn(
              'rounded-lg border p-3',
              dow === todayDow ? 'border-brand-primary bg-brand-primary-light' : 'border-gray-100',
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className={cn('text-sm font-medium', dow === todayDow ? 'text-brand-primary' : 'text-brand-secondary')}>
                {label}
                {dow === todayDow && <span className="ml-2 text-[10px] font-normal text-brand-primary">(Today)</span>}
              </span>
            </div>
            {sessions.length === 0 ? (
              <p className="text-xs text-gray-400">Rest day</p>
            ) : (
              <div className="space-y-1">
                {sessions.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-gray-600">
                    <span>{s.batchName} {s.centreName && `— ${s.centreName}`}</span>
                    <span className="text-gray-400">{s.startTime} – {s.endTime}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
