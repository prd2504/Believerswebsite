/**
 * Next month goes on sale on the 25th of this one — the public court page and
 * the Ruia slot window both key off this.
 *
 * Ported from horizon.mjs, audit.mjs and rollout.mjs.
 */
import { describe, it, expect } from 'vitest';
import {
  publicBookingHorizon, endOfMonthDate, computeAutoOpenAt, isBookingWindowOpen,
} from '@bba/shared';

describe('publicBookingHorizon', () => {
  it.each([
    ['2026-08-23', '2026-08-31', 'before the 25th → this month only'],
    ['2026-08-24', '2026-08-31', 'the day before → still this month'],
    ['2026-08-25', '2026-09-30', 'the 25th → next month opens'],
    ['2026-08-31', '2026-09-30', 'end of month → next month'],
    ['2026-09-24', '2026-09-30', '24 Sep → September only'],
    ['2026-09-25', '2026-10-31', '25 Sep → October opens'],
    ['2026-12-25', '2027-01-31', 'year rollover'],
    ['2026-02-25', '2026-03-31', 'Feb 25 → March'],
    ['2026-01-24', '2026-01-31', 'Jan before → Jan'],
  ])('%s → %s (%s)', (date, want) => {
    expect(publicBookingHorizon({ date, time: '12:00' })).toBe(want);
  });

  it('honours a custom release day', () => {
    expect(publicBookingHorizon({ date: '2026-08-20', time: '09:00' }, 20)).toBe('2026-09-30');
  });
});

describe('endOfMonthDate', () => {
  it('handles leap and non-leap Februaries', () => {
    expect(endOfMonthDate('2028-02')).toBe('2028-02-29');
    expect(endOfMonthDate('2026-02')).toBe('2026-02-28');
  });
});

describe('Ruia slot window', () => {
  const opensAt = computeAutoOpenAt('2026-10', 25, '21:30');
  const gate = { isOpen: true, openAt: null, openAtByMonth: { '2026-10': opensAt } };

  it('October opens at 21:30 IST on 25 Sep', () => {
    expect(opensAt).toBe('2026-09-25T21:30:00+05:30');
  });
  it('is closed earlier that day', () => {
    expect(isBookingWindowOpen(gate, new Date('2026-09-25T10:00:00+05:30'), '2026-10')).toBe(false);
  });
  it('is open after 21:30', () => {
    expect(isBookingWindowOpen(gate, new Date('2026-09-25T22:00:00+05:30'), '2026-10')).toBe(true);
  });
  it('does not close the current month', () => {
    expect(isBookingWindowOpen(gate, new Date('2026-09-25T10:00:00+05:30'), '2026-09')).toBe(true);
  });
});
