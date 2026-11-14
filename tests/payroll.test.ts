import { describe, it, expect } from 'vitest';
import { computeAttendancePayroll, autoPayrollRunId } from '@bba/shared';

describe('payroll from attendance', () => {
  it('per-session coach: sessions × rate', () => {
    const p = computeAttendancePayroll({ employmentType: 'PER_SESSION', ratePaise: 50_000, sessionsCount: 22 });
    expect(p.perSessionPayPaise).toBe(1_100_000);
    expect(p.netPayPaise).toBe(1_100_000);
  });
  it('salaried coach: the monthly salary, whatever the session count', () => {
    const p = computeAttendancePayroll({ employmentType: 'SALARIED', ratePaise: 2_000_000, sessionsCount: 3 });
    expect(p.basicPaise).toBe(2_000_000);
    expect(p.perSessionPayPaise).toBe(0);
  });
  it('keeps allowances and deductions an admin entered', () => {
    const p = computeAttendancePayroll({
      employmentType: 'PER_SESSION', ratePaise: 50_000, sessionsCount: 10,
      allowancesPaise: 20_000, deductionsPaise: { professionalTaxPaise: 20_000, advanceRecoveryPaise: 100_000 },
    });
    expect(p.grossPayPaise).toBe(520_000);
    expect(p.totalDeductionsPaise).toBe(120_000);
    expect(p.netPayPaise).toBe(400_000);
  });
  it('one run per coach per month', () => {
    expect(autoPayrollRunId('stf1', '2026-11')).toBe('stf1_2026-11');
  });
});

describe('who a session is credited to', () => {
  it('the coach who first saved the register, once', async () => {
    const { creditedCoachUid } = await import('@bba/shared');
    expect(creditedCoachUid({ takenBy: 'b', takenByRole: 'COACH', coachIds: ['a', 'b'] }, ['a'])).toBe('b');
  });
  it("a register saved by the manager goes to the batch's only coach", async () => {
    const { creditedCoachUid } = await import('@bba/shared');
    expect(creditedCoachUid({ takenBy: 'mgr', takenByRole: 'CENTRE_MANAGER' }, ['a'])).toBe('a');
    expect(creditedCoachUid({ takenBy: 'mgr', takenByRole: 'CENTRE_MANAGER' }, ['a', 'b'])).toBeNull();
  });
  it('older sessions fall back to whoever opened them', async () => {
    const { creditedCoachUid } = await import('@bba/shared');
    expect(creditedCoachUid({ coachIds: ['a', 'b'] }, ['b'])).toBe('a');
  });
});
