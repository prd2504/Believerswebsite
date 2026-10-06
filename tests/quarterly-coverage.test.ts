/**
 * Coverage: a quarterly payment counts for all three of its months, blocks a
 * double charge, and stops cleanly after.
 *
 * Ported from quarterly.mjs, audit.mjs and rollout.mjs. Sections of
 * quarterly.mjs that reimplemented component logic inline (the batch-card
 * lookback window) are NOT ported — see tests/README.md.
 */
import { describe, it, expect } from 'vitest';
import {
  coveredMonths, coverageEndMonth, paymentCoversMonth, coverageOverlaps,
  CYCLE_MONTHS, formatCoverage,
} from '@bba/shared';

const septQuarterly = { month: '2026-09', coverageMonths: 3, coverageEndMonth: coverageEndMonth('2026-09', 3) };

describe('a quarterly payment made in September', () => {
  it('covers Sep, Oct and Nov', () => {
    expect(coveredMonths('2026-09', CYCLE_MONTHS.QUARTERLY)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(coverageEndMonth('2026-09', 3)).toBe('2026-11');
  });

  it.each([
    ['2026-08', false], ['2026-09', true], ['2026-10', true],
    ['2026-11', true], ['2026-12', false], ['2027-01', false],
  ])('covers %s → %s', (month, want) => {
    expect(paymentCoversMonth(septQuarterly, month)).toBe(want);
  });

  it('formats as a range', () => {
    expect(formatCoverage('2026-09', 3)).toBe('Sep – Nov 2026');
  });
});

describe('a quarterly payment made on rollout day for October', () => {
  const octQuarterly = { month: '2026-10', coverageMonths: 3, coverageEndMonth: coverageEndMonth('2026-10', 3) };
  it('covers Oct, Nov and Dec', () => {
    expect(coveredMonths('2026-10', 3)).toEqual(['2026-10', '2026-11', '2026-12']);
    for (const m of ['2026-10', '2026-11', '2026-12']) expect(paymentCoversMonth(octQuarterly, m)).toBe(true);
  });
  it('expires after December', () => {
    expect(paymentCoversMonth(octQuarterly, '2027-01')).toBe(false);
  });
});

describe('a monthly payment made on the 25th for next month', () => {
  const oct = { month: '2026-10', coverageMonths: 1, coverageEndMonth: '2026-10' };
  it('does not cover the month it was paid in', () => {
    expect(paymentCoversMonth(oct, '2026-09')).toBe(false);
  });
  it('covers the month it was paid for', () => {
    expect(paymentCoversMonth(oct, '2026-10')).toBe(true);
  });
});

describe('double-charge guard', () => {
  it('blocks an October monthly payment on top of a September quarterly', () => {
    expect(coverageOverlaps(septQuarterly, { month: '2026-10', coverageMonths: 1, coverageEndMonth: '2026-10' })).toBe(true);
  });
  it('allows a December payment once the quarter has ended', () => {
    expect(coverageOverlaps(septQuarterly, { month: '2026-12', coverageMonths: 1, coverageEndMonth: '2026-12' })).toBe(false);
  });
});

describe('legacy payments with no cycle fields', () => {
  it('cover exactly their own month', () => {
    expect(paymentCoversMonth({ month: '2026-09' }, '2026-09')).toBe(true);
    expect(paymentCoversMonth({ month: '2026-09' }, '2026-10')).toBe(false);
  });
});

describe('year boundary', () => {
  it('a November quarterly runs into January', () => {
    expect(coveredMonths('2026-11', 3)).toEqual(['2026-11', '2026-12', '2027-01']);
  });
});
