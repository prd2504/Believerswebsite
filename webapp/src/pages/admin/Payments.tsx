/**
 * Admin payments page — create fees, record cash payments, track overdue.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, IndianRupee, Download } from 'lucide-react';
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

  // Filters
  const [centreFilter, setCentreFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

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
    if (centreFilter) result = result.filter((p) => p.centreId === centreFilter);
    if (statusFilter) result = result.filter((p) => p.status === statusFilter);
    if (monthFilter) result = result.filter((p) => p.month === monthFilter);
    return result;
  }, [payments, centreFilter, statusFilter, monthFilter]);

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
      await markPaymentPaid(payment.id, method as any, profile.id);
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
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn-secondary" title="Export visible rows to CSV">
            <Download size={16} /> Export CSV
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
    </div>
  );
}
