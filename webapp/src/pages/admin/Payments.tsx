/**
 * Admin payments page — create fees, record cash payments, track overdue.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  IndianRupee,
  Download,
  Search,
  RefreshCw,
  LayoutGrid,
  LayoutList,
  Columns3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { exportPaymentsCsv } from '@/lib/csv';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  getAllPayments,
  createPayment,
  updatePayment,
  deletePayment,
  markPaymentPaid,
  waivePayment,
  generateMonthlyFees,
} from '@/services/paymentService';
import { getAllCentres } from '@/services/centreService';
import { getAllBatches } from '@/services/batchService';
import { getAllStudents } from '@/services/studentService';
import { PaymentCard } from '@/components/payments/PaymentCard';
import { PaymentForm } from '@/components/payments/PaymentForm';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { formatINR, paiseToRupees } from '@bba/shared';
import type {
  PaymentDocument,
  CentreDocument,
  BatchDocument,
  StudentDocument,
} from '@bba/shared';
import type { PaymentFormValues } from '@/lib/schemas/paymentSchema';

type Mode = 'list' | 'create' | 'edit';
type ViewMode = 'card' | 'table' | 'detail';
type SortField = 'month' | 'status' | 'total' | 'dueDate' | 'student';
type SortDir = 'asc' | 'desc';

const VIEW_OPTIONS: { id: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'card', label: 'Cards', icon: LayoutGrid },
  { id: 'table', label: 'Table', icon: Columns3 },
  { id: 'detail', label: 'Details', icon: LayoutList },
];

function fmtMonth(m: string) {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  const d = new Date(Number(y), Number(mo) - 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_PILL: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-700',
  PAID: 'bg-green-50 text-green-700',
  OVERDUE: 'bg-red-50 text-red-700',
  WAIVED: 'bg-blue-50 text-blue-700',
  REFUNDED: 'bg-gray-100 text-gray-500',
};

// ─── Sort header for table view ───────────────────────────────────────────────

function SortButton({
  field,
  label,
  current,
  dir,
  onSort,
}: {
  field: SortField;
  label: string;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = current === field;
  return (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
    >
      {label}
      {active && (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  );
}

// ─── Expandable detail row ────────────────────────────────────────────────────

function DetailRow({
  payment: p,
  studentName,
  batchName,
  centreName,
  onMarkPaid,
  onWaive,
  onEdit,
}: {
  payment: PaymentDocument;
  studentName: string;
  batchName: string;
  centreName: string;
  onMarkPaid: () => void;
  onWaive: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isPending = p.status === 'PENDING' || p.status === 'OVERDUE';

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-brand-secondary truncate">{studentName}</p>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_PILL[p.status])}>
              {p.status}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{fmtMonth(p.month)} · {batchName}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-brand-secondary">{formatINR(p.totalAmountPaise, { withDecimals: false })}</p>
          <p className="text-xs text-gray-400">{fmtDate(p.dueDate)}</p>
        </div>
        {open ? <ChevronUp size={16} className="shrink-0 text-gray-400" /> : <ChevronDown size={16} className="shrink-0 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-50 bg-gray-50/50 px-4 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-gray-400">Base Amount</span>
              <p className="font-medium text-gray-700">{formatINR(p.baseAmountPaise, { withDecimals: false })}</p>
            </div>
            <div>
              <span className="text-gray-400">GST ({p.gstRatePercentSnapshot}%)</span>
              <p className="font-medium text-gray-700">{formatINR(p.gstAmountPaise, { withDecimals: false })}</p>
            </div>
            <div>
              <span className="text-gray-400">Method</span>
              <p className="font-medium text-gray-700">{p.method === 'NONE' ? '—' : p.method.replace('_', ' ')}</p>
            </div>
            <div>
              <span className="text-gray-400">Paid Date</span>
              <p className="font-medium text-gray-700">{fmtDate(p.paidAt)}</p>
            </div>
            <div>
              <span className="text-gray-400">Receipt</span>
              <p className="font-medium text-gray-700">{p.receiptNumber ?? '—'}</p>
            </div>
            <div>
              <span className="text-gray-400">Centre</span>
              <p className="font-medium text-gray-700 truncate">{centreName}</p>
            </div>
            {p.notes && (
              <div className="col-span-2">
                <span className="text-gray-400">Notes</span>
                <p className="font-medium text-gray-700">{p.notes}</p>
              </div>
            )}
          </div>
          {isPending && (
            <div className="mt-3 flex gap-2">
              <button onClick={onMarkPaid} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                Mark Paid
              </button>
              <button onClick={onWaive} className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100">
                Waive
              </button>
              <button onClick={onEdit} className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                Edit
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const { profile } = useAuth();
  const [payments, setPayments] = useState<PaymentDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('list');
  const [editTarget, setEditTarget] = useState<PaymentDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [genMonth, setGenMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [genCentreId, setGenCentreId] = useState('');

  // Filters
  const [centreFilter, setCentreFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [sortField, setSortField] = useState<SortField>('month');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  // Lookup maps
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

  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  function handleExport() {
    if (filtered.length === 0) {
      toast.info('Nothing to export.');
      return;
    }
    exportPaymentsCsv(filtered, studentMap, batchMap, centreMap);
    toast.success(`Exported ${filtered.length} payment records`);
  }

  // Filtered list
  const filtered = useMemo(() => {
    let result = payments;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => {
        const sName = studentMap.get(p.studentId) ?? '';
        const bName = batchMap.get(p.batchId) ?? '';
        return sName.toLowerCase().includes(q) || bName.toLowerCase().includes(q) || (p.notes ?? '').toLowerCase().includes(q);
      });
    }
    if (centreFilter) result = result.filter((p) => p.centreId === centreFilter);
    if (statusFilter) result = result.filter((p) => p.status === statusFilter);
    if (monthFilter) result = result.filter((p) => p.month === monthFilter);

    const dir = sortDir === 'asc' ? 1 : -1;
    result = [...result].sort((a, b) => {
      switch (sortField) {
        case 'month': return a.month.localeCompare(b.month) * dir;
        case 'status': return a.status.localeCompare(b.status) * dir;
        case 'total': return (a.totalAmountPaise - b.totalAmountPaise) * dir;
        case 'dueDate': return ((a.dueDate ?? '').localeCompare(b.dueDate ?? '')) * dir;
        case 'student': return ((studentMap.get(a.studentId) ?? '').localeCompare(studentMap.get(b.studentId) ?? '')) * dir;
        default: return 0;
      }
    });
    return result;
  }, [payments, search, studentMap, batchMap, centreFilter, statusFilter, monthFilter, sortField, sortDir]);

  // Summary stats
  const totalBilled = filtered.reduce((sum, p) => sum + p.totalAmountPaise, 0);
  const totalCollected = filtered.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + p.totalAmountPaise, 0);
  const pendingCount = filtered.filter((p) => p.status === 'PENDING' || p.status === 'OVERDUE').length;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [pData, cData, bData, sData] = await Promise.all([
        getAllPayments(),
        getAllCentres(),
        getAllBatches(),
        getAllStudents(),
      ]);
      setPayments(pData);
      setCentres(cData);
      setBatches(bData);
      setStudents(sData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (values: PaymentFormValues) => {
    if (!profile) return;
    setBusy(true);
    try {
      await createPayment(values, profile.id);
      toast.success('Payment record created');
      setMode('list');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create payment');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (values: PaymentFormValues) => {
    if (!profile || !editTarget) return;
    setBusy(true);
    try {
      await updatePayment(editTarget.id, values, profile.id);
      toast.success('Payment updated');
      setMode('list');
      setEditTarget(null);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update payment');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (payment: PaymentDocument) => {
    if (!confirm('Delete this payment record? This cannot be undone.')) return;
    try {
      await deletePayment(payment.id);
      toast.success('Payment deleted');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete payment');
    }
  };

  const handleMarkPaid = async (payment: PaymentDocument) => {
    if (!profile) return;
    const method = prompt('Payment method? (CASH, BANK_TRANSFER, CHEQUE)', 'CASH');
    if (!method) return;
    try {
      await markPaymentPaid(payment.id, method as any, null, profile.id);
      toast.success('Marked as paid');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to mark as paid');
    }
  };

  const handleWaive = async (payment: PaymentDocument) => {
    if (!profile) return;
    if (!confirm('Waive this payment? The student will not be charged.')) return;
    try {
      await waivePayment(payment.id, profile.id, 'Waived by admin');
      toast.success('Payment waived');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to waive payment');
    }
  };

  const handleEdit = (payment: PaymentDocument) => {
    setEditTarget(payment);
    setMode('edit');
  };

  const handleGenerateFees = async () => {
    if (!profile || !genMonth) return;
    setBusy(true);
    try {
      const { created, skipped } = await generateMonthlyFees(genMonth, profile.id, genCentreId || undefined);
      toast.success(`Generated ${created} fee record${created !== 1 ? 's' : ''}${skipped > 0 ? ` · ${skipped} already existed` : ''}`);
      setShowGenDialog(false);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate fees');
    } finally {
      setBusy(false);
    }
  };

  function paymentToFormValues(p: PaymentDocument): Partial<PaymentFormValues> {
    return {
      studentId: p.studentId,
      batchId: p.batchId,
      centreId: p.centreId,
      month: p.month,
      baseAmountRupees: paiseToRupees(p.baseAmountPaise),
      gstRatePercent: p.gstRatePercentSnapshot,
      method: p.method,
      status: p.status,
      dueDate: p.dueDate ?? '',
      notes: p.notes ?? '',
    };
  }

  // ── Create / Edit ──

  if (mode === 'create') {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Record Payment</h1>
        <div className="card">
          <PaymentForm
            centres={centres}
            batches={batches}
            students={students}
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
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Edit Payment</h1>
        <div className="card">
          <PaymentForm
            centres={centres}
            batches={batches}
            students={students}
            initialValues={paymentToFormValues(editTarget)}
            onSubmit={handleUpdate}
            onCancel={() => { setMode('list'); setEditTarget(null); }}
            busy={busy}
          />
        </div>
      </div>
    );
  }

  // ── List view ──

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Payments</h1>
          <p className="text-sm text-gray-500">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 bg-white">
            {VIEW_OPTIONS.map((v) => {
              const Icon = v.icon;
              return (
                <button
                  key={v.id}
                  onClick={() => setViewMode(v.id)}
                  title={v.label}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition',
                    viewMode === v.id ? 'bg-brand-primary text-white' : 'text-gray-500 hover:bg-gray-50',
                    v.id === 'card' && 'rounded-l-lg',
                    v.id === 'detail' && 'rounded-r-lg',
                  )}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              );
            })}
          </div>
          <button onClick={handleExport} className="btn-secondary" title="Export visible rows to CSV">
            <Download size={16} /> <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button onClick={() => setShowGenDialog(true)} className="btn-secondary" title="Bulk-create monthly fee records">
            <RefreshCw size={16} /> <span className="hidden sm:inline">Generate Fees</span>
          </button>
          <button onClick={() => setMode('create')} className="btn-primary">
            <Plus size={16} /> Record Payment
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-green-50 p-2"><IndianRupee size={18} className="text-green-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Collected</p>
            <p className="text-lg font-bold text-brand-secondary">{formatINR(totalCollected, { withDecimals: false })}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2"><IndianRupee size={18} className="text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Total Billed</p>
            <p className="text-lg font-bold text-brand-secondary">{formatINR(totalBilled, { withDecimals: false })}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-yellow-50 p-2"><IndianRupee size={18} className="text-yellow-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Pending / Overdue</p>
            <p className="text-lg font-bold text-brand-secondary">{pendingCount}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by student, batch, or notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <select value={centreFilter} onChange={(e) => setCentreFilter(e.target.value)} className="input w-auto py-2 text-sm">
          <option value="">All Centres</option>
          {centres.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="OVERDUE">Overdue</option>
          <option value="WAIVED">Waived</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <input
          type="month"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="input w-auto py-2 text-sm"
          placeholder="Filter by month"
        />
      </div>

      {/* Content */}
      {loading ? (
        <CardSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IndianRupee size={48} />}
          title="No payment records"
          description="Create fee entries for students to start tracking payments."
          action={
            <button onClick={() => setMode('create')} className="btn-primary">
              <Plus size={16} /> Record your first payment
            </button>
          }
        />
      ) : (
        <>
          {/* ── Card view ── */}
          {viewMode === 'card' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <PaymentCard
                  key={p.id}
                  payment={p}
                  studentName={studentMap.get(p.studentId)}
                  batchName={batchMap.get(p.batchId)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onMarkPaid={handleMarkPaid}
                  onWaive={handleWaive}
                />
              ))}
            </div>
          )}

          {/* ── Table view ── */}
          {viewMode === 'table' && (
            <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3">
                      <SortButton field="student" label="Student" current={sortField} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Batch</span>
                    </th>
                    <th className="px-4 py-3">
                      <SortButton field="month" label="Month" current={sortField} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3 text-right">
                      <SortButton field="total" label="Total" current={sortField} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Base + GST</span>
                    </th>
                    <th className="px-4 py-3">
                      <SortButton field="dueDate" label="Due" current={sortField} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3">
                      <SortButton field="status" label="Status" current={sortField} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Method</span>
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-2.5 font-medium text-brand-secondary max-w-[160px] truncate">
                        {studentMap.get(p.studentId) ?? p.studentId}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 max-w-[120px] truncate hidden md:table-cell">
                        {batchMap.get(p.batchId) ?? p.batchId}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtMonth(p.month)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-brand-secondary whitespace-nowrap">
                        {formatINR(p.totalAmountPaise, { withDecimals: false })}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap hidden lg:table-cell">
                        {formatINR(p.baseAmountPaise, { withDecimals: false })} + {formatINR(p.gstAmountPaise, { withDecimals: false })}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(p.dueDate)}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', STATUS_PILL[p.status])}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 hidden lg:table-cell">
                        {p.method === 'NONE' ? '—' : p.method.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-2.5">
                        {(p.status === 'PENDING' || p.status === 'OVERDUE') && (
                          <button
                            onClick={() => handleMarkPaid(p)}
                            className="rounded-lg bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 whitespace-nowrap"
                          >
                            Mark Paid
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Detail view (expandable rows) ── */}
          {viewMode === 'detail' && (
            <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden divide-y divide-gray-50">
              {filtered.map((p) => (
                <DetailRow
                  key={p.id}
                  payment={p}
                  studentName={studentMap.get(p.studentId) ?? p.studentId}
                  batchName={batchMap.get(p.batchId) ?? p.batchId}
                  centreName={centreMap.get(p.centreId) ?? p.centreId}
                  onMarkPaid={() => handleMarkPaid(p)}
                  onWaive={() => handleWaive(p)}
                  onEdit={() => handleEdit(p)}
                />
              ))}
            </div>
          )}

          <p className="mt-2 text-right text-xs text-gray-400">
            Showing {filtered.length} of {payments.length}
          </p>
        </>
      )}

      {/* Generate Monthly Fees dialog */}
      {showGenDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white shadow-xl">
            <div className="border-b border-gray-100 p-4">
              <h2 className="text-base font-semibold text-brand-secondary">Generate Monthly Fees</h2>
              <p className="mt-0.5 text-xs text-gray-400">
                Creates a PENDING fee record for every active enrollment. Existing records for the same student+batch+month are skipped.
              </p>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <label className="label">Month</label>
                <input
                  type="month"
                  value={genMonth}
                  onChange={(e) => setGenMonth(e.target.value)}
                  className="input"
                  disabled={busy}
                />
              </div>
              <div>
                <label className="label">Centre (optional — leave blank for all)</label>
                <select
                  value={genCentreId}
                  onChange={(e) => setGenCentreId(e.target.value)}
                  className="input"
                  disabled={busy}
                >
                  <option value="">All Centres</option>
                  {centres.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
              <button onClick={() => setShowGenDialog(false)} className="btn-secondary" disabled={busy}>Cancel</button>
              <button onClick={handleGenerateFees} className="btn-primary" disabled={busy || !genMonth}>
                {busy ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
