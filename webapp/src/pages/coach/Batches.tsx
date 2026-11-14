/**
 * Coach batches page — view assigned batches with student lists and schedules.
 */

import { useState, useEffect, useCallback } from 'react';
import { Layers } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getBatchesByCoach } from '@/services/batchService';
import { getAllCentres } from '@/services/centreService';
import { BatchCard } from '@/components/batches/BatchCard';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import type { BatchDocument, CentreDocument } from '@bba/shared';

export default function CoachBatches() {
  const { profile } = useAuth();
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const [bData, cData] = await Promise.all([
        getBatchesByCoach(profile.id),
        getAllCentres(),
      ]);
      setBatches(bData);
      setCentres(cData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const centreMap = new Map(centres.map((c) => [c.id, c.name]));

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Batches</h1>
        <CardSkeleton count={3} />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Batches</h1>
        <EmptyState
          icon={<Layers size={48} />}
          title="No batches assigned"
          description="You haven't been assigned to any batches yet. Contact your centre manager."
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="mb-1 text-lg font-bold text-brand-secondary">My Batches</h1>
      <p className="mb-4 text-xs text-gray-400">{batches.length} batch{batches.length !== 1 ? 'es' : ''}</p>

      <div className="grid grid-cols-1 gap-3">
        {batches.map((b) => (
          <BatchCard
            key={b.id}
            batch={b}
            centreName={centreMap.get(b.centreId)}
            onEdit={() => {}}
            onDelete={() => {}}
          />
        ))}
      </div>
    </div>
  );
}
