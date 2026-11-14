/**
 * Canonical phone form used for ALL student-identity matching (registration,
 * payment lookup, Player_Directory sync). Reducing every number to the same
 * 10-digit shape is what stops "same person, +91 vs no prefix vs a stray space"
 * from being treated as two different students.
 *
 *   "+91 98765 43210" → "9876543210"
 *   "09876543210"     → "9876543210"
 *   "919876543210"    → "9876543210"
 */
export function canonicalPhone(s: string | null | undefined): string {
  const d = (s ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d;
}

/** Normalised name for matching: lowercased, single-spaced, trimmed. */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
