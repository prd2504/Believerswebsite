/**
 * Payment create/edit form. Amounts entered in rupees; converted to paise in service.
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  paymentFormSchema,
  type PaymentFormValues,
  defaultPaymentFormValues,
} from '@/lib/schemas/paymentSchema';
import { PaymentStatus, PaymentMethod } from '@bba/shared';
import type { CentreDocument, BatchDocument, StudentDocument } from '@bba/shared';

interface PaymentFormProps {
  centres: CentreDocument[];
  batches: BatchDocument[];
  students: StudentDocument[];
  initialValues?: Partial<PaymentFormValues>;
  onSubmit: (values: PaymentFormValues) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

export function PaymentForm({
  centres,
  batches,
  students,
  initialValues,
  onSubmit,
  onCancel,
  busy,
}: PaymentFormProps) {
  const defaults = {
    ...defaultPaymentFormValues(centres[0]?.id, centres[0]?.gstRatePercent),
    ...initialValues,
  };
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: defaults,
  });

  const selectedCentreId = watch('centreId');
  const centreBatches = batches.filter((b) => b.centreId === selectedCentreId);
  const selectedBatchId = watch('batchId');
  const batchStudents = students.filter((s) => s.batchIds.includes(selectedBatchId));

  const baseRupees = watch('baseAmountRupees') ?? 0;
  const gstRate = watch('gstRatePercent') ?? 0;
  const gstAmount = Math.round(baseRupees * gstRate) / 100;
  const total = baseRupees + gstAmount;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Centre / Batch / Student */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Centre</label>
          <select {...register('centreId')} className="input" disabled={busy}>
            <option value="">Select centre</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.centreId && <p className="mt-1 text-xs text-red-600">{errors.centreId.message}</p>}
        </div>
        <div>
          <label className="label">Batch</label>
          <select {...register('batchId')} className="input" disabled={busy}>
            <option value="">Select batch</option>
            {centreBatches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {errors.batchId && <p className="mt-1 text-xs text-red-600">{errors.batchId.message}</p>}
        </div>
        <div>
          <label className="label">Student</label>
          <select {...register('studentId')} className="input" disabled={busy}>
            <option value="">Select student</option>
            {batchStudents.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {errors.studentId && <p className="mt-1 text-xs text-red-600">{errors.studentId.message}</p>}
        </div>
      </div>

      {/* Month & due date */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Fee month (YYYY-MM)</label>
          <input {...register('month')} type="month" className="input" disabled={busy} />
          {errors.month && <p className="mt-1 text-xs text-red-600">{errors.month.message}</p>}
        </div>
        <div>
          <label className="label">Due date (optional)</label>
          <input {...register('dueDate')} type="date" className="input" disabled={busy} />
        </div>
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Base amount (₹)</label>
          <input {...register('baseAmountRupees', { valueAsNumber: true })} type="number" min={0} step={1} className="input" disabled={busy} />
          {errors.baseAmountRupees && <p className="mt-1 text-xs text-red-600">{errors.baseAmountRupees.message}</p>}
        </div>
        <div>
          <label className="label">GST rate (%)</label>
          <input {...register('gstRatePercent', { valueAsNumber: true })} type="number" min={0} max={100} className="input" disabled={busy} />
        </div>
        <div>
          <label className="label">Total (auto)</label>
          <div className="input flex items-center bg-gray-50 font-semibold text-brand-secondary">
            ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Method & status */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Payment method</label>
          <select {...register('method')} className="input" disabled={busy}>
            {Object.values(PaymentMethod).map((m) => (
              <option key={m} value={m}>{m.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select {...register('status')} className="input" disabled={busy}>
            {Object.values(PaymentStatus).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="label">Notes (optional)</label>
        <input {...register('notes')} className="input" placeholder="Received cash, receipt #123, etc." disabled={busy} />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : initialValues ? 'Update Payment' : 'Create Payment'}
        </button>
      </div>
    </form>
  );
}
