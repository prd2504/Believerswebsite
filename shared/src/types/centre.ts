/**
 * Centre — a physical coaching location. Lives at /centres/{centreId}.
 *
 * Centres are created dynamically by admins. No centre name, address, or timing is
 * hardcoded anywhere in the codebase; everything flows from this document.
 */

import type { BaseDocument } from './common.js';

export const SportType = {
  BADMINTON: 'BADMINTON',
  TENNIS: 'TENNIS',
  CRICKET: 'CRICKET',
  FOOTBALL: 'FOOTBALL',
  PICKLEBALL: 'PICKLEBALL',
  TABLE_TENNIS: 'TABLE_TENNIS',
} as const;
export type SportType = (typeof SportType)[keyof typeof SportType];

/** A single day-of-week operating window for the centre. */
export interface OperatingHours {
  /** 0 = Sunday, 1 = Monday, … 6 = Saturday (matches JavaScript Date.getDay()). */
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** "HH:mm" in 24-hour IST, e.g. "06:00". */
  openTime: string;
  /** "HH:mm" in 24-hour IST, e.g. "22:00". */
  closeTime: string;
  /** Whether the centre is closed this day (overrides the times). */
  closed: boolean;
}

export interface CentreDocument extends BaseDocument {
  id: string;

  /** Display name, e.g. "Believers Badminton Academy — Andheri". Entirely admin-defined. */
  name: string;
  /** Free-text street address. */
  address: string;
  /** City — used for filtering the admin dashboard. */
  city: string;
  /** Pincode (6 digits for India). */
  pincode: string;

  /** Optional Google Maps share link. Displayed as a "Get Directions" button. */
  googleMapsUrl: string | null;

  /** Geographic coordinates (optional) for future map-based UIs. */
  geo: { lat: number; lng: number } | null;

  /** Number of physical courts at this centre. Drives capacity checks. */
  courtCount: number;

  /** Sports offered at this centre. Must include at least one. */
  sportTypes: SportType[];

  /** Weekly operating hours, one entry per day of the week. Length must be 7. */
  operatingHours: OperatingHours[];

  /** GST rate to apply to coaching fees at this centre. Configurable per centre. */
  gstRatePercent: number;

  /** Whether this centre is accepting new enrolments. Paused centres are read-only. */
  active: boolean;

  /** Contact phone displayed on the public centre page. E.164 format. */
  contactPhone: string | null;
  /** Contact email for bookings. */
  contactEmail: string | null;
}
