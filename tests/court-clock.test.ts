/**
 * The court clock: an hour stops being sellable the moment it starts, judged in
 * IST regardless of the device's timezone.
 *
 * Ported from clock.mjs and audit.mjs. clock.mjs printed values beside
 * "(expect …)" notes for a human to read; each note is now an assertion.
 */
import { describe, it, expect } from 'vitest';
import {
  istNow, isHourPast, buildDayAvailability, DEFAULT_COURT_CONFIG,
  bookableDatesInMonth, nextMonth, datesInMonth,
} from '@bba/shared';

const cfg = { ...DEFAULT_COURT_CONFIG, centreId: 'DAD', updatedAt: '', updatedBy: null };

describe('istNow', () => {
  it('converts a UTC instant to Asia/Kolkata wall time', () => {
    expect(istNow(new Date('2026-08-23T04:00:00Z'))).toEqual({ date: '2026-08-23', time: '09:30' });
  });
  it('rolls the date at IST midnight, not UTC midnight', () => {
    expect(istNow(new Date('2026-08-22T18:30:00Z'))).toEqual({ date: '2026-08-23', time: '00:00' });
  });
  it('matches the audit instant', () => {
    expect(istNow(new Date('2026-09-13T04:30:00Z'))).toEqual({ date: '2026-09-13', time: '10:00' });
  });
});

describe('isHourPast — an hour is spent the moment it begins', () => {
  const now = { date: '2026-08-23', time: '09:30' };
  it('an hour that started 30 minutes ago is past', () => {
    expect(isHourPast('2026-08-23', '09:00', now)).toBe(true);
  });
  it('the next hour is still sellable', () => {
    expect(isHourPast('2026-08-23', '10:00', now)).toBe(false);
  });
  it('any hour yesterday is past', () => {
    expect(isHourPast('2026-08-22', '16:00', now)).toBe(true);
  });
  it('any hour tomorrow is not', () => {
    expect(isHourPast('2026-08-24', '09:00', now)).toBe(false);
  });
  it('an hour starting exactly now is past', () => {
    const ten = { date: '2026-09-13', time: '10:00' };
    expect(isHourPast('2026-09-13', '10:00', ten)).toBe(true);
    expect(isHourPast('2026-09-13', '11:00', ten)).toBe(false);
  });
});

describe('buildDayAvailability', () => {
  const now = { date: '2026-08-23', time: '09:30' }; // Sunday

  it('marks elapsed hours PAST on the public view', () => {
    const slots = buildDayAvailability(cfg, '2026-08-23', [], now);
    expect(slots.map((s) => [s.hour, s.state])).toEqual([
      ['09:00', 'PAST'],
      ['10:00', 'AVAILABLE'],
      ['15:00', 'CLOSED'],     // Sunday 3–4 PM ships closed by default
      ['16:00', 'AVAILABLE'],
    ]);
  });

  it('never marks anything PAST on the admin view (no clock passed)', () => {
    const slots = buildDayAvailability(cfg, '2026-08-23', []);
    expect(slots.filter((s) => s.state === 'PAST')).toHaveLength(0);
  });

  /**
   * The guard only matters when a sellable window OVERLAPS coaching — e.g. an
   * admin widening Sunday morning to 10:00–13:00 while coaching runs 11–15.
   *
   * The version of this check run during the session overrode 12:00 on a day
   * whose windows never contain 12:00, so the hour was never generated and the
   * guard was never reached. It passed with the guard deleted. This one builds
   * the overlap the guard exists for.
   */
  it('a coaching hour inside a sellable window is never sold — not even via an override', () => {
    const overlapping = {
      ...cfg,
      windows: { ...cfg.windows, 0: [{ start: '10:00', end: '13:00', open: true }] },
      coachingWindows: { ...cfg.coachingWindows, 0: [{ start: '11:00', end: '15:00' }] },
      dateOverrides: { '2026-09-13': { '12:00': true } },   // an admin trying to open it
    };
    const slots = buildDayAvailability(overlapping, '2026-09-13', [], { date: '2026-09-13', time: '08:00' });
    expect(slots.map((s) => [s.hour, s.state])).toEqual([
      ['10:00', 'AVAILABLE'],
      ['11:00', 'COACHING'],
      ['12:00', 'COACHING'],   // the override does not win
    ]);
  });
});

describe('month navigation', () => {
  it('lists only dates with an hour still sellable', () => {
    const now = { date: '2026-08-23', time: '09:30' };
    expect(bookableDatesInMonth(cfg, '2026-08', now)).toEqual(['2026-08-23', '2026-08-29', '2026-08-30']);
    expect(bookableDatesInMonth(cfg, '2026-09', now)).toHaveLength(8);
  });

  it('drops a month whose weekends are all gone', () => {
    // From admin-grid.mjs: on the 31st, August has nothing left to sell.
    expect(bookableDatesInMonth(cfg, '2026-08', { date: '2026-08-31', time: '10:00' })).toHaveLength(0);
    expect(bookableDatesInMonth(cfg, '2026-08', { date: '2026-08-23', time: '14:00' }).length).toBeGreaterThan(0);
  });

  it('every weekend date in September has slots', () => {
    const withSlots = datesInMonth('2026-09')
      .filter((d) => buildDayAvailability(cfg, d, []).length > 0)
      .map((d) => d.slice(8));
    expect(withSlots).toEqual(['05', '06', '12', '13', '19', '20', '26', '27']);
  });

  it('rolls the year', () => {
    expect(nextMonth('2026-12')).toBe('2027-01');
  });

  it('knows 2026 is not a leap year', () => {
    expect(datesInMonth('2026-02')).toHaveLength(28);
  });
});
