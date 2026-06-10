/**
 * Batch create/edit form. Uses react-hook-form + zod.
 *
 * A batch is now (Centre + TimeSlot). The form captures:
 *   - centre, name, description, sport, level, status
 *   - one daily time window (startTime / endTime)
 *   - the days of the week the batch runs (offeredDays)
 *   - one or more pricing tiers (frequencyPlans) — daysPerWeek + monthly fee
 * Per-student day choices live on the Enrollment, not here.
 */

import { useForm, useFieldArray, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  batchFormSchema,
  type BatchFormValues,
  defaultBatchFormValues,
} from '@/lib/schemas/batchSchema';
import { SportType, BatchLevel, BatchStatus } from '@bba/shared';
import type { CentreDocument } from '@bba/shared';
import { cn } from '@/lib/cn';

const DAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
] as const;

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
    watch,
    setValue,
    formState: { errors },
  } = useForm<BatchFormValues>({
    resolver: zodResolver(batchFormSchema),
    defaultValues: defaults,
  });

  const { fields: planFields, append: appendPlan, remove: removePlan } = useFieldArray({
    control,
    name: 'frequencyPlans',
  });

  const { fields: slotFields, append: appendSlot, remove: removeSlot } = useFieldArray({
    control,
    name: 'timeSlots',
  });

  const offeredDays = watch('offeredDays');

  const toggleDay = (day: 0 | 1 | 2 | 3 | 4 | 5 | 6) => {
    const set = new Set(offeredDays);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    const next = Array.from(set).sort((a, b) => a - b);
    setValue('offeredDays', next as typeof offeredDays, { shouldValidate: true });
  };

  const onInvalid = (fieldErrors: FieldErrors<BatchFormValues>) => {
    const messages: string[] = [];
    const walk = (obj: Record<string, unknown>) => {
      for (const v of Object.values(obj)) {
        if (v && typeof v === 'object') {
          if ('message' in v && typeof (v as { message?: unknown }).message === 'string') {
            messages.push((v as { message: string }).message);
          } else {
            walk(v as Record<string, unknown>);
          }
        }
      }
    };
    walk(fieldErrors as unknown as Record<string, unknown>);
    toast.error(messages[0] ?? 'Please fix the highlighted fields.');
  };

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-5">
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
          <input {...register('name')} className="input" placeholder="Dadar 4–5 PM Beginner" disabled={busy} />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label">Description (optional)</label>
          <input {...register('description')} className="input" placeholder="Beginners aged 8–12" disabled={busy} />
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

      {/* Time window */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Start time</label>
          <input {...register('startTime')} type="time" className="input" disabled={busy} />
          {errors.startTime && <p className="mt-1 text-xs text-red-600">{errors.startTime.message}</p>}
        </div>
        <div>
          <label className="label">End time</label>
          <input {...register('endTime')} type="time" className="input" disabled={busy} />
          {errors.endTime && <p className="mt-1 text-xs text-red-600">{errors.endTime.message}</p>}
        </div>
        <div>
          <label className="label">Max capacity</label>
          <input
            {...register('maxCapacity', { valueAsNumber: true })}
            type="number"
            min={1}
            max={500}
            className="input"
            disabled={busy}
          />
          {errors.maxCapacity && <p className="mt-1 text-xs text-red-600">{errors.maxCapacity.message}</p>}
        </div>
      </div>

      {/* Offered days */}
      <div>
        <label className="label">Days the batch runs</label>
        <div className="flex flex-wrap gap-2">
          {DAY_OPTIONS.map((d) => {
            const active = offeredDays.includes(d.value);
            return (
              <button
                type="button"
                key={d.value}
                onClick={() => toggleDay(d.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition',
                  active
                    ? 'border-brand-primary bg-brand-primary text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                )}
                disabled={busy}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        {errors.offeredDays && (
          <p className="mt-1 text-xs text-red-600">{errors.offeredDays.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-400">
          Students will pick a subset of these days when they enrol.
        </p>
      </div>

      {/* Frequency plans (pricing tiers) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Pricing plans</label>
          <button
            type="button"
            onClick={() => appendPlan({ daysPerWeek: 2, monthlyFeeRupees: 0 })}
            className="btn-ghost text-xs text-brand-primary"
            disabled={busy}
          >
            <Plus size={14} /> Add plan
          </button>
        </div>
        {errors.frequencyPlans && (
          <p className="mb-2 text-xs text-red-600">
            {(errors.frequencyPlans as { message?: string })?.message}
          </p>
        )}
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 px-1 text-xs text-gray-400">
            <span className="col-span-5">Days / week</span>
            <span className="col-span-6">Monthly fee (₹)</span>
          </div>
          {planFields.map((field, idx) => (
            <div key={field.id} className="grid grid-cols-12 items-center gap-2">
              <input
                {...register(`frequencyPlans.${idx}.daysPerWeek` as const, { valueAsNumber: true })}
                type="number"
                min={1}
                max={7}
                className="input col-span-5 py-1.5 text-sm"
                disabled={busy}
              />
              <input
                {...register(`frequencyPlans.${idx}.monthlyFeeRupees` as const, { valueAsNumber: true })}
                type="number"
                min={0}
                step={50}
                className="input col-span-6 py-1.5 text-sm"
                disabled={busy}
              />
              {planFields.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePlan(idx)}
                  className="btn-ghost col-span-1 p-1 text-red-400 hover:text-red-600"
                  disabled={busy}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Example: 2 days/week ₹2000, 3 days/week ₹2800, 5 days/week ₹4000.
        </p>
      </div>

      {/* Time slots — optional sub-groups within the batch window */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <label className="label mb-0">Hour slots (optional)</label>
            <p className="text-xs text-gray-400">
              Split one big window (e.g. 6–9 AM) into separate 1-hour groups.
              Leave empty if the batch is a single undivided session.
            </p>
          </div>
          <button
            type="button"
            onClick={() => appendSlot({ startTime: '', endTime: '', label: '' })}
            className="btn-ghost text-xs text-brand-primary"
            disabled={busy}
          >
            <Plus size={14} /> Add slot
          </button>
        </div>
        {slotFields.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 px-1 text-xs text-gray-400">
              <span className="col-span-3">Start</span>
              <span className="col-span-3">End</span>
              <span className="col-span-5">Label (optional)</span>
            </div>
            {slotFields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 items-center gap-2">
                <input
                  {...register(`timeSlots.${idx}.startTime` as const)}
                  type="time"
                  className="input col-span-3 py-1.5 text-sm"
                  disabled={busy}
                />
                <input
                  {...register(`timeSlots.${idx}.endTime` as const)}
                  type="time"
                  className="input col-span-3 py-1.5 text-sm"
                  disabled={busy}
                />
                <input
                  {...register(`timeSlots.${idx}.label` as const)}
                  className="input col-span-5 py-1.5 text-sm"
                  placeholder="e.g. Junior group"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => removeSlot(idx)}
                  className="btn-ghost col-span-1 p-1 text-red-400 hover:text-red-600"
                  disabled={busy}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Root-level validation errors */}
      {errors.root && (
        <p className="text-xs text-red-600">{errors.root.message}</p>
      )}

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
