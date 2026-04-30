/**
 * Admin Coaches page — manage coach accounts.
 *
 * Two tabs:
 *   Pending  — coaches awaiting approval; admin assigns centres/batches then approves.
 *   Active   — approved coaches; admin can update assignments or suspend.
 *
 * NO coach account is created here — coaches either self-register (pending) or the
 * admin creates a Firebase Auth user externally and the /users doc is pre-written here.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { UserCheck, UserX, Users, Edit2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  getAllCoaches,
  approveCoach,
  updateCoachAssignments,
  suspendCoach,
  reactivateCoach,
} from '@/services/userService';
import { getAllCentres } from '@/services/centreService';
import { getAllBatches } from '@/services/batchService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { AccountStatus } from '@bba/shared';
import type { UserDocument, CentreDocument, BatchDocument } from '@bba/shared';

type Tab = 'pending' | 'active';

export default function CoachesPage() {
  const { profile } = useAuth();
  const [coaches, setCoaches] = useState<UserDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('pending');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCentres, setEditCentres] = useState<string[]>([]);
  const [editBatches, setEditBatches] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [cData, bData, coachData] = await Promise.all([
        getAllCentres(),
        getAllBatches(),
        getAllCoaches(),
      ]);
      setCentres(cData);
      setBatches(bData);
      setCoaches(coachData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load coaches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = useMemo(
    () => coaches.filter((c) => c.accountStatus === AccountStatus.PENDING_APPROVAL),
    [coaches],
  );
  const active = useMemo(
    () => coaches.filter((c) => c.accountStatus === AccountStatus.ACTIVE),
    [coaches],
  );
  const suspended = useMemo(
    () => coaches.filter((c) => c.accountStatus === AccountStatus.SUSPENDED),
    [coaches],
  );

  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  const batchMap = useMemo(() => {
    const m = new Map<string, string>();
    batches.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [batches]);

  function startEdit(coach: UserDocument) {
    setEditingId(coach.id);
    setEditCentres([...coach.centreIds]);
    setEditBatches([...(coach.assignedBatchIds ?? [])]);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditCentres([]);
    setEditBatches([]);
  }

  function toggleCentre(id: string) {
    setEditCentres((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleBatch(id: string) {
    setEditBatches((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleApprove(coach: UserDocument) {
    if (!profile) return;
    if (editCentres.length === 0) {
      toast.error('Assign at least one centre before approving.');
      return;
    }
    setBusy(true);
    try {
      await approveCoach(coach.id, editCentres, editBatches, profile.id);
      toast.success(`${coach.name} approved`);
      cancelEdit();
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to approve coach');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAssignments(coach: UserDocument) {
    if (!profile) return;
    setBusy(true);
    try {
      await updateCoachAssignments(coach.id, editCentres, editBatches, profile.id);
      toast.success('Assignments updated');
      cancelEdit();
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update assignments');
    } finally {
      setBusy(false);
    }
  }

  async function handleSuspend(coach: UserDocument) {
    if (!profile) return;
    if (!confirm(`Suspend ${coach.name}? They won't be able to use the app.`)) return;
    setBusy(true);
    try {
      await suspendCoach(coach.id, profile.id);
      toast.success(`${coach.name} suspended`);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to suspend coach');
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivate(coach: UserDocument) {
    if (!profile) return;
    setBusy(true);
    try {
      await reactivateCoach(coach.id, profile.id);
      toast.success(`${coach.name} reactivated`);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to reactivate coach');
    } finally {
      setBusy(false);
    }
  }

  function AssignmentEditor({ coach, onSave }: { coach: UserDocument; onSave: () => void }) {
    const filteredBatches = editCentres.length > 0
      ? batches.filter((b) => editCentres.includes(b.centreId) && b.status === 'ACTIVE')
      : [];

    return (
      <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-gray-600">Assign centres</p>
          <div className="flex flex-wrap gap-2">
            {centres.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCentre(c.id)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  editCentres.includes(c.id)
                    ? 'border-brand-primary bg-brand-primary text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
                disabled={busy}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        {filteredBatches.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-600">Assign batches</p>
            <div className="flex flex-wrap gap-2">
              {filteredBatches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleBatch(b.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    editBatches.includes(b.id)
                      ? 'border-brand-primary bg-brand-primary text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                  disabled={busy}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onSave} className="btn-primary text-xs py-1.5" disabled={busy}>
            <Save size={13} /> {coach.accountStatus === 'PENDING_APPROVAL' ? 'Approve' : 'Save'}
          </button>
          <button onClick={cancelEdit} className="btn-secondary text-xs py-1.5" disabled={busy}>
            <X size={13} /> Cancel
          </button>
        </div>
      </div>
    );
  }

  function CoachCard({ coach }: { coach: UserDocument }) {
    const isEditing = editingId === coach.id;
    const assignedCentreNames = (coach.centreIds ?? []).map((id) => centreMap.get(id)).filter(Boolean);
    const assignedBatchNames = (coach.assignedBatchIds ?? []).map((id) => batchMap.get(id)).filter(Boolean);

    return (
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-brand-secondary truncate">{coach.name}</p>
            <p className="text-xs text-gray-400">{coach.email ?? coach.phone ?? '—'}</p>
            {assignedCentreNames.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                Centres: {assignedCentreNames.join(', ')}
              </p>
            )}
            {assignedBatchNames.length > 0 && (
              <p className="text-xs text-gray-500">
                Batches: {assignedBatchNames.join(', ')}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1.5">
            {coach.accountStatus === AccountStatus.PENDING_APPROVAL && (
              <button
                onClick={() => { startEdit(coach); }}
                className="btn-primary text-xs py-1.5"
                disabled={busy}
              >
                <UserCheck size={13} /> Review
              </button>
            )}
            {coach.accountStatus === AccountStatus.ACTIVE && (
              <>
                <button
                  onClick={() => { startEdit(coach); }}
                  className="btn-secondary text-xs py-1.5"
                  disabled={busy}
                >
                  <Edit2 size={13} /> Edit
                </button>
                <button
                  onClick={() => handleSuspend(coach)}
                  className="btn-ghost text-xs py-1.5 text-red-500 hover:text-red-700"
                  disabled={busy}
                >
                  <UserX size={13} />
                </button>
              </>
            )}
            {coach.accountStatus === AccountStatus.SUSPENDED && (
              <button
                onClick={() => handleReactivate(coach)}
                className="btn-secondary text-xs py-1.5"
                disabled={busy}
              >
                <UserCheck size={13} /> Reactivate
              </button>
            )}
          </div>
        </div>

        {isEditing && (
          <AssignmentEditor
            coach={coach}
            onSave={() => {
              if (coach.accountStatus === AccountStatus.PENDING_APPROVAL) {
                handleApprove(coach);
              } else {
                handleSaveAssignments(coach);
              }
            }}
          />
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Coaches</h1>
        <CardSkeleton count={3} />
      </div>
    );
  }

  const displayed = tab === 'pending' ? [...pending] : [...active, ...suspended];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-brand-secondary">Coaches</h1>
        <p className="text-sm text-gray-500">
          {pending.length} pending · {active.length} active · {suspended.length} suspended
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setTab('pending')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'pending' ? 'bg-white text-brand-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Pending Approval {pending.length > 0 && (
            <span className="ml-1 rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">
              {pending.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('active')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'active' ? 'bg-white text-brand-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Active / Suspended
        </button>
      </div>

      {displayed.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title={tab === 'pending' ? 'No pending approvals' : 'No coaches yet'}
          description={
            tab === 'pending'
              ? 'Coaches who self-register will appear here for your review.'
              : 'Approved coaches will appear here once you review pending requests.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayed.map((coach) => (
            <CoachCard key={coach.id} coach={coach} />
          ))}
        </div>
      )}
    </div>
  );
}
