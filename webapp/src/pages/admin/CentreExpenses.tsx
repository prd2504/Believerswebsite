/**
 * Centre expense submission — the CENTRE_MANAGER view of spending.
 *
 * Deliberately narrow: a manager sees and raises expenses for the centres they
 * manage, and nothing else. Revenue, payroll, partner payouts and profit stay
 * on the SUPER_ADMIN-only Financials page. A submitted expense is PENDING and
 * has no effect on any profit figure until a super-admin approves it.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Wallet, X, Pencil, Trash2, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  getExpensesForCentres,
  createExpense,
  updateExpense,
  deleteExpense,
} from '@/services/financialService';
import { getAllCentres } from '@/services/centreService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/cn';
import { UserRole, formatINR } from '@bba/shared';
import type { CentreExpenseDocument, CentreDocument, ExpenseCategory } from '@bba/shared';

const EXPENSE_CATEGORIES = [
  'RENT', 'EQUIPMENT', 'MAINTENANCE', 'UTILITIES', 'COACH_SALARY', 'MARKETING', 'OTHER',
] as const;

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function CentreExpensesPage() {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === UserRole.SUPER_ADMIN;

  const [month, setMonth] = useState(currentMonth);
  const [expenses, setExpenses] = useState<CentreExpenseDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CentreExpenseDocument | null>(null);
  const [fCentreId, setFCentreId] = useState('');
  const [fCategory, setFCategory] = useState<ExpenseCategory>('OTHER');
  const [fDescription, setFDescription] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  // Centres this user may raise expenses against. allCentreAccess managers and
  // super-admins get every centre; everyone else only their assigned ones.
  const myCentres = useMemo(() => {
    if (!profile) return [];
    if (isSuperAdmin || profile.allCentreAccess) return centres;
    const allowed = new Set(profile.centreIds ?? []);
    return centres.filter((c) => allowed.has(c.id));
  }, [centres, profile, isSuperAdmin]);

  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const cData = await getAllCentres();
      setCentres(cData);

      const ids = (isSuperAdmin || profile.allCentreAccess)
        ? cData.map((c) => c.id)
        : (profile.centreIds ?? []);
      setExpenses(await getExpensesForCentres(ids, month));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [profile, month, isSuperAdmin]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const by = (s: string) => expenses.filter((e) => e.status === s).reduce((t, e) => t + e.amountPaise, 0);
    return {
      pending: by('PENDING'),
      approved: by('APPROVED'),
      pendingCount: expenses.filter((e) => e.status === 'PENDING').length,
    };
  }, [expenses]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }, [month]);

  function openForm(e?: CentreExpenseDocument) {
    setEditing(e ?? null);
    setFCentreId(e?.centreId ?? myCentres[0]?.id ?? '');
    setFCategory(e?.category ?? 'OTHER');
    setFDescription(e?.description ?? '');
    setFAmount(e ? String(e.amountPaise / 100) : '');
    setFDate(e?.expenseDate ?? new Date().toISOString().slice(0, 10));
    setShowForm(true);
  }

  async function handleSave() {
    if (!profile) return;
    const amount = Number(fAmount);
    if (!fCentreId || !fDescription.trim() || !(amount > 0)) {
      toast.error('Centre, description and a non-zero amount are required.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateExpense(editing.id, {
          centreId: fCentreId,
          category: fCategory,
          description: fDescription.trim(),
          amountPaise: Math.round(amount * 100),
          expenseDate: fDate,
          yearMonth: fDate.slice(0, 7),
        }, profile.id);
        toast.success('Expense updated');
      } else {
        await createExpense({
          centreId: fCentreId,
          category: fCategory,
          description: fDescription.trim(),
          amountPaise: Math.round(amount * 100),
          expenseDate: fDate,
          yearMonth: fDate.slice(0, 7),
          // Managers submit for approval; a super-admin recording spend
          // directly is already the approver.
          status: isSuperAdmin ? 'APPROVED' : 'PENDING',
        }, profile.id);
        toast.success(isSuperAdmin ? 'Expense recorded' : 'Submitted for approval');
      }
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save expense');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(e: CentreExpenseDocument) {
    if (!confirm(`Delete "${e.description}"?`)) return;
    try {
      await deleteExpense(e.id);
      toast.success('Expense deleted');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete — approved expenses can only be removed by a super admin.');
    }
  }

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Centre Expenses</h1>
        <CardSkeleton count={3} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Centre Expenses</h1>
          <p className="text-sm text-gray-500">
            {isSuperAdmin
              ? 'Spend you record here counts immediately.'
              : 'Submitted expenses are reviewed by the academy before they take effect.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className="btn-ghost p-1.5 text-sm">&larr;</button>
          <span className="min-w-[120px] text-center text-sm font-medium">{monthLabel}</span>
          <button onClick={() => shiftMonth(1)} className="btn-ghost p-1.5 text-sm">&rarr;</button>
          <button onClick={() => openForm()} className="btn-primary text-xs" disabled={myCentres.length === 0}>
            <Plus size={14} /> Add expense
          </button>
        </div>
      </div>

      {myCentres.length === 0 ? (
        <EmptyState
          icon={<Wallet size={40} />}
          title="No centre assigned"
          description="You aren't assigned to a centre yet, so there's nothing to record spending against. Ask a super admin to assign you one."
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="card p-4">
              <p className="text-xs text-gray-500">Approved this month</p>
              <p className="text-lg font-bold text-green-600">{formatINR(totals.approved)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500">Awaiting approval</p>
              <p className="text-lg font-bold text-amber-600">{formatINR(totals.pending)}</p>
              <p className="mt-0.5 text-[10px] text-gray-400">{totals.pendingCount} item(s)</p>
            </div>
          </div>

          {expenses.length === 0 ? (
            <EmptyState
              icon={<Wallet size={40} />}
              title={`No expenses in ${monthLabel}`}
              description="Record rent, shuttles, maintenance and other centre costs here."
            />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Description</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 hidden sm:table-cell">Centre</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 hidden lg:table-cell">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Amount</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">{e.expenseDate}</td>
                      <td className="px-4 py-2.5 font-medium text-brand-secondary">
                        {e.description}
                        {e.status === 'REJECTED' && e.rejectionReason && (
                          <p className="mt-0.5 text-xs font-normal text-red-500">
                            Rejected: {e.rejectionReason}
                          </p>
                        )}
                      </td>
                      <td className="hidden px-4 py-2.5 text-gray-500 sm:table-cell">
                        {centreMap.get(e.centreId) ?? e.centreId}
                      </td>
                      <td className="hidden px-4 py-2.5 text-gray-500 lg:table-cell">
                        {e.category.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-brand-secondary">
                        {formatINR(e.amountPaise)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                          STATUS_STYLE[e.status] ?? 'bg-gray-100 text-gray-500',
                        )}>
                          {e.status === 'PENDING' ? <Clock size={11} />
                            : e.status === 'APPROVED' ? <CheckCircle2 size={11} />
                            : <XCircle size={11} />}
                          {e.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {/* Only a pending row is still the submitter's to change.
                            Rules enforce this too — the UI just doesn't offer it. */}
                        {(isSuperAdmin || e.status === 'PENDING') && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openForm(e)}
                              className="btn-ghost p-1 text-gray-400 hover:text-brand-primary"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(e)}
                              className="btn-ghost p-1 text-gray-400 hover:text-red-500"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <h3 className="text-base font-semibold text-brand-secondary">
                {editing ? 'Edit expense' : 'Add expense'}
              </h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="btn-ghost p-1">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div>
                <label className="label">Centre</label>
                <select value={fCentreId} onChange={(ev) => setFCentreId(ev.target.value)} className="input">
                  <option value="">Select centre</option>
                  {myCentres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Category</label>
                <select
                  value={fCategory}
                  onChange={(ev) => setFCategory(ev.target.value as ExpenseCategory)}
                  className="input"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c.replace('_', ' ')}</option>
                  ))}
                </select>
                {fCategory === 'COACH_SALARY' && (
                  <p className="mt-1 text-xs text-amber-600">
                    Salaries paid through Payroll are recorded automatically. Only add one here
                    if it was paid outside Payroll, or it will be counted twice.
                  </p>
                )}
              </div>
              <div>
                <label className="label">Description</label>
                <input
                  type="text"
                  value={fDescription}
                  onChange={(ev) => setFDescription(ev.target.value)}
                  placeholder="e.g. Shuttles — 10 tubes"
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Amount (₹)</label>
                  <input
                    type="number"
                    min={1}
                    value={fAmount}
                    onChange={(ev) => setFAmount(ev.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Date</label>
                  <input
                    type="date"
                    value={fDate}
                    onChange={(ev) => setFDate(ev.target.value)}
                    className="input"
                  />
                </div>
              </div>
              {!isSuperAdmin && !editing && (
                <p className="text-xs text-gray-400">
                  This is submitted for approval and won't affect any figures until the academy
                  approves it.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="btn-secondary" disabled={saving}>
                Cancel
              </button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : isSuperAdmin ? 'Record expense' : 'Submit for approval'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
