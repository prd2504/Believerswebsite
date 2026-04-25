/**
 * Admin tournaments page — full CRUD with categories, registrations, and status management.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trophy, Users, Pencil, Trash2, Calendar } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  getAllTournaments,
  createTournament,
  updateTournament,
  deleteTournament,
  getRegistrations,
} from '@/services/tournamentService';
import { getAllStudents } from '@/services/studentService';
import { getAllCentres } from '@/services/centreService';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import {
  tournamentFormSchema,
  type TournamentFormValues,
  defaultTournamentFormValues,
} from '@/lib/schemas/tournamentSchema';
import { TournamentStatus, SportType, formatINR } from '@bba/shared';
import { cn } from '@/lib/cn';
import type { TournamentDocument, CentreDocument, StudentDocument, TournamentRegistration } from '@bba/shared';

type Mode = 'list' | 'create' | 'edit' | 'detail';

const STATUS_STYLES: Record<string, string> = {
  UPCOMING: 'bg-blue-50 text-blue-700',
  REGISTRATION_OPEN: 'bg-green-50 text-green-700',
  REGISTRATION_CLOSED: 'bg-yellow-50 text-yellow-700',
  IN_PROGRESS: 'bg-purple-50 text-purple-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-50 text-red-600',
};

function TournamentForm({
  centres,
  initialValues,
  onSubmit,
  onCancel,
  busy,
}: {
  centres: CentreDocument[];
  initialValues?: Partial<TournamentFormValues>;
  onSubmit: (v: TournamentFormValues) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}) {
  const defaults = { ...defaultTournamentFormValues(), ...initialValues };
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<TournamentFormValues>({
    resolver: zodResolver(tournamentFormSchema),
    defaultValues: defaults,
  });

  const { fields: catFields, append, remove } = useFieldArray({ control, name: 'categories' });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Basic info */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Tournament name</label>
          <input {...register('name')} className="input" placeholder="BBA Junior Open 2026" disabled={busy} />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
        </div>
        <div className="sm:col-span-2">
          <label className="label">Description</label>
          <textarea {...register('description')} rows={2} className="input" disabled={busy} />
        </div>
        <div>
          <label className="label">Sport</label>
          <select {...register('sport')} className="input" disabled={busy}>
            {Object.values(SportType).map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select {...register('status')} className="input" disabled={busy}>
            {Object.values(TournamentStatus).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Venue */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Host centre (optional)</label>
          <select {...register('hostCentreId')} className="input" disabled={busy}>
            <option value="">External venue</option>
            {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Venue name (external)</label>
          <input {...register('venueName')} className="input" placeholder="Sports Complex, Andheri" disabled={busy} />
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Start date</label>
          <input {...register('startDate')} type="date" className="input" disabled={busy} />
          {errors.startDate && <p className="mt-1 text-xs text-red-600">{errors.startDate.message}</p>}
        </div>
        <div>
          <label className="label">End date</label>
          <input {...register('endDate')} type="date" className="input" disabled={busy} />
        </div>
        <div>
          <label className="label">Registration deadline</label>
          <input {...register('registrationDeadline')} type="date" className="input" disabled={busy} />
        </div>
      </div>

      {/* Entry fee */}
      <div>
        <label className="label">Entry fee (₹, optional)</label>
        <input {...register('entryFeeRupees', { valueAsNumber: true, setValueAs: v => v === '' ? null : Number(v) })} type="number" min={0} className="input w-40" disabled={busy} />
      </div>

      {/* Categories */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Categories</label>
          <button type="button" onClick={() => append({ id: `cat-${Date.now()}`, name: '', ageGroup: 'Open', level: 'OPEN', maxParticipants: null })} className="btn-ghost text-xs text-brand-primary" disabled={busy}>
            <Plus size={13} /> Add
          </button>
        </div>
        {errors.categories && <p className="mb-1 text-xs text-red-600">{errors.categories.message}</p>}
        <div className="space-y-2">
          {catFields.map((field, idx) => (
            <div key={field.id} className="flex items-center gap-2">
              <input {...register(`categories.${idx}.name`)} className="input flex-1 py-1.5 text-xs" placeholder="Open Singles" disabled={busy} />
              <input {...register(`categories.${idx}.ageGroup`)} className="input w-24 py-1.5 text-xs" placeholder="U-12 / Open" disabled={busy} />
              <select {...register(`categories.${idx}.level`)} className="input w-32 py-1.5 text-xs" disabled={busy}>
                {['BEGINNER','INTERMEDIATE','ADVANCED','OPEN'].map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              {catFields.length > 1 && (
                <button type="button" onClick={() => remove(idx)} className="btn-ghost p-1 text-red-400" disabled={busy}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : initialValues ? 'Update Tournament' : 'Create Tournament'}
        </button>
      </div>
    </form>
  );
}

export default function TournamentsPage() {
  const { profile } = useAuth();
  const [tournaments, setTournaments] = useState<TournamentDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('list');
  const [editTarget, setEditTarget] = useState<TournamentDocument | null>(null);
  const [detailTarget, setDetailTarget] = useState<TournamentDocument | null>(null);
  const [registrations, setRegistrations] = useState<TournamentRegistration[]>([]);
  const [busy, setBusy] = useState(false);

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);
  const centreMap = useMemo(() => new Map(centres.map((c) => [c.id, c.name])), [centres]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [tData, cData, sData] = await Promise.all([getAllTournaments(), getAllCentres(), getAllStudents()]);
      setTournaments(tData);
      setCentres(cData);
      setStudents(sData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (v: TournamentFormValues) => {
    if (!profile) return;
    setBusy(true);
    try {
      await createTournament(v, profile.id);
      toast.success('Tournament created');
      setMode('list');
      await load();
    } catch (err) { console.error(err); toast.error('Failed to create'); }
    finally { setBusy(false); }
  };

  const handleUpdate = async (v: TournamentFormValues) => {
    if (!profile || !editTarget) return;
    setBusy(true);
    try {
      await updateTournament(editTarget.id, v, profile.id);
      toast.success('Tournament updated');
      setMode('list');
      setEditTarget(null);
      await load();
    } catch (err) { console.error(err); toast.error('Failed to update'); }
    finally { setBusy(false); }
  };

  const handleDelete = async (t: TournamentDocument) => {
    if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
    try {
      await deleteTournament(t.id);
      toast.success('Deleted');
      await load();
    } catch (err) { console.error(err); toast.error('Failed to delete'); }
  };

  const openDetail = async (t: TournamentDocument) => {
    setDetailTarget(t);
    setMode('detail');
    const regs = await getRegistrations(t.id).catch(() => []);
    setRegistrations(regs);
  };

  function toFormValues(t: TournamentDocument): Partial<TournamentFormValues> {
    return {
      name: t.name, description: t.description, sport: t.sport as any,
      hostCentreId: t.hostCentreId, venueName: t.venueName ?? '',
      venueAddress: t.venueAddress ?? '', startDate: t.startDate, endDate: t.endDate,
      registrationDeadline: t.registrationDeadline ?? '',
      categories: t.categories as any, status: t.status as any,
      entryFeeRupees: t.entryFeePaise != null ? t.entryFeePaise / 100 : null,
    };
  }

  // ── Create / Edit ──
  if (mode === 'create') return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-bold text-brand-secondary">Create Tournament</h1>
      <div className="card"><TournamentForm centres={centres} onSubmit={handleCreate} onCancel={() => setMode('list')} busy={busy} /></div>
    </div>
  );

  if (mode === 'edit' && editTarget) return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-bold text-brand-secondary">Edit Tournament</h1>
      <div className="card"><TournamentForm centres={centres} initialValues={toFormValues(editTarget)} onSubmit={handleUpdate} onCancel={() => { setMode('list'); setEditTarget(null); }} busy={busy} /></div>
    </div>
  );

  // ── Detail view ──
  if (mode === 'detail' && detailTarget) return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => setMode('list')} className="mb-4 text-xs text-brand-primary hover:underline">← Back to list</button>
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[detailTarget.status])}>
            {detailTarget.status.replace(/_/g, ' ')}
          </span>
          <div className="flex gap-1">
            <button onClick={() => { setEditTarget(detailTarget); setMode('edit'); }} className="btn-ghost p-1.5"><Pencil size={14} /></button>
          </div>
        </div>
        <h2 className="text-lg font-bold text-brand-secondary">{detailTarget.name}</h2>
        <p className="text-xs text-gray-500">{detailTarget.venueName ?? centreMap.get(detailTarget.hostCentreId ?? '')}</p>
        <div className="mt-2 flex gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Calendar size={12} />{detailTarget.startDate} – {detailTarget.endDate}</span>
          {detailTarget.entryFeePaise != null && <span>{formatINR(detailTarget.entryFeePaise, { withDecimals: false })} entry</span>}
        </div>
        {detailTarget.description && <p className="mt-3 text-sm text-gray-600">{detailTarget.description}</p>}

        {/* Categories */}
        <h3 className="mt-5 mb-2 text-sm font-semibold text-brand-secondary">Categories</h3>
        <div className="space-y-1">
          {detailTarget.categories.map((cat) => {
            const catRegs = registrations.filter((r) => r.categoryId === cat.id);
            return (
              <div key={cat.id} className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-xs">
                <span className="font-medium text-brand-secondary">{cat.name}</span>
                <span className="text-gray-400">{cat.ageGroup} · {cat.level} · {catRegs.length} registered</span>
              </div>
            );
          })}
        </div>

        {/* Registrations */}
        {registrations.length > 0 && (
          <>
            <h3 className="mt-5 mb-2 text-sm font-semibold text-brand-secondary">Registered Students ({registrations.length})</h3>
            <div className="space-y-1">
              {registrations.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs text-gray-600">
                  <span>{studentMap.get(r.studentId) ?? r.studentId}</span>
                  <span className="text-gray-400">{detailTarget.categories.find((c) => c.id === r.categoryId)?.name ?? r.categoryId}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ── List view ──
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Tournaments</h1>
          <p className="text-sm text-gray-500">{tournaments.length} tournament{tournaments.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setMode('create')} className="btn-primary"><Plus size={16} /> Create Tournament</button>
      </div>

      {loading ? <CardSkeleton count={4} /> : tournaments.length === 0 ? (
        <EmptyState icon={<Trophy size={48} />} title="No tournaments yet" description="Create your first tournament to start managing registrations." action={<button onClick={() => setMode('create')} className="btn-primary"><Plus size={16} /> Create Tournament</button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((t) => (
            <div key={t.id} className="card group relative cursor-pointer transition-shadow hover:shadow-card-hover" onClick={() => openDetail(t)}>
              <div className="mb-3 flex items-center justify-between">
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[t.status])}>
                  {t.status.replace(/_/g, ' ')}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { setEditTarget(t); setMode('edit'); }} className="btn-ghost p-1.5"><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(t)} className="btn-ghost p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-brand-secondary">{t.name}</h3>
              <p className="text-xs text-gray-400">{t.sport} · {t.venueName ?? centreMap.get(t.hostCentreId ?? '') ?? 'TBD'}</p>
              <div className="mt-3 flex items-center gap-3 border-t border-gray-50 pt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Calendar size={11} />{t.startDate}</span>
                <span className="flex items-center gap-1"><Users size={11} />{t.categories.length} categories</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
