/**
 * Student create/edit form. Uses react-hook-form + zod.
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  studentFormSchema,
  type StudentFormValues,
  defaultStudentFormValues,
} from '@/lib/schemas/studentSchema';
import { BloodGroup, StudentStatus, BatchLevel } from '@bba/shared';
import type { CentreDocument, BatchDocument } from '@bba/shared';

const GENDER_OPTIONS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'UNDISCLOSED', label: 'Prefer not to say' },
];

interface StudentFormProps {
  centres: CentreDocument[];
  batches: BatchDocument[];
  initialValues?: Partial<StudentFormValues>;
  onSubmit: (values: StudentFormValues) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

export function StudentForm({ centres, batches, initialValues, onSubmit, onCancel, busy }: StudentFormProps) {
  const defaults = { ...defaultStudentFormValues(centres[0]?.id), ...initialValues };
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: defaults,
  });

  const selectedCentreId = watch('primaryCentreId');
  const selectedBatchIds = watch('batchIds') ?? [];

  // Filter batches to show only those from the selected centre
  const centreBatches = batches.filter((b) => b.centreId === selectedCentreId);

  function toggleBatch(batchId: string) {
    if (selectedBatchIds.includes(batchId)) {
      setValue('batchIds', selectedBatchIds.filter((id) => id !== batchId));
    } else {
      setValue('batchIds', [...selectedBatchIds, batchId]);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* ── Personal info ── */}
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-brand-secondary">Personal Information</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Full name</label>
            <input {...register('name')} className="input" placeholder="Student full name" disabled={busy} />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div>
            <label className="label">Date of birth</label>
            <input {...register('dateOfBirth')} type="date" className="input" disabled={busy} />
            {errors.dateOfBirth && <p className="mt-1 text-xs text-red-600">{errors.dateOfBirth.message}</p>}
          </div>
          <div>
            <label className="label">Gender</label>
            <select {...register('gender')} className="input" disabled={busy}>
              {GENDER_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Blood group</label>
            <select {...register('bloodGroup')} className="input" disabled={busy}>
              {Object.values(BloodGroup).map((bg) => (
                <option key={bg} value={bg}>{bg}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Medical notes (optional)</label>
            <input {...register('medicalNotes')} className="input" placeholder="Asthma, allergies, etc." disabled={busy} />
          </div>
        </div>
      </fieldset>

      {/* ── Guardian & contact ── */}
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-brand-secondary">Guardian & Contact</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Guardian name</label>
            <input {...register('guardianName')} className="input" placeholder="Parent / guardian name" disabled={busy} />
            {errors.guardianName && <p className="mt-1 text-xs text-red-600">{errors.guardianName.message}</p>}
          </div>
          <div>
            <label className="label">Phone</label>
            <input {...register('phone')} className="input" placeholder="+91 98765 43210" disabled={busy} />
            {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
          </div>
          <div>
            <label className="label">Email (optional)</label>
            <input {...register('email')} type="email" className="input" placeholder="email@example.com" disabled={busy} />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>
        </div>
      </fieldset>

      {/* ── Address ── */}
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-brand-secondary">Address</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <input {...register('address')} className="input" placeholder="Street address" disabled={busy} />
            {errors.address && <p className="mt-1 text-xs text-red-600">{errors.address.message}</p>}
          </div>
          <div>
            <label className="label">City</label>
            <input {...register('city')} className="input" placeholder="Mumbai" disabled={busy} />
            {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city.message}</p>}
          </div>
          <div>
            <label className="label">Pincode</label>
            <input {...register('pincode')} className="input" placeholder="400053" maxLength={6} disabled={busy} />
            {errors.pincode && <p className="mt-1 text-xs text-red-600">{errors.pincode.message}</p>}
          </div>
        </div>
      </fieldset>

      {/* ── Emergency contact ── */}
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-brand-secondary">Emergency Contact</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Name</label>
            <input {...register('emergencyContact.name')} className="input" placeholder="Emergency contact name" disabled={busy} />
            {errors.emergencyContact?.name && <p className="mt-1 text-xs text-red-600">{errors.emergencyContact.name.message}</p>}
          </div>
          <div>
            <label className="label">Relationship</label>
            <input {...register('emergencyContact.relationship')} className="input" placeholder="Father, Mother, etc." disabled={busy} />
            {errors.emergencyContact?.relationship && <p className="mt-1 text-xs text-red-600">{errors.emergencyContact.relationship.message}</p>}
          </div>
          <div>
            <label className="label">Phone</label>
            <input {...register('emergencyContact.phone')} className="input" placeholder="+91 98765 43210" disabled={busy} />
            {errors.emergencyContact?.phone && <p className="mt-1 text-xs text-red-600">{errors.emergencyContact.phone.message}</p>}
          </div>
        </div>
      </fieldset>

      {/* ── Academy details ── */}
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-brand-secondary">Academy Details</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Centre</label>
            <select {...register('primaryCentreId')} className="input" disabled={busy}>
              <option value="">Select a centre</option>
              {centres.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.primaryCentreId && <p className="mt-1 text-xs text-red-600">{errors.primaryCentreId.message}</p>}
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
              {Object.values(StudentStatus).map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Joined date</label>
            <input {...register('joinedDate')} type="date" className="input" disabled={busy} />
            {errors.joinedDate && <p className="mt-1 text-xs text-red-600">{errors.joinedDate.message}</p>}
          </div>
        </div>

        {/* Batch selector */}
        <div className="mt-4">
          <label className="label">Batches</label>
          {centreBatches.length === 0 ? (
            <p className="text-xs text-gray-400">
              {selectedCentreId ? 'No batches at this centre yet.' : 'Select a centre first.'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {centreBatches.map((batch) => (
                <button
                  key={batch.id}
                  type="button"
                  onClick={() => toggleBatch(batch.id)}
                  disabled={busy}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedBatchIds.includes(batch.id)
                      ? 'border-brand-primary bg-brand-primary-light text-brand-primary'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {batch.name}
                </button>
              ))}
            </div>
          )}
          {errors.batchIds && <p className="mt-1 text-xs text-red-600">{errors.batchIds.message}</p>}
        </div>
      </fieldset>

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : initialValues ? 'Update Student' : 'Create Student'}
        </button>
      </div>
    </form>
  );
}
