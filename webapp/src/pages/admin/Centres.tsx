/**
 * Centre management page — list all centres with create/edit/delete.
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getAllCentres, createCentre, updateCentre, deleteCentre } from '@/services/centreService';
import { CentreCard } from '@/components/centres/CentreCard';
import { CentreForm } from '@/components/centres/CentreForm';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import type { CentreDocument } from '@bba/shared';
import type { CentreFormValues } from '@/lib/schemas/centreSchema';

type Mode = 'list' | 'create' | 'edit';

export default function CentresPage() {
  const { profile } = useAuth();
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('list');
  const [editTarget, setEditTarget] = useState<CentreDocument | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllCentres();
      setCentres(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load centres');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (values: CentreFormValues) => {
    if (!profile) return;
    setBusy(true);
    try {
      await createCentre(values, profile.id);
      toast.success('Centre created');
      setMode('list');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create centre');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (values: CentreFormValues) => {
    if (!profile || !editTarget) return;
    setBusy(true);
    try {
      await updateCentre(editTarget.id, values, profile.id);
      toast.success('Centre updated');
      setMode('list');
      setEditTarget(null);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update centre');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (centre: CentreDocument) => {
    if (!confirm(`Delete "${centre.name}"? This cannot be undone.`)) return;
    try {
      await deleteCentre(centre.id);
      toast.success('Centre deleted');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete centre');
    }
  };

  const handleEdit = (centre: CentreDocument) => {
    setEditTarget(centre);
    setMode('edit');
  };

  /** Map CentreDocument back to form values for the edit form. */
  function centreToFormValues(c: CentreDocument): Partial<CentreFormValues> {
    return {
      name: c.name,
      address: c.address,
      city: c.city,
      pincode: c.pincode,
      googleMapsUrl: c.googleMapsUrl ?? '',
      courtCount: c.courtCount,
      sportTypes: c.sportTypes as string[],
      operatingHours: c.operatingHours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
        closed: h.closed,
      })),
      gstRatePercent: c.gstRatePercent,
      active: c.active,
      contactPhone: c.contactPhone ?? '',
      contactEmail: c.contactEmail ?? '',
    };
  }

  // --- Create / Edit view ----
  if (mode === 'create') {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Add New Centre</h1>
        <div className="card">
          <CentreForm
            onSubmit={handleCreate}
            onCancel={() => setMode('list')}
            busy={busy}
          />
        </div>
      </div>
    );
  }

  if (mode === 'edit' && editTarget) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Edit Centre</h1>
        <div className="card">
          <CentreForm
            initialValues={centreToFormValues(editTarget)}
            onSubmit={handleUpdate}
            onCancel={() => { setMode('list'); setEditTarget(null); }}
            busy={busy}
          />
        </div>
      </div>
    );
  }

  // --- List view ----
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Centres</h1>
          <p className="text-sm text-gray-500">{centres.length} centre{centres.length !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={() => setMode('create')} className="btn-primary">
          <Plus size={16} />
          Add Centre
        </button>
      </div>

      {loading ? (
        <CardSkeleton count={4} />
      ) : centres.length === 0 ? (
        <EmptyState
          icon={<MapPin size={48} />}
          title="No centres yet"
          description="Create your first centre to start setting up batches and enrolments."
          action={
            <button onClick={() => setMode('create')} className="btn-primary">
              <Plus size={16} /> Add your first centre
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {centres.map((c) => (
            <CentreCard key={c.id} centre={c} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
