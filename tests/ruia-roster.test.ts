/**
 * The Ruia daily roster: who is booked on which day, in which slot.
 *
 * Ported from roster.mjs — but pointed at the REAL module this time. The
 * original reimplemented buildDayRoster and slotLabelForDay inside the script
 * and tested the copy, so it could never have caught a change to the code the
 * coaches actually use. webapp/src/lib/slotRoster.ts is a pure module, so it
 * can be imported directly.
 */
import { describe, it, expect } from 'vitest';
import { buildDayRoster, slotLabelForDay } from '../webapp/src/lib/slotRoster';
import type { SlotBookingDocument } from '@bba/shared';

const b = (id: string, participantName: string, status: string, timeSlot: string, selectedDays: number[]) =>
  ({ id, participantName, status, timeSlot, selectedDays }) as unknown as SlotBookingDocument;

const bookings = [
  b('b1', 'Aarav', 'CONFIRMED', '06:00-07:00', [1, 3, 5]),
  b('b2', 'Isha', 'PENDING_VERIFICATION', '07:00-08:00', [1, 3, 5]),
  b('b3', 'Kabir', 'CONFIRMED', '08:00-09:00', [2, 4]),
  b('b4', 'Diya', 'CANCELLED', '06:00-07:00', [1, 3, 5]),
  b('b5', 'Vivaan', 'CONFIRMED', '07:00-09:00', [6]),
  b('b6', 'Anaya', 'CONFIRMED', '06:00-07:00', []),
];

const shape = (day: number) => buildDayRoster(bookings, day).groups.map(
  (g) => [g.label, g.bookings.map((x) => x.participantName)],
);

describe('buildDayRoster', () => {
  it('Monday groups by the booked band', () => {
    expect(shape(1)).toEqual([['6–7 AM', ['Aarav']], ['7–8 AM', ['Isha']]]);
    expect(buildDayRoster(bookings, 1).total).toBe(2);
  });

  it('Tuesday puts every booking in the 6–7 AM band, whatever band it was bought for', () => {
    expect(shape(2)).toEqual([['6–7 AM', ['Kabir']]]);
  });

  it('Saturday is Games Day', () => {
    expect(shape(6)).toEqual([['Games Day · 7–9 AM', ['Vivaan']]]);
  });

  it('Sunday has nobody', () => {
    expect(buildDayRoster(bookings, 0).total).toBe(0);
  });

  it('never includes a cancelled booking', () => {
    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
      const names = buildDayRoster(bookings, day).groups.flatMap((g) => g.bookings.map((x) => x.participantName));
      expect(names).not.toContain('Diya');
    }
  });

  it('includes a booking still awaiting payment verification', () => {
    expect(shape(1).flatMap(([, n]) => n)).toContain('Isha');
  });

  it('surfaces paid bookings with no days as unassigned rather than dropping them', () => {
    expect(buildDayRoster(bookings, 1).unassigned.map((x) => x.participantName)).toEqual(['Anaya']);
  });
});

describe('slotLabelForDay', () => {
  it('labels the three weekday bands', () => {
    expect(slotLabelForDay(1, '06:00-07:00')).toBe('6–7 AM');
    expect(slotLabelForDay(3, '07:00-08:00')).toBe('7–8 AM');
    expect(slotLabelForDay(5, '08:00-09:00')).toBe('8–9 AM');
  });
});
