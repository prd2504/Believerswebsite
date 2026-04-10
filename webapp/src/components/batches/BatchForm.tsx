/**
 * Batch create/edit form. Uses react-hook-form + zod.
 */

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import {
  batchFormSchema,
  type BatchFormValues,
  defaultBatchFormValues,
} from '@/lib/schemas/batchSchema';
import { SportType, BatchLevel, BatchStatus } from '@bba/shared';
import type { CentreDocument } from '@bba/shared';

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

interface BatchFormProps {
  centres: CentreDocument[];
  initialValues?: Partial<BatchFormValues>;
  onSubmit: (values: BatchFormValues) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

export function BatchForm({ centres, initialValues, onSubmit, onCancel, busy }: BatchFormProps) {
  const defaults = { ...defaultBatchFormValues(centres[0]?.id), ...initialValues };
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<BatchFormValues>({
    resolver: zodResolver(batchFormSchema),
    defaultValues: defaults,
  });

  const { fields: scheduleFields, append, remove } = useFieldArray({
    control,
    name: 'schedule',
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Centre selector */}
      <div>
        <label className="label">Centre</label>
        <select {...register('centreId')} className="input" disabled={busy}>
          <option value="">Select a centre</option>
          {centres.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {errors.centreId && <p className="mt-1 text-xs text-red-600">{errors.centreId.message}</p>}
      </div>

      {/* Name & description */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Batch name</label>
          <input {...register('name')} className="input" placeholder="Morning Juniors" disabled={busy} />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label">Description (optional)</label>
          <input {...register('description')} className="input" placeholder="Batch for beginners aged 8-12" disabled={busy} />
        </div>
      </div>

      {/* Sport, Level, Status */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Sport</label>
          <select {...register('sport')} className="input" disabled={busy}>
            {Object.values(SportType).map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Level</label>
          <select {...register('level')} className="input" disabled={busy}>
            {Object.values(BatchLevel).map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select {...register('status')} className="input" disabled={busy}>
            {Object.values(BatchStatus).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Capacity & Fee */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Max capacity</label>
          <input {...register('maxCapacity', { valueAsNumber: true })} type="number" min={1} max={100} className="input" disabled={busy} />
          {errors.maxCapacity && <p className="mt-1 text-xs text-red-600">{errors.maxCapacity.message}</p>}
        </div>
        <div>
          <label className="label">Monthly fee (₹)</label>
          <input {...register('monthlyFeeRupees', { valueAsNumber: true })} type="number" min={0} className="input" disabled={busy} />
          {errors.monthlyFeeRupees && <p className="mt-1 text-xs text-red-600">{errors.monthlyFeeRupees.message}</p>}
        </div>
      </div>

      {/* Weekly schedule */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Weekly schedule</label>
          <button
            type="button"
            onClick={() => append({ dayOfWeek: 1, startTime: '06:00', endTime: '07:00' })}
            className="btn-ghost text-xs text-brand-primary"
            disabled={busy}
          >
            <Plus size={14} /> Add slot
          </button>
        </div>
        {errors.schedule && <p className="mb-2 text-xs text-red-600">{errors.schedule.message}</p>}
        <div className="space-y-2">
          {scheduleFields.map((field, idx) => (
            <div key={field.id} className="flex items-center gap-2">
              <select
                {...register(`schedule.${idx}.dayOfWeek` as const, { valueAsNumber: true })}
                className="input w-32 py-1.5 text-xs"
                disabled={busy}
              >
                {DAY_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              <input
                {...register(`schedule.${idx}.startTime` as const)}
                type="time"
                className="input w-28 py-1.5 text-xs"
                disabled={busy}
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                {...register(`schedule.${idx}.endTime` as const)}
                type="time"
                className="input w-28 py-1.5 text-xs"
                disabled={busy}
              />
              {scheduleFields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="btn-ghost p-1 text-red-400 hover:text-red-600"
                  disabled={busy}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : initialValues ? 'Update Batch' : 'Create Batch'}
        </button>
      </div>
    </form>
  );
}
