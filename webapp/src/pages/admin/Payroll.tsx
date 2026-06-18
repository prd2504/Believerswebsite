import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  ChevronLeft,
  CheckCircle,
  Banknote,
  Edit2,
  Trash2,
  Users,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getAllCentres } from '@/services/centreService';
import {
  getAllStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  getAllPayrollRuns,
  getPayrollRunsByMonth,
  createPayrollRun,
  updatePayrollRun,
  approvePayrollRun,
  markPayrollPaid,
  deletePayrollRun,
} from '@/services/payrollService';
import { StaffForm } from '@/components/payroll/StaffForm';
import { PayrollRunForm } from '@/components/payroll/PayrollRunForm';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { formatINR, paiseToRupees } from '@bba/shared';
import type {
  StaffDocument,
  PayrollRunDocument,
  CentreDocument,
  PayrollRunStatus,
} from '@bba/shared';
import type { StaffFormValues, PayrollRunFormValues } from '@/lib/schemas/payrollSchema';
import { cn } from '@/lib/cn';

type Tab = 'runs' | 'staff';
type Mode = 'list' | 'create-staff' | 'edit-staff' | 'create-run' | 'edit-run';

const STATUS_BADGE: Record<PayrollRunStatus, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function PayrollPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('runs');
  const [mode, setMode] = useState<Mode>('list');
  const [staff, setStaff] = useState<StaffDocument[]>([]);
  const [runs, setRuns] = useState<PayrollRunDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffDocument | PayrollRunDocument | null>(null);
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [paymentRefInput, setPaymentRefInput] = useState('');
  const [payingRunId, setPayingRunId] = useState<string | null>(null);

  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [s, r, c] = await Promise.all([getAllStaff(), getAllPayrollRuns(), getAllCentres()]);
      setStaff(s);
      setRuns(r);
      setCentres(c);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredRuns = useMemo(
    () => runs.filter((r) => r.month === filterMonth),
    [runs, filterMonth],
  );

  const totals = useMemo(() => {
    let gross = 0, deductions = 0, net = 0;
    filteredRuns.forEach((r) => {
      gross += r.grossPayPaise;
      deductions += r.totalDeductionsPaise;
      net += r.netPayPaise;
    });
    return { gross, deductions, net };
  }, [filteredRuns]);

  // ── Staff CRUD ──

  async function handleCreateStaff(values: StaffFormValues) {
    if (!profile) return;
    setBusy(true);
    try {
      await createStaff(values, profile.id);
      toast.success('Staff member added');
      setMode('list');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to add staff');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateStaff(values: StaffFormValues) {
    if (!profile || !editTarget) return;
    setBusy(true);
    try {
      await updateStaff(editTarget.id, values, profile.id);
      toast.success('Staff updated');
      setMode('list');
      setEditTarget(null);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update staff');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteStaff(s: StaffDocument) {
    if (!confirm(`Delete ${s.name}? This cannot be undone.`)) return;
    try {
      await deleteStaff(s.id);
      toast.success('Staff deleted');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete');
    }
  }

  // ── Payroll run CRUD ──

  async function handleCreateRun(values: PayrollRunFormValues) {
    if (!profile) return;
    const selectedStaff = staff.find((s) => s.id === values.staffId);
    if (!selectedStaff) { toast.error('Staff not found'); return; }
    setBusy(true);
    try {
      await createPayrollRun(values, selectedStaff, profile.id);
      toast.success('Payroll run created');
      setMode('list');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create payroll run');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateRun(values: PayrollRunFormValues) {
    if (!profile || !editTarget) return;
    const selectedStaff = staff.find((s) => s.id === values.staffId);
    if (!selectedStaff) { toast.error('Staff not found'); return; }
    setBusy(true);
    try {
      await updatePayrollRun(editTarget.id, values, selectedStaff, profile.id);
      toast.success('Payroll run updated');
      setMode('list');
      setEditTarget(null);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update');
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(run: PayrollRunDocument) {
    if (!profile) return;
    if (!confirm(`Approve payroll for ${run.staffName}?`)) return;
    try {
      await approvePayrollRun(run.id, profile.id);
      toast.success('Approved');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to approve');
    }
  }

  async function handleMarkPaid(runId: string) {
    if (!profile) return;
    try {
      await markPayrollPaid(runId, paymentRefInput, profile.id);
      toast.success('Marked as paid');
      setPayingRunId(null);
      setPaymentRefInput('');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to mark paid');
    }
  }

  async function handleDeleteRun(run: PayrollRunDocument) {
    if (run.status !== 'DRAFT') {
      toast.error('Only draft runs can be deleted');
      return;
    }
    if (!confirm(`Delete payroll run for ${run.staffName}?`)) return;
    try {
      await deletePayrollRun(run.id);
      toast.success('Deleted');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete');
    }
  }

  // ── Create / Edit views ──

  if (mode === 'create-staff' || mode === 'edit-staff') {
    const staffDoc = editTarget as StaffDocument | null;
    const initial: Partial<StaffFormValues> | undefined = staffDoc
      ? {
          staffCode: staffDoc.staffCode,
          name: staffDoc.name,
          phone: staffDoc.phone ?? '',
          email: staffDoc.email ?? '',
          centreIds: staffDoc.centreIds,
          employmentType: staffDoc.employmentType,
          rateRupees: paiseToRupees(staffDoc.ratePaise),
          bankAccountLast4: staffDoc.bankAccountLast4 ?? '',
          upiId: staffDoc.upiId ?? '',
          dateOfJoining: staffDoc.dateOfJoining ?? '',
        }
      : undefined;

    return (
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => { setMode('list'); setEditTarget(null); }}
          className="btn-ghost mb-4 text-sm text-gray-500"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <h1 className="mb-4 text-xl font-bold text-brand-secondary">
          {mode === 'create-staff' ? 'Add Staff Member' : `Edit ${staffDoc?.name}`}
        </h1>
        <div className="card">
          <StaffForm
            centres={centres}
            initialValues={initial}
            onSubmit={mode === 'create-staff' ? handleCreateStaff : handleUpdateStaff}
            onCancel={() => { setMode('list'); setEditTarget(null); }}
            busy={busy}
          />
        </div>
      </div>
    );
  }

  if (mode === 'create-run' || mode === 'edit-run') {
    const runDoc = editTarget as PayrollRunDocument | null;
    const initial: Partial<PayrollRunFormValues> | undefined = runDoc
      ? {
          staffId: runDoc.staffId,
          month: runDoc.month,
          sessionsCount: runDoc.sessionsCount,
          basicRupees: paiseToRupees(runDoc.basicPaise),
          perSessionPayRupees: paiseToRupees(runDoc.perSessionPayPaise),
          allowancesRupees: paiseToRupees(runDoc.allowancesPaise),
          professionalTaxRupees: paiseToRupees(runDoc.professionalTaxPaise),
          tdsRupees: paiseToRupees(runDoc.tdsPaise),
          advanceRecoveryRupees: paiseToRupees(runDoc.advanceRecoveryPaise),
          otherDeductionsRupees: paiseToRupees(runDoc.otherDeductionsPaise),
          notes: runDoc.notes ?? '',
        }
      : undefined;

    return (
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => { setMode('list'); setEditTarget(null); }}
          className="btn-ghost mb-4 text-sm text-gray-500"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <h1 className="mb-4 text-xl font-bold text-brand-secondary">
          {mode === 'create-run' ? 'Create Payroll Run' : `Edit Run — ${runDoc?.staffName}`}
        </h1>
        <div className="card">
          <PayrollRunForm
            staffList={staff}
            initialValues={initial}
            onSubmit={mode === 'create-run' ? handleCreateRun : handleUpdateRun}
            onCancel={() => { setMode('list'); setEditTarget(null); }}
            busy={busy}
          />
        </div>
      </div>
    );
  }

  // ── List view ──

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Payroll</h1>
        <CardSkeleton count={4} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Payroll</h1>
          <p className="text-sm text-gray-500">{staff.length} staff · {runs.length} payroll runs</p>
        </div>
        <div className="flex gap-2">
          {tab === 'staff' && (
            <button onClick={() => setMode('create-staff')} className="btn-primary text-sm">
              <Plus size={16} /> Add Staff
            </button>
          )}
          {tab === 'runs' && (
            <button onClick={() => setMode('create-run')} className="btn-primary text-sm">
              <Plus size={16} /> New Run
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setTab('runs')}
          className={cn(
            'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            tab === 'runs' ? 'bg-white text-brand-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <FileText size={14} className="mr-1 inline" /> Payroll Runs
        </button>
        <button
          onClick={() => setTab('staff')}
          className={cn(
            'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            tab === 'staff' ? 'bg-white text-brand-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <Users size={14} className="mr-1 inline" /> Staff Directory
        </button>
      </div>

      {tab === 'runs' && (
        <>
          {/* Month filter + summary */}
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div className="w-44">
              <label className="label">Month</label>
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="input"
              />
            </div>
            {filteredRuns.length > 0 && (
              <div className="flex gap-4 text-sm">
                <span className="text-green-600 font-medium">
                  Gross: {formatINR(totals.gross, { withDecimals: false })}
                </span>
                <span className="text-red-600 font-medium">
                  Ded: {formatINR(totals.deductions, { withDecimals: false })}
                </span>
                <span className="text-brand-secondary font-bold">
                  Net: {formatINR(totals.net, { withDecimals: false })}
                </span>
              </div>
            )}
          </div>

          {filteredRuns.length === 0 ? (
            <EmptyState
              icon={<FileText size={48} />}
              title="No payroll runs"
              description={`No payroll entries for ${filterMonth}. Click "New Run" to create one.`}
            />
          ) : (
            <div className="space-y-3">
              {filteredRuns.map((run) => (
                <div key={run.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-brand-secondary truncate">{run.staffName}</p>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_BADGE[run.status])}>
                          {run.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {run.employmentType === 'SALARIED' ? 'Salaried' : `Per Session (${run.sessionsCount} sessions)`}
                        {run.centreIds.length > 0 && ` · ${run.centreIds.map((id) => centreMap.get(id) ?? id).join(', ')}`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        <span className="text-green-600">Gross: {formatINR(run.grossPayPaise, { withDecimals: false })}</span>
                        <span className="text-red-600">Ded: {formatINR(run.totalDeductionsPaise, { withDecimals: false })}</span>
                        <span className="font-bold text-brand-secondary">Net: {formatINR(run.netPayPaise, { withDecimals: false })}</span>
                      </div>
                      {run.paymentRef && (
                        <p className="mt-1 text-xs text-gray-400">UTR/Ref: {run.paymentRef}</p>
                      )}
                      {run.notes && (
                        <p className="mt-1 text-xs text-gray-400 italic">{run.notes}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {run.status === 'DRAFT' && (
                        <>
                          <button
                            onClick={() => handleApprove(run)}
                            className="btn-primary text-xs py-1.5"
                            title="Approve"
                          >
                            <CheckCircle size={13} /> Approve
                          </button>
                          <button
                            onClick={() => { setEditTarget(run); setMode('edit-run'); }}
                            className="btn-secondary text-xs py-1.5"
                            title="Edit"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteRun(run)}
                            className="btn-ghost text-xs py-1.5 text-red-400 hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                      {run.status === 'APPROVED' && (
                        <>
                          {payingRunId === run.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={paymentRefInput}
                                onChange={(e) => setPaymentRefInput(e.target.value)}
                                placeholder="UTR / UPI Ref"
                                className="input w-40 py-1.5 text-xs"
                              />
                              <button
                                onClick={() => handleMarkPaid(run.id)}
                                className="btn-primary text-xs py-1.5"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => { setPayingRunId(null); setPaymentRefInput(''); }}
                                className="btn-ghost text-xs py-1.5 text-gray-500"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setPayingRunId(run.id)}
                              className="btn-primary text-xs py-1.5"
                            >
                              <Banknote size={13} /> Mark Paid
                            </button>
                          )}
                        </>
                      )}
                      {run.status === 'PAID' && (
                        <span className="text-xs text-green-600 font-medium">Paid</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'staff' && (
        <>
          {staff.length === 0 ? (
            <EmptyState
              icon={<Users size={48} />}
              title="No staff members"
              description="Add your coaches to start tracking payroll."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {staff.map((s) => (
                <div key={s.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-brand-secondary truncate">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.staffCode}</p>
                      <p className="text-xs text-gray-500">
                        {s.employmentType === 'SALARIED'
                          ? `Salaried — ${formatINR(s.ratePaise, { withDecimals: false })}/mo`
                          : `Per Session — ${formatINR(s.ratePaise, { withDecimals: false })}/session`}
                      </p>
                      {s.centreIds.length > 0 && (
                        <p className="text-xs text-gray-400">
                          {s.centreIds.map((id) => centreMap.get(id) ?? id).join(', ')}
                        </p>
                      )}
                      {s.phone && <p className="text-xs text-gray-400">{s.phone}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        onClick={() => { setEditTarget(s); setMode('edit-staff'); }}
                        className="btn-secondary text-xs py-1.5"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteStaff(s)}
                        className="btn-ghost text-xs py-1.5 text-red-400 hover:text-red-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
