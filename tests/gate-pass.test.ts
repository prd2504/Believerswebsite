/**
 * Gate passes: month colours, pass codes, day-pass validity, and the rollout
 * constants.
 *
 * Ported from audit.mjs, rollout.mjs and the pass-logic check run while the
 * passes were built.
 *
 * NOT covered here: the UPCOMING state. rollout.mjs appeared to test it, but
 * the assertion compared two string literals ('2026-10' > '2026-09') and
 * could never fail. The real logic is in buildStandingPass, inside a Cloud
 * Function module that initialises Firebase on import — see tests/README.md.
 */
import { describe, it, expect } from 'vitest';
import {
  monthColour, MONTH_COLOURS, passCode, dayPassState,
  GATE_PASS_LAUNCH_MONTH, GATE_PASS_CENTRE_CODE,
} from '@bba/shared';

describe('month colours — the actual security of the pass', () => {
  const colours = Array.from({ length: 12 }, (_, i) => monthColour(`2026-${String(i + 1).padStart(2, '0')}`).bg);

  it('are all distinct', () => {
    expect(new Set(colours).size).toBe(12);
    expect(MONTH_COLOURS).toHaveLength(12);
  });
  it('never repeat between neighbouring months', () => {
    colours.forEach((c, i) => { if (i > 0) expect(c).not.toBe(colours[i - 1]); });
  });
  it('October is magenta — what security admits from 1 Oct', () => {
    expect(monthColour('2026-10').name).toBe('magenta');
    expect(monthColour('2026-09').name).toBe('amber');
  });
});

describe('passCode', () => {
  it('is centre, ddmm, and the first four token characters uppercased', () => {
    expect(passCode('DAD', '2026-09-01', '4f7ka91b')).toBe('DAD-0109-4F7K');
    expect(passCode('RUI', '2026-10-15', 'ab12cd34')).toBe('RUI-1510-AB12');
  });
});

describe('dayPassState', () => {
  const today = '2026-09-10';
  it.each([
    ['APPROVED', '2026-09-10', 'VALID'],
    ['APPROVED', '2026-09-09', 'EXPIRED'],
    ['APPROVED', '2026-09-11', 'EXPIRED'],
    ['PENDING_APPROVAL', '2026-09-10', 'PENDING'],
    ['REJECTED', '2026-09-10', 'REJECTED'],
  ] as const)('%s for %s → %s', (status, validDate, want) => {
    expect(dayPassState({ status, validDate }, today)).toBe(want);
  });
});

describe('rollout constants', () => {
  it('passes are Dadar-only', () => {
    expect(GATE_PASS_CENTRE_CODE).toBe('DAD');
  });
  it('receipts carry a pass from October 2026', () => {
    expect(GATE_PASS_LAUNCH_MONTH).toBe('2026-10');
    expect('2026-09' >= GATE_PASS_LAUNCH_MONTH).toBe(false);
    expect('2026-10' >= GATE_PASS_LAUNCH_MONTH).toBe(true);
  });
});
