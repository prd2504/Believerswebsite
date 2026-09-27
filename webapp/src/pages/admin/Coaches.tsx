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
  repairCoachBatchLinks,
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
    // Batch access is what actually drives the coach's app — attendance reads
    // batches.coachIds, never centreIds. Ticking a batch therefore implies its
    // centre, so the two can't be left inconsistent by hand.
    const batch = batches.find((b) => b.id === id);
    if (batch) {
      setEditCentres((prev) => (prev.includes(batch.centreId) ? prev : [...prev, batch.centreId]));
    }
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

  async function handleRepair(coach: UserDocument) {
    if (!profile) return;
    if (!confirm(
      `Make the batches match ${coach.name}'s profile?\n\n` +
      `Batches listed on the profile will be linked to them; batches linked to them but not on ` +
      `the profile will be unlinked. No other coach is affected.`,
    )) return;
    setBusy(true);
    try {
      const fixed = await repairCoachBatchLinks(
        coach.id,
        coach.assignedBatchIds ?? [],
        batches,
        profile.id,
      );
      toast.success(fixed > 0 ? `Repaired ${fixed} batch link(s)` : 'Nothing to repair');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to repair batch links');
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
    // Every active batch, grouped by centre. Previously this listed only
    // batches whose centre was already ticked, so assigning a coach to a new
    // centre's batch meant ticking the centre first — and ticking the centre
    // alone (which grants nothing) looked like it had done the job.
    const activeBatches = batches.filter((b) => b.status === 'ACTIVE');
    const byCentre = centres
      .map((c) => ({ centre: c, list: activeBatches.filter((b) => b.centreId === c.id) }))
      .filter((g) => g.list.length > 0);

    const orphanBatchIds = editBatches.filter((id) => !activeBatches.some((b) => b.id === id));
    const centresWithoutBatch = editCentres.filter(
      (cid) => !editBatches.some((bid) => activeBatches.find((b) => b.id === bid)?.centreId === cid),
    );

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

        <div>
          <p className="mb-1 text-xs font-medium text-gray-600">Assign batches</p>
          <p className="mb-2 text-[11px] text-gray-400">
            This is what actually gives the coach access — attendance and student lists are
            driven by batch assignment, not centre access.
          </p>
          {byCentre.length === 0 ? (
            <p className="text-xs text-gray-400">No active batches exist yet.</p>
          ) : (
            <div className="space-y-2.5">
              {byCentre.map(({ centre, list }) => (
                <div key={centre.id}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {centre.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((b) => (
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
              ))}
            </div>
          )}
        </div>

        {centresWithoutBatch.length > 0 && (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700">
            <strong>
              {centresWithoutBatch.map((id) => centreMap.get(id) ?? id).join(', ')}
            </strong>{' '}
            {centresWithoutBatch.length === 1 ? 'is' : 'are'} assigned as {centresWithoutBatch.length === 1 ? 'a centre' : 'centres'} but
            no batch there is selected — the coach will see nothing from {centresWithoutBatch.length === 1 ? 'it' : 'them'}.
          </p>
        )}

        {orphanBatchIds.length > 0 && (
          <p className="rounded-lg bg-gray-100 px-2.5 py-2 text-[11px] text-gray-500">
            {orphanBatchIds.length} previously-assigned batch(es) are inactive or deleted. They stay
            assigned and are left untouched when you save.
          </p>
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

    // The coach's app resolves batches from batches.coachIds, not from the
    // profile — so a mismatch between the two is invisible here but decisive
    // there. Surface it rather than letting it look like a working assignment.
    const assignedIds = new Set(coach.assignedBatchIds ?? []);
    const linkedIds = new Set(batches.filter((b) => (b.coachIds ?? []).includes(coach.id)).map((b) => b.id));
    const drift = [
      ...[...linkedIds].filter((id) => !assignedIds.has(id))
        .map((id) => `${batchMap.get(id) ?? id}: on the batch, missing from this profile`),
      ...[...assignedIds].filter((id) => !linkedIds.has(id) && batchMap.has(id))
        .map((id) => `${batchMap.get(id)}: on this profile, missing from the batch — coach cannot see it`),
    ];
    const noBatches = (coach.assignedBatchIds ?? []).length === 0 && linkedIds.size === 0;

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
            {noBatches && coach.accountStatus === AccountStatus.ACTIVE && (
              <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                No batches assigned — this coach sees no students and cannot mark attendance.
                {assignedCentreNames.length > 0 && ' Centre access alone does not grant this.'}
              </p>
            )}
            {drift.length > 0 && (
              <div className="mt-1.5 rounded bg-red-50 px-2 py-1.5">
                <p className="text-[11px] font-semibold text-red-700">Assignment out of sync</p>
                <ul className="mt-0.5 space-y-0.5">
                  {drift.map((d) => (
                    <li key={d} className="text-[11px] text-red-600">{d}</li>
                  ))}
                </ul>
                <button
                  onClick={() => handleRepair(coach)}
                  disabled={busy}
                  className="mt-1.5 rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Repair from profile
                </button>
              </div>
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
