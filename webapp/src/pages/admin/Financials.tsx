/**
 * Admin financials page — expenses, partner payouts, overdue students, and
 * collection overview. Replaces the old Analytics page. Partner Payouts and
 * Master Summary tabs are SUPER_ADMIN only.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Wallet,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  IndianRupee,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  createExpense,
  updateExpense,
  deleteExpense,
  getAllExpenses,
  createPayout,
  updatePayout,
  deletePayout,
  getAllPayouts,
} from '@/services/financialService';
import { getAllPayments } from '@/services/paymentService';
import { getAllCentres } from '@/services/centreService';
import { getAllStudents } from '@/services/studentService';
import { getAllBatches } from '@/services/batchService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/cn';
import { UserRole, formatINR } from '@bba/shared';
import type {
  CentreExpenseDocument,
  PartnerPayoutDocument,
  PaymentDocument,
  CentreDocument,
  StudentDocument,
  BatchDocument,
  ExpenseCategory,
  PayoutStatus,
} from '@bba/shared';

type Tab = 'overview' | 'expenses' | 'overdue' | 'payouts' | 'summary';

const EXPENSE_CATEGORIES = ['RENT', 'EQUIPMENT', 'MAINTENANCE', 'UTILITIES', 'COACH_SALARY', 'MARKETING', 'OTHER'] as const;
const PAYOUT_STATUSES = ['PENDING', 'PAID', 'DISPUTED'] as const;

const STATUS_PILL: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  PAID: { bg: 'bg-green-100', text: 'text-green-700' },
  DISPUTED: { bg: 'bg-red-100', text: 'text-red-700' },
  OVERDUE: { bg: 'bg-red-100', text: 'text-red-700' },
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function FinancialsPage() {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === UserRole.SUPER_ADMIN;

  const [tab, setTab] = useState<Tab>('overview');
  const [month, setMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);

  const [expenses, setExpenses] = useState<CentreExpenseDocument[]>([]);
  const [payouts, setPayouts] = useState<PartnerPayoutDocument[]>([]);
  const [payments, setPayments] = useState<PaymentDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [batches, setBatches] = useState<BatchDocument[]>([]);

  const [centreFilter, setCentreFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Modal state
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<CentreExpenseDocument | null>(null);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [editingPayout, setEditingPayout] = useState<PartnerPayoutDocument | null>(null);

  // Form state — expenses
  const [expCentreId, setExpCentreId] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('OTHER');
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));

  // Form state — payouts
  const [payoutCentreId, setPayoutCentreId] = useState('');
  const [payoutPartner, setPayoutPartner] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutStatus, setPayoutStatus] = useState<PayoutStatus>('PENDING');
  const [payoutMethod, setPayoutMethod] = useState('Bank Transfer');
  const [payoutRef, setPayoutRef] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');

  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  const studentMap = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [students]);

  const batchMap = useMemo(() => {
    const m = new Map<string, string>();
    batches.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [batches]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [expData, pmtData, cData, sData, bData] = await Promise.all([
        getAllExpenses(month),
        getAllPayments(),
        getAllCentres(),
        getAllStudents(),
        getAllBatches(),
      ]);
      setExpenses(expData);
      setPayments(pmtData);
      setCentres(cData);
      setStudents(sData);
      setBatches(bData);
      if (isSuperAdmin) {
        const payoutData = await getAllPayouts(month);
        setPayouts(payoutData);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load financial data');
    } finally {
      setLoading(false);
    }
  }, [month, isSuperAdmin]);

  useEffect(() => { load(); }, [load]);

  // Computed data
  const monthPayments = useMemo(() => payments.filter((p) => p.month === month), [payments, month]);

  const totalCollected = useMemo(
    () => monthPayments.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.totalAmountPaise, 0),
    [monthPayments],
  );
  const totalBilled = useMemo(
    () => monthPayments.reduce((s, p) => s + p.totalAmountPaise, 0),
    [monthPayments],
  );
  const totalExpenses = useMemo(
    () => expenses.reduce((s, e) => s + e.amountPaise, 0),
    [expenses],
  );
  const totalPayoutsAmt = useMemo(
    () => payouts.reduce((s, p) => s + p.amountPaise, 0),
    [payouts],
  );
  const overduePayments = useMemo(
    () => payments.filter((p) => p.status === 'OVERDUE'),
    [payments],
  );
  const filteredExpenses = useMemo(() => {
    let result = expenses;
    if (centreFilter) result = result.filter((e) => e.centreId === centreFilter);
    if (categoryFilter) result = result.filter((e) => e.category === categoryFilter);
    return result;
  }, [expenses, centreFilter, categoryFilter]);

  function resetExpenseForm(expense?: CentreExpenseDocument) {
    setExpCentreId(expense?.centreId ?? centres[0]?.id ?? '');
    setExpCategory(expense?.category ?? 'OTHER');
    setExpDescription(expense?.description ?? '');
    setExpAmount(expense ? String(expense.amountPaise / 100) : '');
    setExpDate(expense?.expenseDate ?? new Date().toISOString().slice(0, 10));
  }

  function resetPayoutForm(payout?: PartnerPayoutDocument) {
    setPayoutCentreId(payout?.centreId ?? centres[0]?.id ?? '');
    setPayoutPartner(payout?.partnerName ?? '');
    setPayoutAmount(payout ? String(payout.amountPaise / 100) : '');
    setPayoutStatus(payout?.status ?? 'PENDING');
    setPayoutMethod(payout?.method ?? 'Bank Transfer');
    setPayoutRef(payout?.referenceNumber ?? '');
    setPayoutNotes(payout?.notes ?? '');
  }

  async function handleSaveExpense() {
    if (!expCentreId || !expDescription.trim() || !expAmount) return;
    try {
      const data = {
        centreId: expCentreId,
        category: expCategory,
        description: expDescription.trim(),
        amountPaise: Math.round(Number(expAmount) * 100),
        expenseDate: expDate,
        yearMonth: expDate.slice(0, 7),
      };
      if (editingExpense) {
        await updateExpense(editingExpense.id, data, profile!.id);
        toast.success('Expense updated');
      } else {
        await createExpense(data, profile!.id);
        toast.success('Expense added');
      }
      setShowExpenseForm(false);
      setEditingExpense(null);
      load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save expense');
    }
  }

  async function handleDeleteExpense(id: string) {
    try {
      await deleteExpense(id);
      toast.success('Expense deleted');
      load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete expense');
    }
  }

  async function handleSavePayout() {
    if (!payoutCentreId || !payoutPartner.trim() || !payoutAmount) return;
    try {
      const data = {
        centreId: payoutCentreId,
        partnerName: payoutPartner.trim(),
        amountPaise: Math.round(Number(payoutAmount) * 100),
        yearMonth: month,
        status: payoutStatus,
        method: payoutMethod,
        referenceNumber: payoutRef.trim() || undefined,
        notes: payoutNotes.trim() || undefined,
      };
      if (editingPayout) {
        await updatePayout(editingPayout.id, data, profile!.id);
        toast.success('Payout updated');
      } else {
        await createPayout(data, profile!.id);
        toast.success('Payout added');
      }
      setShowPayoutForm(false);
      setEditingPayout(null);
      load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save payout');
    }
  }

  async function handleDeletePayout(id: string) {
    try {
      await deletePayout(id);
      toast.success('Payout deleted');
      load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete payout');
    }
  }

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }, [month]);

  function prevMonth() {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  function nextMonth() {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Financials</h1>
        <CardSkeleton count={4} />
      </div>
    );
  }

  const allTabs: { key: Tab; label: string; superOnly?: boolean }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'overdue', label: 'Overdue Students' },
    { key: 'payouts', label: 'Partner Payouts', superOnly: true },
    { key: 'summary', label: 'Master Summary', superOnly: true },
  ];
  const visibleTabs = allTabs.filter((t) => !t.superOnly || isSuperAdmin);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Financials</h1>
          <p className="text-sm text-gray-500">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="btn-ghost p-1.5 text-sm">&larr;</button>
          <span className="text-sm font-medium min-w-[120px] text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="btn-ghost p-1.5 text-sm">&rarr;</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-gray-500">Collected</p>
          <p className="text-lg font-bold text-green-600">{formatINR(totalCollected)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Total Billed</p>
          <p className="text-lg font-bold text-brand-secondary">{formatINR(totalBilled)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Expenses</p>
          <p className="text-lg font-bold text-red-600">{formatINR(totalExpenses)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Overdue</p>
          <p className="text-lg font-bold text-red-600">{overduePayments.length} students</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-lg bg-gray-100 p-1 overflow-x-auto">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'bg-white text-brand-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Collection by Centre</h2>
          {centres.length === 0 ? (
            <p className="text-sm text-gray-400">No centres found.</p>
          ) : (
            <div className="space-y-3">
              {centres.map((c) => {
                const centrePmts = monthPayments.filter((p) => p.centreId === c.id);
                const collected = centrePmts.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.totalAmountPaise, 0);
                const billed = centrePmts.reduce((s, p) => s + p.totalAmountPaise, 0);
                const pct = billed > 0 ? Math.round((collected / billed) * 100) : 0;
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{c.name}</span>
                      <span className={cn('font-semibold', pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600')}>
                        {pct}% ({formatINR(collected)} / {formatINR(billed)})
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-gray-100">
                      <div
                        className={cn('h-2 rounded-full', pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500')}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Expenses */}
      {tab === 'expenses' && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between gap-3 p-4 pb-0">
            <div className="flex gap-2">
              <select value={centreFilter} onChange={(e) => setCentreFilter(e.target.value)} className="input w-auto py-2 text-sm">
                <option value="">All Centres</option>
                {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="input w-auto py-2 text-sm">
                <option value="">All Categories</option>
                {EXPENSE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>)}
              </select>
            </div>
            <button
              onClick={() => { resetExpenseForm(); setEditingExpense(null); setShowExpenseForm(true); }}
              className="btn-primary text-sm"
            >
              <Plus size={14} /> Add Expense
            </button>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={<Wallet size={48} />} title="No expenses" description="Add centre expenses to track spending." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Centre</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Category</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Description</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Amount</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredExpenses.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-600">{e.expenseDate}</td>
                      <td className="px-4 py-3">{centreMap.get(e.centreId) ?? e.centreId}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          {e.category.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{e.description}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatINR(e.amountPaise)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => { resetExpenseForm(e); setEditingExpense(e); setShowExpenseForm(true); }}
                            className="btn-ghost p-1.5"
                          >
                            <Pencil size={14} />
                          </button>
                          {isSuperAdmin && (
                            <button onClick={() => handleDeleteExpense(e.id)} className="btn-ghost p-1.5 text-red-500">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Overdue Students */}
      {tab === 'overdue' && (
        <div className="card">
          {overduePayments.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={<AlertTriangle size={48} />} title="No overdue payments" description="All students are up to date." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Batch</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Centre</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Month</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Amount Due</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Due Date</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Days Overdue</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {overduePayments.map((p) => {
                    const daysOverdue = p.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(p.dueDate).getTime()) / 86400000)) : 0;
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-medium">{studentMap.get(p.studentId) ?? p.studentId}</td>
                        <td className="px-4 py-3">{batchMap.get(p.batchId) ?? p.batchId}</td>
                        <td className="px-4 py-3">{centreMap.get(p.centreId) ?? p.centreId}</td>
                        <td className="px-4 py-3">{p.month}</td>
                        <td className="px-4 py-3 text-right font-medium text-red-600">{formatINR(p.totalAmountPaise)}</td>
                        <td className="px-4 py-3">{p.dueDate ?? '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn('font-semibold', daysOverdue > 7 ? 'text-red-600' : 'text-yellow-600')}>
                            {daysOverdue}d
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Partner Payouts (SUPER_ADMIN only) */}
      {tab === 'payouts' && isSuperAdmin && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between p-4 pb-0">
            <h2 className="text-sm font-semibold text-gray-700">Partner Payouts — {monthLabel}</h2>
            <button
              onClick={() => { resetPayoutForm(); setEditingPayout(null); setShowPayoutForm(true); }}
              className="btn-primary text-sm"
            >
              <Plus size={14} /> Add Payout
            </button>
          </div>
          {payouts.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={<Wallet size={48} />} title="No payouts" description="Add partner payout records." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Centre</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Partner</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Method</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Reference</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payouts.map((p) => {
                    const pill = STATUS_PILL[p.status] ?? STATUS_PILL.PENDING;
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3">{centreMap.get(p.centreId) ?? p.centreId}</td>
                        <td className="px-4 py-3 font-medium">{p.partnerName}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatINR(p.amountPaise)}</td>
                        <td className="px-4 py-3">
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', pill.bg, pill.text)}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{p.method}</td>
                        <td className="px-4 py-3 text-gray-500">{p.referenceNumber ?? '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => { resetPayoutForm(p); setEditingPayout(p); setShowPayoutForm(true); }} className="btn-ghost p-1.5">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => handleDeletePayout(p.id)} className="btn-ghost p-1.5 text-red-500">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Master Summary (SUPER_ADMIN only) */}
      {tab === 'summary' && isSuperAdmin && (
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">P&L Summary — {monthLabel}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Centre</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Collected</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Expenses</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Payouts</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {centres.map((c) => {
                  const cCollected = monthPayments.filter((p) => p.centreId === c.id && p.status === 'PAID').reduce((s, p) => s + p.totalAmountPaise, 0);
                  const cExpenses = expenses.filter((e) => e.centreId === c.id).reduce((s, e) => s + e.amountPaise, 0);
                  const cPayouts = payouts.filter((p) => p.centreId === c.id).reduce((s, p) => s + p.amountPaise, 0);
                  const net = cCollected - cExpenses - cPayouts;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-right text-green-600">{formatINR(cCollected)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{formatINR(cExpenses)}</td>
                      <td className="px-4 py-3 text-right text-orange-600">{formatINR(cPayouts)}</td>
                      <td className={cn('px-4 py-3 text-right font-bold', net >= 0 ? 'text-green-600' : 'text-red-600')}>
                        {formatINR(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2">
                <tr className="font-bold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right text-green-600">{formatINR(totalCollected)}</td>
                  <td className="px-4 py-3 text-right text-red-600">{formatINR(totalExpenses)}</td>
                  <td className="px-4 py-3 text-right text-orange-600">{formatINR(totalPayoutsAmt)}</td>
                  <td className={cn('px-4 py-3 text-right', totalCollected - totalExpenses - totalPayoutsAmt >= 0 ? 'text-green-600' : 'text-red-600')}>
                    {formatINR(totalCollected - totalExpenses - totalPayoutsAmt)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Expense Form Modal */}
      {showExpenseForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editingExpense ? 'Edit Expense' : 'Add Expense'}</h3>
              <button onClick={() => setShowExpenseForm(false)} className="btn-ghost p-1"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Centre</label>
                <select value={expCentreId} onChange={(e) => setExpCentreId(e.target.value)} className="input">
                  {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Category</label>
                <select value={expCategory} onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)} className="input">
                  {EXPENSE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Description</label>
                <input value={expDescription} onChange={(e) => setExpDescription(e.target.value)} className="input" placeholder="What was this expense for?" />
              </div>
              <div>
                <label className="label">Amount (INR)</label>
                <input type="number" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} className="input" placeholder="0.00" />
              </div>
              <div>
                <label className="label">Date</label>
                <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className="input" />
              </div>
              <button onClick={handleSaveExpense} className="btn-primary w-full">{editingExpense ? 'Update' : 'Add'} Expense</button>
            </div>
          </div>
        </div>
      )}

      {/* Payout Form Modal */}
      {showPayoutForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editingPayout ? 'Edit Payout' : 'Add Payout'}</h3>
              <button onClick={() => setShowPayoutForm(false)} className="btn-ghost p-1"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Centre</label>
                <select value={payoutCentreId} onChange={(e) => setPayoutCentreId(e.target.value)} className="input">
                  {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Partner Name</label>
                <input value={payoutPartner} onChange={(e) => setPayoutPartner(e.target.value)} className="input" placeholder="Partner name" />
              </div>
              <div>
                <label className="label">Amount (INR)</label>
                <input type="number" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} className="input" placeholder="0.00" />
              </div>
              <div>
                <label className="label">Status</label>
                <select value={payoutStatus} onChange={(e) => setPayoutStatus(e.target.value as PayoutStatus)} className="input">
                  {PAYOUT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Method</label>
                <input value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)} className="input" placeholder="Bank Transfer" />
              </div>
              <div>
                <label className="label">Reference Number</label>
                <input value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} className="input" placeholder="Optional" />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea value={payoutNotes} onChange={(e) => setPayoutNotes(e.target.value)} className="input" rows={2} placeholder="Optional notes" />
              </div>
              <button onClick={handleSavePayout} className="btn-primary w-full">{editingPayout ? 'Update' : 'Add'} Payout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
