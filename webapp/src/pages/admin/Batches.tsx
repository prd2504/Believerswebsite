/**
 * Batch management page — list all batches with centre filter, create/edit/delete.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getAllBatches, createBatch, updateBatch, deleteBatch } from '@/services/batchService';
import { getAllCentres } from '@/services/centreService';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BatchCard } from '@/components/batches/BatchCard';
import { BatchForm } from '@/components/batches/BatchForm';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { paiseToRupees, paymentCoversMonth } from '@bba/shared';
import type { BatchDocument, CentreDocument } from '@bba/shared';
import type { BatchFormValues } from '@/lib/schemas/batchSchema';

type Mode = 'list' | 'create' | 'edit';

export default function BatchesPage() {
  const { profile } = useAuth();
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  /**
   * How many people in each batch have actually paid for THIS month.
   *
   * The first attempt at this counted ACTIVE enrolments minus anyone with the
   * current month in `pausedMonths` — but that is a flag an admin sets by
   * hand, and nobody sets it, so the number came out identical to the
   * enrolment count on every card and told you nothing.
   *
   * Nothing ends an enrolment when a family simply stops paying, so the
   * enrolment roll only ever grows: that is why batches read 133%, 138%, 200%
   * of capacity while the real roll is smaller. Payment coverage is the honest
   * measure of who is currently training, and it is coverage-aware, so a
   * quarterly payment made in September still counts its payer in November.
   */
  const [attendingByBatch, setAttendingByBatch] = useState<Record<string, number>>({});
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
      const ym = new Date().toISOString().slice(0, 7);
      // Far enough back to catch a quarterly payment that still covers this
      // month. CYCLE_MONTHS tops out at 3, so two months back is enough.
      const [y, m] = ym.split('-').map(Number);
      const from = new Date(y, m - 3, 1);
      const fromMonth = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;

      const [bData, cData, enrolSnap, paySnap] = await Promise.all([
        getAllBatches(),
        getAllCentres(),
        // Two collection reads for the whole page, rather than one query per
        // batch card.
        getDocs(query(collection(db, 'enrollments'), where('status', '==', 'ACTIVE'))),
        getDocs(query(
          collection(db, 'payments'),
          where('month', '>=', fromMonth),
          where('month', '<=', ym),
        )),
      ]);
      setBatches(bData);
      setCentres(cData);

      // Who is paid up for this month, coverage-aware.
      const paidStudentIds = new Set<string>();
      paySnap.docs.forEach((d) => {
        const p = d.data();
        if (p.status === 'REFUNDED') return;
        if (!p.studentId) return;
        if (!paymentCoversMonth(
          { month: p.month, coverageMonths: p.coverageMonths, coverageEndMonth: p.coverageEndMonth },
          ym,
        )) return;
        paidStudentIds.add(String(p.studentId));
      });

      const counts: Record<string, number> = {};
      enrolSnap.docs.forEach((d) => {
        const e = d.data();
        const bid = String(e.batchId ?? '');
        if (!bid) return;
        if (Array.isArray(e.pausedMonths) && e.pausedMonths.includes(ym)) return;
        if (!paidStudentIds.has(String(e.studentId ?? ''))) return;
        counts[bid] = (counts[bid] ?? 0) + 1;
      });
      setAttendingByBatch(counts);
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
      timeSlots: b.timeSlots ?? [],
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
              attendingThisMonth={attendingByBatch[b.id] ?? 0}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
