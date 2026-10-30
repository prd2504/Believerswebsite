import { useState, useEffect, useCallback, useRef } from 'react';
import { Banknote, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getStaffByAuthUid, getPayrollRunsByStaff } from '@/services/payrollService';
import { getAllCentres } from '@/services/centreService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { formatINR, paiseToWordsINR, COMPANY } from '@bba/shared';
import type { StaffDocument, PayrollRunDocument, PayrollRunStatus, CentreDocument } from '@bba/shared';
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CoachSalaryPage() {
  const { profile } = useAuth();
  const [staffDoc, setStaffDoc] = useState<StaffDocument | null>(null);
  const [runs, setRuns] = useState<PayrollRunDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const [selectedRun, setSelectedRun] = useState<PayrollRunDocument | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const [staff, centreData] = await Promise.all([
        getStaffByAuthUid(profile.id),
        getAllCentres(),
      ]);
      setCentres(centreData);
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

  const centreNames = (ids: string[]) =>
    ids.map((id) => centres.find((c) => c.id === id)?.name ?? id).join(', ') || '—';

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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f1f5f9; color: #333; }
        @media print { body { padding: 0; background: white; } }
      </style>
      </head><body>${printRef.current.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  }

  function earningRow(label: string, paise: number) {
    if (paise <= 0) return null;
    return (
      <tr key={label}>
        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: '#334155' }}>{label}</td>
        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13, textAlign: 'right', color: '#334155' }}>{formatINR(paise, { withDecimals: false })}</td>
      </tr>
    );
  }

  function deductionRow(label: string, paise: number) {
    if (paise <= 0) return null;
    return (
      <tr key={label}>
        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: '#334155' }}>{label}</td>
        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13, textAlign: 'right', color: '#334155' }}>{formatINR(paise, { withDecimals: false })}</td>
      </tr>
    );
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
    const docType = selectedRun.employmentType === 'SALARIED' ? 'SALARY SLIP' : 'FEE VOUCHER';
    const netWords = paiseToWordsINR(selectedRun.netPayPaise);

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

        {/* Printable payslip — matches Canva template */}
        <div ref={printRef}>
          <div style={{ maxWidth: 600, margin: '0 auto', background: '#ffffff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            {/* Header */}
            <div style={{ background: '#0D1B2A', padding: '20px 24px', textAlign: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff', letterSpacing: 0.5 }}>{COMPANY.legalName}</h2>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>{COMPANY.supportEmail}</p>
            </div>

            {/* Doc type bar */}
            <div style={{ background: '#D94F2A', padding: '10px 24px', textAlign: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', letterSpacing: 1.5 }}>{docType}</span>
              <span style={{ fontSize: 13, color: '#ffffff', opacity: 0.9, marginLeft: 12 }}>{monthLabel(selectedRun.month)}</span>
            </div>

            <div style={{ padding: 24 }}>
              {/* Employee Info */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 13 }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 0', color: '#64748b', width: '30%' }}>Employee Name</td>
                    <td style={{ padding: '6px 0', fontWeight: 600, color: '#0D1B2A' }}>{staffDoc.name}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 0', color: '#64748b' }}>Employee ID</td>
                    <td style={{ padding: '6px 0', fontWeight: 600, color: '#0D1B2A' }}>{staffDoc.staffCode}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 0', color: '#64748b' }}>Centre</td>
                    <td style={{ padding: '6px 0', color: '#0D1B2A' }}>{centreNames(staffDoc.centreIds)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 0', color: '#64748b' }}>Designation</td>
                    <td style={{ padding: '6px 0', color: '#0D1B2A' }}>Badminton Coach</td>
                  </tr>
                  {selectedRun.sessionsCount > 0 && (
                    <tr>
                      <td style={{ padding: '6px 0', color: '#64748b' }}>Sessions</td>
                      <td style={{ padding: '6px 0', color: '#0D1B2A' }}>{selectedRun.sessionsCount}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Earnings & Deductions side by side */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                {/* Earnings */}
                <div style={{ flex: 1, borderLeft: '3px solid #D94F2A', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ background: '#fef2f2', padding: '8px 12px' }}>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0D1B2A' }}>Earnings</h4>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {earningRow('Basic Pay', selectedRun.basicPaise)}
                      {earningRow('Per-Session Pay', selectedRun.perSessionPayPaise)}
                      {earningRow('Allowances / Bonus', selectedRun.allowancesPaise)}
                      <tr style={{ background: '#f8fafc' }}>
                        <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#0D1B2A' }}>Gross Earnings (A)</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: '#16a34a' }}>{formatINR(selectedRun.grossPayPaise, { withDecimals: false })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Deductions */}
                <div style={{ flex: 1, borderLeft: '3px solid #64748b', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ background: '#f8fafc', padding: '8px 12px' }}>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0D1B2A' }}>Deductions</h4>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {deductionRow('Professional Tax', selectedRun.professionalTaxPaise)}
                      {deductionRow('TDS', selectedRun.tdsPaise)}
                      {deductionRow('Advance Recovery', selectedRun.advanceRecoveryPaise)}
                      {deductionRow('Other Deductions', selectedRun.otherDeductionsPaise)}
                      <tr style={{ background: '#f8fafc' }}>
                        <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#0D1B2A' }}>Total Deductions (B)</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: '#dc2626' }}>{formatINR(selectedRun.totalDeductionsPaise, { withDecimals: false })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Net Pay */}
              <div style={{ background: '#0D1B2A', borderRadius: 8, padding: '16px 24px', textAlign: 'center', marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Net Pay (A − B)</p>
                <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 700, color: '#ffffff' }}>
                  {formatINR(selectedRun.netPayPaise, { withDecimals: false })}
                </p>
              </div>

              {/* Amount in words */}
              <div style={{ background: '#f8fafc', borderRadius: 6, padding: '10px 16px', marginBottom: 20, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{netWords}</p>
              </div>

              {/* Payment Details */}
              {selectedRun.status === 'PAID' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '6px 0', color: '#64748b' }}>Payment Date</td>
                      <td style={{ padding: '6px 0', color: '#0D1B2A' }}>{formatDate(selectedRun.paidAt)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px 0', color: '#64748b' }}>Payment Mode</td>
                      <td style={{ padding: '6px 0', color: '#0D1B2A' }}>
                        Bank Transfer{staffDoc.bankAccountLast4 ? ` · A/C: ••••${staffDoc.bankAccountLast4}` : ''}
                      </td>
                    </tr>
                    {selectedRun.paymentRef && (
                      <tr>
                        <td style={{ padding: '6px 0', color: '#64748b' }}>UTR / Reference</td>
                        <td style={{ padding: '6px 0', fontWeight: 600, color: '#0D1B2A' }}>{selectedRun.paymentRef}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {selectedRun.notes && (
                <p style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', margin: '0 0 16px' }}>
                  Note: {selectedRun.notes}
                </p>
              )}

              {/* Footer */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
                  This is a system-generated document issued under the Code on Wages, 2019 and applicable Maharashtra State rules.<br />
                  No signature is required for electronically generated payslips.
                </p>
                <p style={{ margin: '12px 0 0', fontSize: 11, color: '#64748b' }}>
                  For <strong>{COMPANY.legalName}</strong><br />
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>Authorised Signatory</span>
                </p>
              </div>
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
