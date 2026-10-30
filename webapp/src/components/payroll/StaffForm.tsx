import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  staffFormSchema,
  type StaffFormValues,
  defaultStaffFormValues,
} from '@/lib/schemas/payrollSchema';
import type { CentreDocument, UserDocument } from '@bba/shared';
import { cn } from '@/lib/cn';

interface StaffFormProps {
  centres: CentreDocument[];
  coachUsers: UserDocument[];
  initialValues?: Partial<StaffFormValues>;
  initialAuthUid?: string | null;
  onSubmit: (values: StaffFormValues, authUid: string | null) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

export function StaffForm({
  centres,
  coachUsers,
  initialValues,
  initialAuthUid,
  onSubmit,
  onCancel,
  busy,
}: StaffFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: { ...defaultStaffFormValues(), ...initialValues },
  });

  const selectedCentres = watch('centreIds');
  const employmentType = watch('employmentType');

  const [authUid, setAuthUid] = useState(initialAuthUid ?? '');

  function toggleCentre(id: string) {
    const next = selectedCentres.includes(id)
      ? selectedCentres.filter((c) => c !== id)
      : [...selectedCentres, id];
    setValue('centreIds', next, { shouldValidate: true });
  }

  function handleCoachSelect(uid: string) {
    setAuthUid(uid);
    if (uid) {
      const coach = coachUsers.find((c) => c.id === uid);
      if (coach) {
        const name = watch('name');
        if (!name) setValue('name', coach.name);
        if (!watch('phone')) setValue('phone', coach.phone ?? '');
        if (!watch('email')) setValue('email', coach.email ?? '');
        if (selectedCentres.length === 0 && coach.centreIds.length > 0) {
          setValue('centreIds', coach.centreIds, { shouldValidate: true });
        }
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit(
        (vals) => onSubmit(vals, authUid || null),
        () => toast.error('Please fix the highlighted fields.'),
      )}
      className="space-y-5"
    >
      {/* Link to coach account */}
      <div>
        <label className="label">Link to Coach Account (optional)</label>
        <select
          value={authUid}
          onChange={(e) => handleCoachSelect(e.target.value)}
          className="input"
          disabled={busy}
        >
          <option value="">No linked account</option>
          {coachUsers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.email ?? c.phone ?? c.id.slice(0, 8)})
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-400">
          Linking lets the coach view their salary slips in the app.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Staff Code</label>
          <input {...register('staffCode')} className="input" placeholder="BBA-COACH-001" disabled={busy} />
          {errors.staffCode && <p className="mt-1 text-xs text-red-600">{errors.staffCode.message}</p>}
        </div>
        <div>
          <label className="label">Full Name</label>
          <input {...register('name')} className="input" placeholder="Coach name" disabled={busy} />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Phone</label>
          <input {...register('phone')} className="input" placeholder="+91 98765 43210" disabled={busy} />
        </div>
        <div>
          <label className="label">Email</label>
          <input {...register('email')} className="input" placeholder="coach@email.com" disabled={busy} />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>
      </div>

      <div>
        <label className="label">Centres</label>
        <div className="flex flex-wrap gap-2">
          {centres.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCentre(c.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition',
                selectedCentres.includes(c.id)
                  ? 'border-brand-primary bg-brand-primary text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
              )}
              disabled={busy}
            >
              {c.name}
            </button>
          ))}
        </div>
        {errors.centreIds && <p className="mt-1 text-xs text-red-600">{errors.centreIds.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Employment Type</label>
          <select {...register('employmentType')} className="input" disabled={busy}>
            <option value="SALARIED">Salaried</option>
            <option value="PER_SESSION">Per Session</option>
          </select>
        </div>
        <div>
          <label className="label">
            {employmentType === 'SALARIED' ? 'Monthly Basic (₹)' : 'Rate per Session (₹)'}
          </label>
          <input
            {...register('rateRupees', { valueAsNumber: true })}
            type="number"
            min={0}
            step={100}
            className="input"
            disabled={busy}
          />
          {errors.rateRupees && <p className="mt-1 text-xs text-red-600">{errors.rateRupees.message}</p>}
        </div>
        <div>
          <label className="label">Date of Joining</label>
          <input {...register('dateOfJoining')} type="date" className="input" disabled={busy} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Bank A/C Last 4 Digits</label>
          <input {...register('bankAccountLast4')} className="input" maxLength={4} placeholder="1234" disabled={busy} />
        </div>
        <div>
          <label className="label">UPI ID</label>
          <input {...register('upiId')} className="input" placeholder="coach@upi" disabled={busy} />
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : initialValues ? 'Update Staff' : 'Add Staff'}
        </button>
      </div>
    </form>
  );
}
