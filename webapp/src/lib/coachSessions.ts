/**
 * A coach's month at a glance: sessions that count towards payroll, sessions
 * marked not held, and scheduled days with no register saved.
 *
 * "Counted" uses the same rule as the payroll job (functions/src/payroll/
 * autoPayroll.ts): the register was saved, the session is not marked not
 * held, and the coach is among those who saved it.
 */

import { batchEndTime, centreClosureOn, istWallClockMs, REGISTER_ON_TIME_MINUTES } from '@bba/shared';

export interface CoachBatchLite {
  id: string;
  name: string;
  centreId: string;
  offeredDays: readonly number[];
  startTime: string;
  endTime: string;
  timeSlots?: ReadonlyArray<{ endTime?: string | null }> | null;
}

export interface CoachSessionLite {
  batchId: string;
  sessionDate: string;
  cancelled: boolean;
  cancellationReason?: string | null;
  firstTakenAt?: string | null;
  endedAt?: string | null;
  coachIds: readonly string[];
}

export type TodayStatus = 'SAVED' | 'NOT_HELD' | 'DUE' | 'UPCOMING' | 'CLOSED';

export interface CoachMonthSummary {
  counted: number;
  countedByBatch: { batchName: string; sessions: number }[];
  onTime: number;
  notHeld: number;
  /** Scheduled, already over, and no register saved (most recent first). */
  missing: { batchId: string; batchName: string; date: string }[];
  today: { batch: CoachBatchLite; status: TodayStatus; detail: string | null }[];
}

function datesFrom(monthStart: string, today: string): string[] {
  const out: string[] = [];
  const d = new Date(`${monthStart}T00:00:00Z`);
  const end = new Date(`${today}T00:00:00Z`);
  while (d <= end) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

export function summariseCoachMonth(input: {
  uid: string;
  batches: readonly CoachBatchLite[];
  sessions: readonly CoachSessionLite[];
  /** centreId → centre code, for closures. */
  centreCodes: ReadonlyMap<string, string | null | undefined>;
  /** IST today, YYYY-MM-DD. */
  today: string;
  nowMs: number;
}): CoachMonthSummary {
  const { uid, batches, sessions, centreCodes, today, nowMs } = input;
  const byKey = new Map(sessions.map((s) => [`${s.batchId}|${s.sessionDate}`, s]));
  const taken = (s: CoachSessionLite | undefined) => !!s && !s.cancelled && !!(s.firstTakenAt || s.endedAt);

  const out: CoachMonthSummary = { counted: 0, countedByBatch: [], onTime: 0, notHeld: 0, missing: [], today: [] };

  for (const b of batches) {
    let n = 0;
    const end = batchEndTime(b);
    for (const date of datesFrom(`${today.slice(0, 7)}-01`, today)) {
      const s = byKey.get(`${b.id}|${date}`);
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const closed = !!centreClosureOn(centreCodes.get(b.centreId), date);
      const scheduled = b.offeredDays.includes(weekday) && !closed;
      const endMs = istWallClockMs(date, end);

      if (s?.cancelled) out.notHeld++;
      if (taken(s) && s!.coachIds.includes(uid)) {
        n++;
        const at = Date.parse((s!.firstTakenAt ?? s!.endedAt)!);
        if ((at - endMs) / 60_000 <= REGISTER_ON_TIME_MINUTES) out.onTime++;
      }
      if (date === today) {
        if (closed && !s) out.today.push({ batch: b, status: 'CLOSED', detail: centreClosureOn(centreCodes.get(b.centreId), date)!.reason });
        else if (s?.cancelled) out.today.push({ batch: b, status: 'NOT_HELD', detail: s.cancellationReason ?? null });
        else if (taken(s)) out.today.push({ batch: b, status: 'SAVED', detail: s!.firstTakenAt ?? s!.endedAt ?? null });
        else if (scheduled) out.today.push({ batch: b, status: nowMs >= istWallClockMs(date, b.startTime || '00:00') ? 'DUE' : 'UPCOMING', detail: null });
      } else if (scheduled && !s) {
        out.missing.push({ batchId: b.id, batchName: b.name, date });
      } else if (scheduled && s && !s.cancelled && !taken(s)) {
        out.missing.push({ batchId: b.id, batchName: b.name, date });
      }
    }
    out.counted += n;
    if (n > 0) out.countedByBatch.push({ batchName: b.name, sessions: n });
  }
  out.missing.sort((a, b) => b.date.localeCompare(a.date));
  out.today.sort((a, b) => a.batch.startTime.localeCompare(b.batch.startTime));
  return out;
}
