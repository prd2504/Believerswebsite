/**
 * Coach attendance page — unified view of all expected students across assigned
 * batches for a given day. Coach marks absences (all default PRESENT).
 */

import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getBatchesByCoach } from '@/services/batchService';
import { QuickAttendance } from '@/components/attendance/QuickAttendance';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import type { BatchDocument } from '@bba/shared';

export default function CoachAttendance() {
  const { profile } = useAuth();
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const data = await getBatchesByCoach(profile.id);
      setBatches(data.filter((b) => b.status === 'ACTIVE'));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load your batches');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">Mark Attendance</h1>
        <CardSkeleton count={2} />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">Mark Attendance</h1>
        <EmptyState
          icon={<ClipboardCheck size={48} />}
          title="No active batches"
          description="You are not assigned to any active batches yet."
        />
      </div>
    );
  }

  const centreId = batches[0].centreId;

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold text-brand-secondary">Mark Attendance</h1>
      <p className="mb-4 text-xs text-gray-500">
        All expected students across your batches are shown below. Everyone is marked present by default — just tap to mark absences.
      </p>
      <div className="card">
        {profile && (
          <QuickAttendance
            batches={batches}
            centreId={centreId}
            userId={profile.id}
            onDone={load}
          />
        )}
      </div>
    </div>
  );
}
