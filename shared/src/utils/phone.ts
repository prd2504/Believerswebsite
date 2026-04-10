/**
 * Phone number normalisation and validation. India-first: every number is stored in
 * E.164 format starting with +91 followed by exactly 10 digits.
 *
 * These helpers are used on both the signup form (frontend) and the admin invite
 * function (backend), so they live in /shared with zero runtime dependencies.
 */

/** The E.164 regex for Indian mobile numbers: +91 followed by 10 digits 6-9 starting. */
const INDIAN_E164 = /^\+91[6-9]\d{9}$/;

/**
 * Normalise any user-entered phone string to E.164 format for India.
 *
 * Accepts inputs like:
 *   - "9876543210"
 *   - "+91 98765 43210"
 *   - "09876543210"
 *   - "91-98765-43210"
 *
 * Returns null if the input cannot be parsed into a valid 10-digit Indian mobile number.
 */
export function normaliseIndianPhone(raw: string): string | null {
  if (!raw) return null;

  // Strip every non-digit. We'll rebuild from the digits alone.
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return null;

  let tenDigits: string;

  if (digits.length === 10) {
    tenDigits = digits;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    // Legacy leading 0
    tenDigits = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    tenDigits = digits.slice(2);
  } else if (digits.length === 13 && digits.startsWith('091')) {
    tenDigits = digits.slice(3);
  } else {
    return null;
  }

  // Indian mobile numbers start with 6, 7, 8, or 9.
  if (!/^[6-9]\d{9}$/.test(tenDigits)) return null;

  return `+91${tenDigits}`;
}

/** True if `value` is already a valid E.164 Indian mobile number. */
export function isValidIndianPhone(value: string | null | undefined): boolean {
  if (!value) return false;
  return INDIAN_E164.test(value);
}

/**
 * Format an E.164 Indian number for display, e.g. "+919876543210" → "+91 98765 43210".
 * Returns the original string unchanged if it is not a valid E.164 Indian number.
 */
export function formatIndianPhoneForDisplay(value: string | null | undefined): string {
  if (!value || !isValidIndianPhone(value)) return value ?? '';
  const digits = value.slice(3); // drop +91
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}
