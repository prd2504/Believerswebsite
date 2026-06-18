import { useState, useEffect, useCallback, useRef } from 'react';
import { Banknote, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getStaffByAuthUid, getPayrollRunsByStaff } from '@/services/payrollService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { formatINR, COMPANY } from '@bba/shared';
import type { StaffDocument, PayrollRunDocument, PayrollRunStatus } from '@bba/shared';
import { cn } from '@/lib/cn';

const STATUS_BADGE: Record<PayrollRunStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Processing', cls: 'bg-yellow-100 text-yellow-700' },
  APPROVED: { label: 'Approved', cls: 'bg-blue-100 text-blue-700' },
  PAID: { label: 'Paid', cls: 'bg-green-100 text-green-700' },
};

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const date = new Date(y, m - 1);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export default function CoachSalaryPage() {
  const { profile } = useAuth();
  const [staffDoc, setStaffDoc] = useState<StaffDocument | null>(null);
  const [runs, setRuns] = useState<PayrollRunDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const [selectedRun, setSelectedRun] = useState<PayrollRunDocument | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const staff = await getStaffByAuthUid(profile.id);
      if (!staff) {
        setNotLinked(true);
        return;
      }
      setStaffDoc(staff);
      const data = await getPayrollRunsByStaff(staff.id);
      setRuns(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load salary data');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  function handlePrint() {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print your payslip.');
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Payslip</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; color: #333; }
        @media print { body { padding: 0; } }
      </style>
      </head><body>${printRef.current.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  }

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Salary</h1>
        <CardSkeleton count={3} />
      </div>
    );
  }

  if (notLinked) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Salary</h1>
        <EmptyState
          icon={<Banknote size={48} />}
          title="Not yet set up"
          description="Your salary profile hasn't been linked to your account yet. Please contact admin to set this up."
        />
      </div>
    );
  }

  // Payslip detail view
  if (selectedRun && staffDoc) {
    return (
      <div className="p-4">
        <button
          onClick={() => setSelectedRun(null)}
          className="btn-ghost mb-4 text-sm text-gray-500"
        >
          ← Back to salary history
        </button>

        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-brand-secondary">
            {selectedRun.employmentType === 'SALARIED' ? 'Salary Slip' : 'Fee Voucher'} — {monthLabel(selectedRun.month)}
          </h1>
          <button onClick={handlePrint} className="btn-secondary text-xs">
            <Printer size={14} /> Print / Save PDF
          </button>
        </div>

        {/* Printable payslip */}
        <div ref={printRef}>
          <div style={{ maxWidth: 600, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif' }}>
            {/* Header */}
            <div style={{ background: '#E8593C', color: 'white', padding: '16px 24px', borderRadius: '12px 12px 0 0' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{COMPANY.brandName}</h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.9 }}>
                {selectedRun.employmentType === 'SALARIED' ? 'Salary Slip' : 'Fee Voucher'} — {monthLabel(selectedRun.month)}
              </p>
            </div>

            <div style={{ border: '1px solid #e5e5e5', borderTop: 0, padding: 24, borderRadius: '0 0 12px 12px' }}>
              {/* Employee info */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 13 }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '4px 0', color: '#666' }}><strong>Name:</strong></td>
                    <td style={{ padding: '4px 0' }}>{staffDoc.name}</td>
                    <td style={{ padding: '4px 0', color: '#666' }}><strong>Staff Code:</strong></td>
                    <td style={{ padding: '4px 0' }}>{staffDoc.staffCode}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 0', color: '#666' }}><strong>Type:</strong></td>
                    <td style={{ padding: '4px 0' }}>{selectedRun.employmentType === 'SALARIED' ? 'Salaried' : 'Per Session'}</td>
                    <td style={{ padding: '4px 0', color: '#666' }}><strong>Month:</strong></td>
                    <td style={{ padding: '4px 0' }}>{monthLabel(selectedRun.month)}</td>
                  </tr>
                  {selectedRun.sessionsCount > 0 && (
                    <tr>
                      <td style={{ padding: '4px 0', color: '#666' }}><strong>Sessions:</strong></td>
                      <td style={{ padding: '4px 0' }}>{selectedRun.sessionsCount}</td>
                      <td style={{ padding: '4px 0', color: '#666' }}><strong>Status:</strong></td>
                      <td style={{ padding: '4px 0' }}>{selectedRun.status}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Earnings & Deductions */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#16a34a' }}>Earnings</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      {selectedRun.basicPaise > 0 && (
                        <tr>
                          <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>Basic</td>
                          <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{formatINR(selectedRun.basicPaise, { withDecimals: false })}</td>
                        </tr>
                      )}
                      {selectedRun.perSessionPayPaise > 0 && (
                        <tr>
                          <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>Per-Session Pay</td>
                          <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{formatINR(selectedRun.perSessionPayPaise, { withDecimals: false })}</td>
                        </tr>
                      )}
                      {selectedRun.allowancesPaise > 0 && (
                        <tr>
                          <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>Allowances</td>
                          <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{formatINR(selectedRun.allowancesPaise, { withDecimals: false })}</td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ padding: '6px 0', fontWeight: 700 }}>Gross Pay</td>
                        <td style={{ padding: '6px 0', fontWeight: 700, textAlign: 'right', color: '#16a34a' }}>{formatINR(selectedRun.grossPayPaise, { withDecimals: false })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#dc2626' }}>Deductions</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      {selectedRun.professionalTaxPaise > 0 && (
                        <tr>
                          <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>Professional Tax</td>
                          <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{formatINR(selectedRun.professionalTaxPaise, { withDecimals: false })}</td>
                        </tr>
                      )}
                      {selectedRun.tdsPaise > 0 && (
                        <tr>
                          <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>TDS</td>
                          <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{formatINR(selectedRun.tdsPaise, { withDecimals: false })}</td>
                        </tr>
                      )}
                      {selectedRun.advanceRecoveryPaise > 0 && (
                        <tr>
                          <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>Advance Recovery</td>
                          <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{formatINR(selectedRun.advanceRecoveryPaise, { withDecimals: false })}</td>
                        </tr>
                      )}
                      {selectedRun.otherDeductionsPaise > 0 && (
                        <tr>
                          <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>Other</td>
                          <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{formatINR(selectedRun.otherDeductionsPaise, { withDecimals: false })}</td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ padding: '6px 0', fontWeight: 700 }}>Total Deductions</td>
                        <td style={{ padding: '6px 0', fontWeight: 700, textAlign: 'right', color: '#dc2626' }}>{formatINR(selectedRun.totalDeductionsPaise, { withDecimals: false })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Net Pay */}
              <div style={{ background: '#f9fafb', border: '2px solid #E8593C', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 12, color: '#666' }}>Net Pay</p>
                <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 700, color: '#1A1A2E' }}>
                  {formatINR(selectedRun.netPayPaise, { withDecimals: false })}
                </p>
                {selectedRun.paymentRef && (
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9ca3af' }}>
                    Payment Ref: {selectedRun.paymentRef}
                  </p>
                )}
              </div>

              {selectedRun.notes && (
                <p style={{ marginTop: 16, fontSize: 12, color: '#666', fontStyle: 'italic' }}>
                  Note: {selectedRun.notes}
                </p>
              )}

              <p style={{ marginTop: 20, fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
                This is a system-generated {selectedRun.employmentType === 'SALARIED' ? 'salary slip' : 'fee voucher'} from {COMPANY.brandName}.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view
  const current = runs.find((r) => {
    const now = new Date();
    const cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return r.month === cm;
  });
  const history = runs.filter((r) => r !== current);

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Salary</h1>

      {runs.length === 0 ? (
        <EmptyState
          icon={<Banknote size={48} />}
          title="No salary records yet"
          description="Your salary slips will appear here once admin processes payroll."
        />
      ) : (
        <div className="space-y-6">
          {/* Current month */}
          {current && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-brand-secondary">Current Month</h2>
              <button
                onClick={() => setSelectedRun(current)}
                className="card w-full text-left transition hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-brand-secondary">{monthLabel(current.month)}</p>
                    <p className="text-xs text-gray-400">
                      {current.employmentType === 'SALARIED' ? 'Salaried' : `${current.sessionsCount} sessions`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-brand-secondary">
                      {formatINR(current.netPayPaise, { withDecimals: false })}
                    </p>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_BADGE[current.status].cls)}>
                      {STATUS_BADGE[current.status].label}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-brand-secondary">History</h2>
              <div className="space-y-2">
                {history.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => setSelectedRun(run)}
                    className="card w-full text-left transition hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-brand-secondary">{monthLabel(run.month)}</p>
                        <p className="text-xs text-gray-400">
                          {run.employmentType === 'SALARIED' ? 'Salaried' : `${run.sessionsCount} sessions`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-brand-secondary">
                          {formatINR(run.netPayPaise, { withDecimals: false })}
                        </p>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_BADGE[run.status].cls)}>
                          {STATUS_BADGE[run.status].label}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
