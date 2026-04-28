/**
 * Batch management page — list all batches with centre filter, create/edit/delete.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getAllBatches, createBatch, updateBatch, deleteBatch } from '@/services/batchService';
import { getAllCentres } from '@/services/centreService';
import { BatchCard } from '@/components/batches/BatchCard';
import { BatchForm } from '@/components/batches/BatchForm';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { paiseToRupees } from '@bba/shared';
import type { BatchDocument, CentreDocument } from '@bba/shared';
import type { BatchFormValues } from '@/lib/schemas/batchSchema';

type Mode = 'list' | 'create' | 'edit';

export default function BatchesPage() {
  const { profile } = useAuth();
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('list');
  const [editTarget, setEditTarget] = useState<BatchDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [centreFilter, setCentreFilter] = useState<string>('');

  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  const filteredBatches = centreFilter
    ? batches.filter((b) => b.centreId === centreFilter)
    : batches;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [bData, cData] = await Promise.all([getAllBatches(), getAllCentres()]);
      setBatches(bData);
      setCentres(cData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (values: BatchFormValues) => {
    if (!profile) return;
    setBusy(true);
    try {
      await createBatch(values, profile.id);
      toast.success('Batch created');
      setMode('list');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create batch');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (values: BatchFormValues) => {
    if (!profile || !editTarget) return;
    setBusy(true);
    try {
      await updateBatch(editTarget.id, values, profile.id);
      toast.success('Batch updated');
      setMode('list');
      setEditTarget(null);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update batch');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (batch: BatchDocument) => {
    if (!confirm(`Delete batch "${batch.name}"? This cannot be undone.`)) return;
    try {
      await deleteBatch(batch.id);
      toast.success('Batch deleted');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete batch');
    }
  };

  const handleEdit = (batch: BatchDocument) => {
    setEditTarget(batch);
    setMode('edit');
  };

  function batchToFormValues(b: BatchDocument): Partial<BatchFormValues> {
    return {
      centreId: b.centreId,
      name: b.name,
      description: b.description,
      sport: b.sport,
      level: b.level,
      startTime: b.startTime,
      endTime: b.endTime,
      offeredDays: b.offeredDays,
      frequencyPlans: b.frequencyPlans.map((p) => ({
        daysPerWeek: p.daysPerWeek,
        monthlyFeeRupees: paiseToRupees(p.monthlyFeePaise),
      })),
      maxCapacity: b.maxCapacity,
      coachIds: b.coachIds,
      status: b.status,
    };
  }

  // --- Create / Edit ---
  if (mode === 'create') {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Add New Batch</h1>
        <div className="card">
          <BatchForm centres={centres} onSubmit={handleCreate} onCancel={() => setMode('list')} busy={busy} />
        </div>
      </div>
    );
  }

  if (mode === 'edit' && editTarget) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Edit Batch</h1>
        <div className="card">
          <BatchForm
            centres={centres}
            initialValues={batchToFormValues(editTarget)}
            onSubmit={handleUpdate}
            onCancel={() => { setMode('list'); setEditTarget(null); }}
            busy={busy}
          />
        </div>
      </div>
    );
  }

  // --- List view ---
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Batches</h1>
          <p className="text-sm text-gray-500">
            {filteredBatches.length} batch{filteredBatches.length !== 1 ? 'es' : ''}
            {centreFilter ? ` at ${centreMap.get(centreFilter) ?? 'selected centre'}` : ' total'}
          </p>
        </div>
        <div className="flex gap-3">
          <select
            value={centreFilter}
            onChange={(e) => setCentreFilter(e.target.value)}
            className="input w-auto py-2 text-sm"
          >
            <option value="">All Centres</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button onClick={() => setMode('create')} className="btn-primary">
            <Plus size={16} /> Add Batch
          </button>
        </div>
      </div>

      {loading ? (
        <CardSkeleton count={6} />
      ) : filteredBatches.length === 0 ? (
        <EmptyState
          icon={<Layers size={48} />}
          title={centres.length === 0 ? 'Add a centre first' : 'No batches yet'}
          description={
            centres.length === 0
              ? 'You need at least one centre before creating batches.'
              : 'Create your first batch to start scheduling sessions.'
          }
          action={
            centres.length > 0 ? (
              <button onClick={() => setMode('create')} className="btn-primary">
                <Plus size={16} /> Add your first batch
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBatches.map((b) => (
            <BatchCard
              key={b.id}
              batch={b}
              centreName={centreMap.get(b.centreId)}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
