/**
 * Centre create/edit form. Uses react-hook-form + zod validation.
 * Rendered inside a modal/drawer by the parent page.
 */

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  centreFormSchema,
  type CentreFormValues,
  defaultCentreFormValues,
} from '@/lib/schemas/centreSchema';
import { SportType } from '@bba/shared';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ALL_SPORTS = Object.values(SportType);

interface CentreFormProps {
  initialValues?: Partial<CentreFormValues>;
  onSubmit: (values: CentreFormValues) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

export function CentreForm({ initialValues, onSubmit, onCancel, busy }: CentreFormProps) {
  const defaults = { ...defaultCentreFormValues(), ...initialValues };
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CentreFormValues>({
    resolver: zodResolver(centreFormSchema),
    defaultValues: defaults,
  });

  const { fields: hoursFields } = useFieldArray({ control, name: 'operatingHours' });
  const selectedSports = watch('sportTypes');

  function toggleSport(sport: string) {
    const current = selectedSports ?? [];
    if (current.includes(sport)) {
      if (current.length > 1) {
        setValue('sportTypes', current.filter((s) => s !== sport));
      }
    } else {
      setValue('sportTypes', [...current, sport]);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Basic info */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Centre name</label>
          <input {...register('name')} className="input" placeholder="Believers Badminton Academy — Andheri" disabled={busy} />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
        </div>
        <div className="sm:col-span-2">
          <label className="label">Address</label>
          <input {...register('address')} className="input" placeholder="123, ABC Road, Andheri West" disabled={busy} />
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

      {/* Google Maps & courts */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Google Maps link (optional)</label>
          <input {...register('googleMapsUrl')} className="input" placeholder="https://maps.google.com/..." disabled={busy} />
        </div>
        <div>
          <label className="label">Number of courts</label>
          <input {...register('courtCount', { valueAsNumber: true })} type="number" min={1} max={50} className="input" disabled={busy} />
          {errors.courtCount && <p className="mt-1 text-xs text-red-600">{errors.courtCount.message}</p>}
        </div>
      </div>

      {/* Sports selector */}
      <div>
        <label className="label">Sports offered</label>
        <div className="flex flex-wrap gap-2">
          {ALL_SPORTS.map((sport) => (
            <button
              key={sport}
              type="button"
              onClick={() => toggleSport(sport)}
              disabled={busy}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedSports?.includes(sport)
                  ? 'border-brand-primary bg-brand-primary-light text-brand-primary'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {sport.replace('_', ' ')}
            </button>
          ))}
        </div>
        {errors.sportTypes && <p className="mt-1 text-xs text-red-600">{errors.sportTypes.message}</p>}
      </div>

      {/* Operating hours */}
      <div>
        <label className="label">Operating hours</label>
        <div className="space-y-2">
          {hoursFields.map((field, idx) => (
            <div key={field.id} className="flex items-center gap-2 text-sm">
              <span className="w-24 text-gray-600">{DAY_LABELS[idx]}</span>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  {...register(`operatingHours.${idx}.closed` as const)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
                  disabled={busy}
                />
                <span className="text-xs text-gray-500">Closed</span>
              </label>
              {!watch(`operatingHours.${idx}.closed`) && (
                <>
                  <input
                    {...register(`operatingHours.${idx}.openTime` as const)}
                    type="time"
                    className="input w-28 py-1.5 text-xs"
                    disabled={busy}
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    {...register(`operatingHours.${idx}.closeTime` as const)}
                    type="time"
                    className="input w-28 py-1.5 text-xs"
                    disabled={busy}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* GST & contact */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">GST rate (%)</label>
          <input {...register('gstRatePercent', { valueAsNumber: true })} type="number" min={0} max={100} className="input" disabled={busy} />
        </div>
        <div>
          <label className="label">Contact phone (optional)</label>
          <input {...register('contactPhone')} className="input" placeholder="+91 98765 43210" disabled={busy} />
        </div>
        <div>
          <label className="label">Contact email (optional)</label>
          <input {...register('contactEmail')} className="input" placeholder="centre@bba.in" disabled={busy} />
        </div>
      </div>

      {/* Active toggle */}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          {...register('active')}
          className="h-4 w-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
          disabled={busy}
        />
        <span className="text-sm text-gray-700">Centre is active (accepting enrolments)</span>
      </label>

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : initialValues ? 'Update Centre' : 'Create Centre'}
        </button>
      </div>
    </form>
  );
}
