/**
 * Which Ruia batch a slot booking becomes an enrolment in.
 *
 * Ported from resolve.mjs and audit.mjs, against the four batches as they
 * existed when this was written — including the Tue/Thu batch at its (wrong)
 * 16:00 start, since resolution keys on days and plans, not start time.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveBookingBatchIds, bookingDaysForBatch, slotStartTime, TUE_THU_SLOT,
  type BatchLike,
} from '@bba/shared';

const batches: BatchLike[] = [
  { id: 'two', centreId: 'RUI', status: 'ACTIVE', offeredDays: [1, 2, 3, 4, 5], startTime: '06:00',
    frequencyPlans: [{ daysPerWeek: 2, monthlyFeePaise: 300000 }] },
  { id: 'three', centreId: 'RUI', status: 'ACTIVE', offeredDays: [1, 3, 5], startTime: '06:00',
    frequencyPlans: [{ daysPerWeek: 3, monthlyFeePaise: 400000 }] },
  { id: 'games', centreId: 'RUI', status: 'ACTIVE', offeredDays: [6], startTime: '07:00',
    frequencyPlans: [{ daysPerWeek: 1, monthlyFeePaise: 150000 }] },
  { id: 'tuethu', centreId: 'RUI', status: 'ACTIVE', offeredDays: [2, 4], startTime: '16:00',
    frequencyPlans: [{ daysPerWeek: 2, monthlyFeePaise: 300000 }] },
];

describe('resolveBookingBatchIds', () => {
  it.each([
    ['TWO_DAY Mon+Wed 7–8am', { planType: 'TWO_DAY', timeSlot: '07:00-08:00', selectedDays: [1, 3] }, ['two']],
    ['TWO_DAY Tue+Thu band', { planType: 'TWO_DAY', timeSlot: TUE_THU_SLOT, selectedDays: [2, 4] }, ['tuethu']],
    ['THREE_DAY MWF 6–7am', { planType: 'THREE_DAY', timeSlot: '06:00-07:00', selectedDays: [1, 3, 5] }, ['three']],
    ['GAMES_DAY Saturday', { planType: 'GAMES_DAY', timeSlot: '07:00-09:00', selectedDays: [6] }, ['games']],
    ['GAMES_DAY with no days set', { planType: 'GAMES_DAY', timeSlot: '07:00-09:00', selectedDays: [] }, ['games']],
    ['COMPLETE_BUNDLE → two batches', { planType: 'COMPLETE_BUNDLE', timeSlot: '06:00-07:00', selectedDays: [1, 3, 5, 6] }, ['games', 'three']],
    ['FOUR_DAY → no batch (reported, not guessed)', { planType: 'FOUR_DAY', timeSlot: '06:00-07:00', selectedDays: [1, 2, 3, 4] }, []],
  ])('%s', (_name, booking, want) => {
    expect(resolveBookingBatchIds(booking, batches).sort()).toEqual([...want].sort());
  });

  it('an explicit slotPlanTypes declaration overrides the heuristic', () => {
    const declared = batches.map((b) => (b.id === 'tuethu' ? { ...b, slotPlanTypes: ['FOUR_DAY'] } : b));
    expect(resolveBookingBatchIds({ planType: 'FOUR_DAY', timeSlot: '06:00-07:00', selectedDays: [1, 2, 3, 4] }, declared))
      .toEqual(['tuethu']);
  });

  it('never matches an inactive batch', () => {
    const inactive = batches.map((b) => (b.id === 'games' ? { ...b, status: 'INACTIVE' } : b));
    expect(resolveBookingBatchIds({ planType: 'GAMES_DAY', timeSlot: '07:00-09:00', selectedDays: [6] }, inactive))
      .toEqual([]);
  });
});

describe('bookingDaysForBatch — a Complete Bundle is split between two batches', () => {
  const bundle = { planType: 'COMPLETE_BUNDLE', timeSlot: '06:00-07:00', selectedDays: [1, 3, 5, 6] };
  it('the weekday batch gets Mon/Wed/Fri, not Saturday', () => {
    expect(bookingDaysForBatch(bundle, batches[1])).toEqual([1, 3, 5]);
  });
  it('the Games Day batch gets Saturday only', () => {
    expect(bookingDaysForBatch(bundle, batches[2])).toEqual([6]);
  });
});

describe('slotStartTime', () => {
  it('reads the start of a band, including the Tue/Thu variant', () => {
    expect(slotStartTime('06:00-07:00')).toBe('06:00');
    expect(slotStartTime(TUE_THU_SLOT)).toBe('06:00');
    expect(slotStartTime('07:00-09:00')).toBe('07:00');
  });
});
