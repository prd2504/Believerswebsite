import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  payrollRunFormSchema,
  type PayrollRunFormValues,
  defaultPayrollRunFormValues,
} from '@/lib/schemas/payrollSchema';
import { calculateProfessionalTax, countCoachSessions } from '@/services/payrollService';
import { paiseToRupees, formatINR, rupeesToPaise, PAYROLL } from '@bba/shared';
import type { StaffDocument, BatchDocument } from '@bba/shared';

interface PayrollRunFormProps {
  staffList: StaffDocument[];
  batches: BatchDocument[];
  initialValues?: Partial<PayrollRunFormValues>;
  onSubmit: (values: PayrollRunFormValues) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

export function PayrollRunForm({
  staffList,
  batches,
  initialValues,
  onSubmit,
  onCancel,
  busy,
}: PayrollRunFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PayrollRunFormValues>({
    resolver: zodResolver(payrollRunFormSchema),
    defaultValues: { ...defaultPayrollRunFormValues(), ...initialValues },
  });

  const [fetchingSessions, setFetchingSessions] = useState(false);

  const staffId = watch('staffId');
  const month = watch('month');
  const selectedStaff = staffList.find((s) => s.id === staffId);

  const basicRupees = watch('basicRupees');
  const perSessionPayRupees = watch('perSessionPayRupees');
  const allowancesRupees = watch('allowancesRupees');
  const sessionsCount = watch('sessionsCount');
  const ptRupees = watch('professionalTaxRupees');
  const tdsRupees = watch('tdsRupees');
  const advanceRupees = watch('advanceRecoveryRupees');
  const otherRupees = watch('otherDeductionsRupees');

  const gross = (basicRupees || 0) + (perSessionPayRupees || 0) + (allowancesRupees || 0);
  const deductions = (ptRupees || 0) + (tdsRupees || 0) + (advanceRupees || 0) + (otherRupees || 0);
  const net = gross - deductions;

  // Auto-fill basic salary when staff is selected (new runs only)
  useEffect(() => {
    if (!selectedStaff || initialValues?.staffId) return;
    if (selectedStaff.employmentType === 'SALARIED') {
      setValue('basicRupees', paiseToRupees(selectedStaff.ratePaise));
      setValue('perSessionPayRupees', 0);
    } else {
      setValue('basicRupees', 0);
    }
  }, [staffId, selectedStaff, setValue, initialValues?.staffId]);

  // Auto-fetch session count from attendance data
  useEffect(() => {
    if (!selectedStaff || !month || initialValues?.staffId) return;
    if (!selectedStaff.authUid) return;

    const coachBatchIds = batches
      .filter((b) => b.coachIds?.includes(selectedStaff.authUid!))
      .map((b) => b.id);

    if (coachBatchIds.length === 0) return;

    setFetchingSessions(true);
    countCoachSessions(selectedStaff.authUid, coachBatchIds, month)
      .then((count) => {
        setValue('sessionsCount', count);
        if (selectedStaff.employmentType === 'PER_SESSION') {
          const payRupees = count * paiseToRupees(selectedStaff.ratePaise);
          setValue('perSessionPayRupees', payRupees);
        }
      })
      .catch((err) => console.error('Failed to fetch sessions:', err))
      .finally(() => setFetchingSessions(false));
  }, [staffId, month, selectedStaff, batches, setValue, initialValues?.staffId]);

  // Auto-calculate Professional Tax for salaried staff
  useEffect(() => {
    if (!selectedStaff || selectedStaff.employmentType !== 'SALARIED') return;
    const grossPaise = rupeesToPaise(gross);
    const monthNum = month ? parseInt(month.split('-')[1], 10) : 0;
    const ptPaise = calculateProfessionalTax(grossPaise, monthNum);
    setValue('professionalTaxRupees', paiseToRupees(ptPaise));
  }, [gross, month, selectedStaff, setValue]);

  // Auto-calculate TDS for per-session staff
  useEffect(() => {
    if (!selectedStaff || selectedStaff.employmentType !== 'PER_SESSION') return;
    const tds = Math.round(gross * PAYROLL.section194JTdsRatePercent / 100);
    setValue('tdsRupees', tds);
  }, [gross, selectedStaff, setValue]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit, () => toast.error('Please fix the highlighted fields.'))}
      className="space-y-5"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Staff Member</label>
          <select {...register('staffId')} className="input" disabled={busy || !!initialValues?.staffId}>
            <option value="">Select staff</option>
            {staffList.filter((s) => s.status === 'ACTIVE').map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.employmentType === 'SALARIED' ? 'Salaried' : 'Per Session'})
              </option>
            ))}
          </select>
          {errors.staffId && <p className="mt-1 text-xs text-red-600">{errors.staffId.message}</p>}
        </div>
        <div>
          <label className="label">Month</label>
          <input {...register('month')} type="month" className="input" disabled={busy} />
          {errors.month && <p className="mt-1 text-xs text-red-600">{errors.month.message}</p>}
        </div>
      </div>

      {selectedStaff && (
        <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
          {selectedStaff.employmentType === 'SALARIED'
            ? `Salaried — Monthly basic: ${formatINR(selectedStaff.ratePaise, { withDecimals: false })}`
            : `Per session — Rate: ${formatINR(selectedStaff.ratePaise, { withDecimals: false })} / session`}
          {selectedStaff.authUid && (
            <span className="ml-2 text-green-600">Linked to app account</span>
          )}
          {!selectedStaff.authUid && (
            <span className="ml-2 text-yellow-600">No linked account — session count entered manually</span>
          )}
        </div>
      )}

      {/* Earnings */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand-secondary">Earnings</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="label">
              Sessions
              {fetchingSessions && <span className="ml-1 text-gray-400">(loading…)</span>}
            </label>
            <input
              {...register('sessionsCount', { valueAsNumber: true })}
              type="number"
              min={0}
              className="input"
              disabled={busy || fetchingSessions}
            />
            {selectedStaff?.authUid && !fetchingSessions && sessionsCount > 0 && (
              <p className="mt-0.5 text-[10px] text-green-600">Auto-fetched from attendance</p>
            )}
          </div>
          <div>
            <label className="label">Basic (₹)</label>
            <input
              {...register('basicRupees', { valueAsNumber: true })}
              type="number"
              min={0}
              step={100}
              className="input"
              disabled={busy}
            />
          </div>
          <div>
            <label className="label">Per-Session Pay (₹)</label>
            <input
              {...register('perSessionPayRupees', { valueAsNumber: true })}
              type="number"
              min={0}
              step={100}
              className="input"
              disabled={busy}
            />
            {selectedStaff?.employmentType === 'PER_SESSION' && sessionsCount > 0 && (
              <p className="mt-0.5 text-[10px] text-gray-400">
                {sessionsCount} sessions × {formatINR(selectedStaff.ratePaise, { withDecimals: false })}
              </p>
            )}
          </div>
          <div>
            <label className="label">Allowances (₹)</label>
            <input
              {...register('allowancesRupees', { valueAsNumber: true })}
              type="number"
              min={0}
              step={100}
              className="input"
              disabled={busy}
            />
          </div>
        </div>
      </div>

      {/* Deductions */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand-secondary">Deductions</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="label">Professional Tax (₹)</label>
            <input
              {...register('professionalTaxRupees', { valueAsNumber: true })}
              type="number"
              min={0}
              className="input"
              disabled={busy}
            />
            {selectedStaff?.employmentType === 'SALARIED' && (
              <p className="mt-0.5 text-[10px] text-gray-400">Auto-calculated (Maharashtra)</p>
            )}
          </div>
          <div>
            <label className="label">TDS (₹)</label>
            <input
              {...register('tdsRupees', { valueAsNumber: true })}
              type="number"
              min={0}
              className="input"
              disabled={busy}
            />
            {selectedStaff?.employmentType === 'PER_SESSION' && (
              <p className="mt-0.5 text-[10px] text-gray-400">Sec 194J @ {PAYROLL.section194JTdsRatePercent}%</p>
            )}
          </div>
          <div>
            <label className="label">Advance Recovery (₹)</label>
            <input
              {...register('advanceRecoveryRupees', { valueAsNumber: true })}
              type="number"
              min={0}
              className="input"
              disabled={busy}
            />
          </div>
          <div>
            <label className="label">Other Deductions (₹)</label>
            <input
              {...register('otherDeductionsRupees', { valueAsNumber: true })}
              type="number"
              min={0}
              className="input"
              disabled={busy}
            />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-500">Gross Pay</p>
            <p className="text-lg font-bold text-green-600">{formatINR(rupeesToPaise(gross), { withDecimals: false })}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Deductions</p>
            <p className="text-lg font-bold text-red-600">- {formatINR(rupeesToPaise(deductions), { withDecimals: false })}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Net Pay</p>
            <p className="text-lg font-bold text-brand-secondary">{formatINR(rupeesToPaise(Math.max(0, net)), { withDecimals: false })}</p>
          </div>
        </div>
      </div>

      <div>
        <label className="label">Notes (optional)</label>
        <input {...register('notes')} className="input" placeholder="Any remarks" disabled={busy} />
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : initialValues ? 'Update Run' : 'Create Run'}
        </button>
      </div>
    </form>
  );
}
