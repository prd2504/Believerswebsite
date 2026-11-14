import { describe, it, expect } from 'vitest';
import { istWallClockMs } from '@bba/shared';
import { summariseCoachMonth } from '../webapp/src/lib/coachSessions';

const batch = { id: 'b1', name: 'Dadar Evening', centreId: 'dad', offeredDays: [1, 2, 3, 4, 5], startTime: '16:00', endTime: '19:00' };
const centreCodes = new Map([['dad', 'DAD']]);
const ses = (date: string, over: Record<string, unknown> = {}) => ({
  batchId: 'b1', sessionDate: date, cancelled: false, firstTakenAt: new Date(istWallClockMs(date, '19:10')).toISOString(), coachIds: ['me'], ...over,
});
const run = (sessions: ReturnType<typeof ses>[], today = '2026-11-18', time = '20:00') =>
  summariseCoachMonth({ uid: 'me', batches: [batch], sessions, centreCodes, today, nowMs: istWallClockMs(today, time) });

describe("a coach's month", () => {
  it('counts registers the coach saved, not ones saved by someone else', () => {
    const out = run([ses('2026-11-02'), ses('2026-11-03'), ses('2026-11-04', { coachIds: ['other'] })]);
    expect(out.counted).toBe(2);
    expect(out.countedByBatch).toEqual([{ batchName: 'Dadar Evening', sessions: 2 }]);
  });

  it('a session marked not held is neither counted nor missing', () => {
    const out = run([ses('2026-11-02', { cancelled: true, firstTakenAt: null })]);
    expect(out.counted).toBe(0);
    expect(out.notHeld).toBe(1);
    expect(out.missing.some((m) => m.date === '2026-11-02')).toBe(false);
  });

  it('lists scheduled weekdays with no register, skipping weekends and the Diwali closure', () => {
    const dates = run([ses('2026-11-02')], '2026-11-13').missing.map((m) => m.date);
    expect(dates).toContain('2026-11-03');
    expect(dates).toContain('2026-11-12');           // classes resumed
    expect(dates).not.toContain('2026-11-07');       // Saturday
    expect(dates).not.toContain('2026-11-09');       // Diwali vacation
    expect(dates).not.toContain('2026-11-13');       // today is shown under "today", not missing
  });

  it("today's session is upcoming, then due, then saved", () => {
    expect(run([], '2026-11-18', '10:00').today[0].status).toBe('UPCOMING');
    expect(run([], '2026-11-18', '17:00').today[0].status).toBe('DUE');
    expect(run([ses('2026-11-18')], '2026-11-18', '20:00').today[0].status).toBe('SAVED');
  });

  it('on-time means saved within an hour of the end', () => {
    const late = new Date(istWallClockMs('2026-11-03', '22:30')).toISOString();
    const out = run([ses('2026-11-02'), ses('2026-11-03', { firstTakenAt: late })]);
    expect(out.counted).toBe(2);
    expect(out.onTime).toBe(1);
  });
});
