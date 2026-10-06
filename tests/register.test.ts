/**
 * Who is expected on a register, and whether it was taken on time.
 */
import { describe, it, expect } from 'vitest';
import {
  registerFeeState, isExpectedOnRegister, feeStandingFromPayments,
  registerStatus, batchEndTime, istWallClockMs,
} from '@bba/shared';

describe('feeStandingFromPayments', () => {
  it('expands quarterly coverage and ignores unpaid, refunded and waived payments', () => {
    const out = feeStandingFromPayments([
      { month: '2026-08', status: 'PAID' },
      { month: '2026-09', status: 'PAID', coverageMonths: 3, coverageEndMonth: '2026-11' },
      { month: '2026-12', status: 'PENDING' },
      { month: '2027-01', status: 'REFUNDED' },
      { month: '2027-02', status: 'WAIVED' },
    ]);
    expect(out.months).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
    expect(out.coveredThrough).toBe('2026-11');
  });

  it('reports never-paid as no months', () => {
    expect(feeStandingFromPayments([])).toEqual({ months: [], coveredThrough: null });
  });
});

describe('registerFeeState', () => {
  const base = { enrolledOn: '2026-01-10', pausedMonths: [] as string[] };

  it('a payer for the month is on the register', () => {
    const s = registerFeeState({ ...base, feeMonths: ['2026-10'], sessionDate: '2026-10-20' });
    expect(s).toBe('PAID');
    expect(isExpectedOnRegister(s)).toBe(true);
  });

  it("last month's payer stays on until the 7th, then drops off", () => {
    expect(registerFeeState({ ...base, feeMonths: ['2026-09'], sessionDate: '2026-10-07' })).toBe('DUE');
    expect(registerFeeState({ ...base, feeMonths: ['2026-09'], sessionDate: '2026-10-08' })).toBe('UNPAID');
  });

  it('someone unpaid for two months is not expected — the 16-absentees case', () => {
    const s = registerFeeState({ ...base, feeMonths: ['2026-08'], sessionDate: '2026-10-02' });
    expect(s).toBe('UNPAID');
    expect(isExpectedOnRegister(s)).toBe(false);
  });

  it('a new joiner is expected for 14 days before their first fee lands', () => {
    expect(registerFeeState({ feeMonths: [], enrolledOn: '2026-10-05', sessionDate: '2026-10-19' })).toBe('NEW');
    expect(registerFeeState({ feeMonths: [], enrolledOn: '2026-10-05', sessionDate: '2026-10-20' })).toBe('UNPAID');
  });

  it('a paused month keeps them off, but a payment for that month wins', () => {
    expect(registerFeeState({ ...base, feeMonths: [], pausedMonths: ['2026-10'], sessionDate: '2026-10-03' })).toBe('PAUSED');
    expect(registerFeeState({ ...base, feeMonths: ['2026-10'], pausedMonths: ['2026-10'], sessionDate: '2026-10-03' })).toBe('PAID');
  });

  it('a September quarterly payer is PAID all through November', () => {
    const { months } = feeStandingFromPayments([
      { month: '2026-09', status: 'PAID', coverageMonths: 3, coverageEndMonth: '2026-11' },
    ]);
    expect(registerFeeState({ ...base, feeMonths: months, sessionDate: '2026-11-30' })).toBe('PAID');
    expect(registerFeeState({ ...base, feeMonths: months, sessionDate: '2026-12-05' })).toBe('DUE');
  });
});

describe('register punctuality', () => {
  const end = '19:00';
  const date = '2026-10-06';
  const at = (hhmm: string) => new Date(istWallClockMs(date, hhmm)).toISOString();

  it('taken during or within an hour of the session is on time', () => {
    expect(registerStatus({ sessionDate: date, endTime: end, takenAt: at('18:15'), cancelled: false, nowMs: 0 }).status).toBe('ON_TIME');
    expect(registerStatus({ sessionDate: date, endTime: end, takenAt: at('20:00'), cancelled: false, nowMs: 0 }).status).toBe('ON_TIME');
  });

  it('taken more than an hour after the end is late, with the delay recorded', () => {
    const r = registerStatus({ sessionDate: date, endTime: end, takenAt: at('21:30'), cancelled: false, nowMs: 0 });
    expect(r).toEqual({ status: 'LATE', minutesAfterEnd: 150 });
  });

  it('not taken is pending inside the window and missing after it', () => {
    expect(registerStatus({ sessionDate: date, endTime: end, takenAt: null, cancelled: false, nowMs: istWallClockMs(date, '19:45') }).status).toBe('PENDING');
    expect(registerStatus({ sessionDate: date, endTime: end, takenAt: null, cancelled: false, nowMs: istWallClockMs(date, '20:05') }).status).toBe('MISSING');
  });

  it('a session marked not held is never missing', () => {
    expect(registerStatus({ sessionDate: date, endTime: end, takenAt: null, cancelled: true, nowMs: Date.now() }).status).toBe('NOT_HELD');
  });

  it('the end time is the latest of the batch and its slots', () => {
    expect(batchEndTime({ endTime: '18:00', timeSlots: [{ endTime: '19:30' }, { endTime: '17:00' }] })).toBe('19:30');
    expect(batchEndTime({ endTime: '', timeSlots: [] })).toBe('23:59');
  });
});
