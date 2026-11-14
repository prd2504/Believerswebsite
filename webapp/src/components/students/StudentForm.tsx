import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  studentFormSchema,
  type StudentFormValues,
  defaultStudentFormValues,
} from '@/lib/schemas/studentSchema';
import { BatchLevel } from '@bba/shared';
import type { CentreDocument } from '@bba/shared';

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
};

interface StudentFormProps {
  centres: CentreDocument[];
  initialValues?: Partial<StudentFormValues>;
  onSubmit: (values: StudentFormValues) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

export function StudentForm({ centres, initialValues, onSubmit, onCancel, busy }: StudentFormProps) {
  const defaults = { ...defaultStudentFormValues(centres[0]?.id), ...initialValues };
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: defaults,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="label">Full name</label>
        <input
          {...register('name')}
          className="input"
          placeholder="Student full name"
          disabled={busy}
        />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      <div>
        <label className="label">Mobile number</label>
        <input
          {...register('phone')}
          className="input"
          placeholder="+91 98765 43210"
          inputMode="tel"
          disabled={busy}
        />
        {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
      </div>

      <div>
        <label className="label">Email <span className="text-gray-400">(optional — used for invoices)</span></label>
        <input
          {...register('email')}
          type="email"
          className="input"
          placeholder="email@example.com"
          disabled={busy}
        />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>

      <div>
        <label className="label">Level</label>
        <select {...register('level')} className="input" disabled={busy}>
          {Object.values(BatchLevel).map((l) => (
            <option key={l} value={l}>{LEVEL_LABELS[l] ?? l}</option>
          ))}
        </select>
      </div>

      {centres.length > 1 && (
        <div>
          <label className="label">Centre</label>
          <select {...register('primaryCentreId')} className="input" disabled={busy}>
            <option value="">Select a centre</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.primaryCentreId && (
            <p className="mt-1 text-xs text-red-600">{errors.primaryCentreId.message}</p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : initialValues ? 'Update Student' : 'Add Student'}
        </button>
      </div>
    </form>
  );
}
