/**
 * Zod schemas for Centre forms. Used by react-hook-form for client-side validation.
 * Mirrors the CentreDocument type from @bba/shared.
 */

import { z } from 'zod';

const operatingHoursSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  openTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
  closed: z.boolean(),
});

export const centreFormSchema = z.object({
  name: z.string().min(2, 'Centre name must be at least 2 characters').max(100),
  address: z.string().min(5, 'Address is required'),
  city: z.string().min(2, 'City is required'),
  pincode: z.string().regex(/^\d{6}$/, 'Must be a 6-digit Indian pincode'),
  googleMapsUrl: z.string().url('Must be a valid URL').nullable().or(z.literal('')),
  courtCount: z.number().min(1, 'At least 1 court required').max(50),
  sportTypes: z.array(z.string()).min(1, 'Select at least one sport'),
  operatingHours: z.array(operatingHoursSchema).length(7, 'Must have hours for all 7 days'),
  gstRatePercent: z.number().min(0).max(100),
  active: z.boolean(),
  contactPhone: z.string().nullable().or(z.literal('')),
  contactEmail: z.string().email('Invalid email').nullable().or(z.literal('')),
});

export type CentreFormValues = z.infer<typeof centreFormSchema>;

/** Default operating hours — Mon-Sat 6am-10pm, Sunday closed. */
export function defaultOperatingHours() {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    openTime: '06:00',
    closeTime: '22:00',
    closed: i === 0, // Sunday closed by default
  }));
}

export function defaultCentreFormValues(): CentreFormValues {
  return {
    name: '',
    address: '',
    city: 'Mumbai',
    pincode: '',
    googleMapsUrl: '',
    courtCount: 2,
    sportTypes: ['BADMINTON'],
    operatingHours: defaultOperatingHours(),
    gstRatePercent: 18,
    active: true,
    contactPhone: '',
    contactEmail: '',
  };
}
