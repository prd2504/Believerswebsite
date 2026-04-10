/**
 * Money helpers — everything monetary in the platform is stored as integer paise
 * (1 INR = 100 paise) to avoid floating-point rounding errors over long time horizons
 * (imagine 5 years of monthly fees rounding away 0.0001 each time).
 */

/** Convert rupees (decimal) to paise (integer). Throws if the result overflows Number.MAX_SAFE_INTEGER. */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) {
    throw new Error(`Invalid rupees value: ${rupees}`);
  }
  // Multiply then round to eliminate JS float artifacts (e.g. 19.99 * 100 → 1998.9999..).
  const paise = Math.round(rupees * 100);
  if (!Number.isSafeInteger(paise)) {
    throw new Error(`Rupees value out of safe range: ${rupees}`);
  }
  return paise;
}

/** Convert integer paise back to rupees as a number (may lose precision — prefer formatINR for display). */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Format an integer paise amount as a human-readable INR string, e.g. 150000 → "₹1,500.00".
 * Uses the Indian digit grouping (1,00,000 style) via Intl.
 */
export function formatINR(paise: number, opts: { withDecimals?: boolean } = {}): string {
  const { withDecimals = true } = opts;
  const rupees = paise / 100;
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  });
  return formatter.format(rupees);
}

/**
 * Compute GST components for a given base amount and rate. Returns integer paise values
 * so downstream code never has to re-round.
 */
export function computeGst(
  baseAmountPaise: number,
  gstRatePercent: number,
): { baseAmountPaise: number; gstAmountPaise: number; totalAmountPaise: number } {
  if (!Number.isInteger(baseAmountPaise) || baseAmountPaise < 0) {
    throw new Error(`baseAmountPaise must be a non-negative integer, got ${baseAmountPaise}`);
  }
  if (!Number.isFinite(gstRatePercent) || gstRatePercent < 0) {
    throw new Error(`gstRatePercent must be >= 0, got ${gstRatePercent}`);
  }
  // Compute GST in paise with rounding to nearest integer.
  const gstAmountPaise = Math.round((baseAmountPaise * gstRatePercent) / 100);
  return {
    baseAmountPaise,
    gstAmountPaise,
    totalAmountPaise: baseAmountPaise + gstAmountPaise,
  };
}
