/**
 * What a court booking costs: hours × rate, plus extras, plus ₹100 per player
 * over the included four — per booking, not per hour.
 *
 * Ported from audit.mjs and fmt.mjs.
 *
 * One original assertion was wrong and is corrected here, not preserved: it
 * expected ₹2100 for 2h / 6 players / 1 shuttle by multiplying the ₹800 rate
 * as ₹900. The code was right (₹1900); the test's arithmetic was not.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COURT_CONFIG, addOnsTotalPaise, guestFeePaise, describeAddOns,
  INCLUDED_PLAYERS, GUEST_FEE_PAISE, formatHourRange,
} from '@bba/shared';

const total = (hours: number, players: number, addOns: Record<string, number>) =>
  DEFAULT_COURT_CONFIG.hourlyRatePaise * hours + addOnsTotalPaise(addOns) + guestFeePaise(players);

describe('court booking total', () => {
  it('1 hour, 4 players, nothing extra = ₹800', () => {
    expect(total(1, 4, {})).toBe(80_000);
  });
  it('2h / 6 players / 1 shuttle = ₹1600 + ₹100 + ₹200 = ₹1900', () => {
    expect(total(2, 6, { SHUTTLE: 1 })).toBe(190_000);
  });
});

describe('guest fees', () => {
  it('four players are included', () => {
    expect(INCLUDED_PLAYERS).toBe(4);
    expect(guestFeePaise(4)).toBe(0);
    expect(guestFeePaise(3)).toBe(0);
  });
  it('₹100 per player beyond four', () => {
    expect(GUEST_FEE_PAISE).toBe(10_000);
    expect(guestFeePaise(5)).toBe(10_000);
    expect(guestFeePaise(6)).toBe(20_000);
  });
  it('is charged per booking, not per hour', () => {
    // 2h with 6 players carries ₹200 of guest fees, not ₹400.
    expect(total(2, 6, {}) - DEFAULT_COURT_CONFIG.hourlyRatePaise * 2).toBe(20_000);
  });
  it('nonsense player counts cost nothing', () => {
    expect(guestFeePaise(0)).toBe(0);
    expect(guestFeePaise(-3)).toBe(0);
    expect(guestFeePaise(null)).toBe(0);
    expect(guestFeePaise(undefined)).toBe(0);
  });
});

describe('describeAddOns', () => {
  it('lists quantities in the fixed catalogue order', () => {
    expect(describeAddOns({ SHUTTLE: 2, RACQUET: 1 })).toBe('2 × Mavis 350 shuttle, 1 × Extra racquet');
  });
  it('is empty for no extras', () => {
    expect(describeAddOns({})).toBe('');
    expect(describeAddOns(undefined)).toBe('');
  });
});

describe('formatHourRange', () => {
  it('prints the meridiem once when both ends share it', () => {
    expect(formatHourRange('09:00', 1)).toBe('9 – 10 AM');
    expect(formatHourRange('09:00', 2)).toBe('9 – 11 AM');
    expect(formatHourRange('15:00', 2)).toBe('3 – 5 PM');
  });
  it('prints both meridiems when the range crosses one', () => {
    expect(formatHourRange('11:00', 1)).toBe('11 AM – 12 PM');
    expect(formatHourRange('23:00', 1)).toBe('11 PM – 12 AM');
  });
  it('treats noon as PM', () => {
    expect(formatHourRange('12:00', 1)).toBe('12 – 1 PM');
  });
});
