/**
 * Data-health checks surface the records that silently break registers,
 * reminders and receipts.
 */
import { describe, it, expect } from 'vitest';
import { buildChecks } from '../webapp/src/lib/dataHealth';

const student = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: `Kid ${id}`, status: 'ACTIVE', primaryCentreId: 'dad', phone: '9820012345',
  email: 'p@x.in', externalStudentId: `BBA-DAD-${id}`, feeMonths: ['2026-10'], ...over,
}) as any;
const batch = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: `Batch ${id}`, centreId: 'dad', status: 'ACTIVE', offeredDays: [1, 3, 5], coachIds: ['c1'],
  startTime: '16:00', endTime: '17:00', ...over,
}) as any;
const enrol = (studentId: string, batchId: string, over: Record<string, unknown> = {}) => ({
  studentId, batchId, centreId: 'dad', daysPerWeek: 3, selectedDays: [1, 3, 5], status: 'ACTIVE', ...over,
}) as any;

function run(input: Partial<Parameters<typeof buildChecks>[0]>) {
  const checks = buildChecks({ students: [], enrollments: [], batches: [batch('b1')], coaches: [], month: '2026-10', ...input });
  return Object.fromEntries(checks.map((c) => [c.id, c.items.map((i) => i.name)]));
}

describe('data health', () => {
  it('a clean record raises nothing', () => {
    const out = run({ students: [student('1')], enrollments: [enrol('1', 'b1')] });
    expect(Object.values(out).flat()).toEqual([]);
  });

  it('flags a paid student who is on no register', () => {
    expect(run({ students: [student('1')] }).paidNotEnrolled).toEqual(['Kid 1']);
  });

  it('flags missing and malformed contact details', () => {
    const out = run({
      students: [student('1', { phone: null }), student('2', { phone: '98200', email: '' })],
      enrollments: [enrol('1', 'b1'), enrol('2', 'b1')],
    });
    expect(out.noPhone).toEqual(['Kid 1']);
    expect(out.badPhone).toEqual(['Kid 2']);
    expect(out.noEmail).toEqual(['Kid 2']);
  });

  it('accepts a +91 number as a valid mobile', () => {
    const out = run({ students: [student('1', { phone: '+91 98200 12345' })], enrollments: [enrol('1', 'b1')] });
    expect(out.badPhone).toEqual([]);
  });

  it('flags days that do not match the plan or the batch', () => {
    const out = run({ students: [student('1')], enrollments: [enrol('1', 'b1', { selectedDays: [1, 2] })] });
    expect(out.dayMismatch).toEqual(['Kid 1']);
  });

  it('flags enrolment in a closed batch, and unpaid 2+ months', () => {
    const out = run({
      students: [student('1'), student('2', { feeMonths: ['2026-08'] })],
      batches: [batch('b1', { status: 'INACTIVE' }), batch('b2')],
      enrollments: [enrol('1', 'b1'), enrol('2', 'b2')],
    });
    expect(out.inactiveBatch).toEqual(['Kid 1']);
    expect(out.lapsed).toEqual(['Kid 2']);
  });

  it('never flags as lapsed a student whose fees have not synced yet', () => {
    const out = run({ students: [student('1', { feeMonths: undefined })], enrollments: [enrol('1', 'b1')] });
    expect(out.lapsed).toEqual([]);
  });

  it('flags batches without a coach and assigned coaches without email', () => {
    const out = run({
      batches: [batch('b1', { coachIds: [] }), batch('b2', { coachIds: ['c2'] })],
      coaches: [{ id: 'c2', name: 'Coach Two', email: null, phone: null, centreIds: [] } as any],
    });
    expect(out.batchNoCoach).toEqual(['Batch b1']);
    expect(out.coachNoEmail).toEqual(['Coach Two']);
  });

  it('flags same-name active students at one centre as possible duplicates', () => {
    const out = run({
      students: [student('1', { name: 'Riya  Shah' }), student('2', { name: 'riya shah' })],
      enrollments: [enrol('1', 'b1'), enrol('2', 'b1')],
    });
    expect(out.duplicates).toHaveLength(2);
  });
});
