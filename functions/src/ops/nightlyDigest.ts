/**
 * Nightly operations digest — 10:30 PM IST, to the owner.
 *
 * Runs in order:
 *   1. Re-sync every student's fee standing from /payments (self-healing).
 *   2. Read the day (expected sessions, registers, marks).
 *   3. Store /attendanceDaily/{date} — the durable punctuality record.
 *   4. Email one report covering every centre: registers, attendance,
 *      attended-without-fee, absence streaks, fees, renewals, lapsed
 *      enrolments, and coach punctuality month-to-date.
 *
 * Also callable on demand (runOpsDigest) for a given date, or to run the
 * watchdog / fee sync by hand.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { FieldPath } from 'firebase-admin/firestore';
import { db } from '../admin.js';
import { sendMail } from '../fees/mailer.js';
import { requireAdminLike } from '../http/requireAdmin.js';
import {
  istNow,
  addMonths,
  formatMonthLabel,
  FEE_GRACE_DAY,
  NEW_JOINER_GRACE_DAYS,
  type AttendanceDailyDocument,
  type AttendanceDailySession,
} from '@bba/shared';
import { syncAllFeeStanding } from './feeStanding.js';
import { runAttendanceWatch } from './attendanceWatch.js';
import {
  loadDay, fmtTime12, istClock, esc, APP_URL,
  type DayContext, type DaySession, type StudentLite,
} from './opsDay.js';

const REGION = 'asia-south1';
const OWNER_RECIPIENTS = ['prdeshpande2504@gmail.com'];
/** Absent at this many consecutive scheduled sessions → flagged as a dropout risk. */
const ABSENCE_STREAK = 3;

// ── Data ────────────────────────────────────────────────────────────────────

interface CentreRoll {
  paid: StudentLite[];
  renewalPending: StudentLite[];
  lapsed: StudentLite[];
  newJoiners: StudentLite[];
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function rollByCentre(ctx: DayContext): Map<string, CentreRoll> {
  const month = ctx.date.slice(0, 7);
  const prev = addMonths(month, -1);
  const out = new Map<string, CentreRoll>();
  const seen = new Set<string>();
  for (const e of ctx.enrollments) {
    const key = `${e.centreId}|${e.studentId}`;
    if (seen.has(key) || e.pausedMonths.includes(month)) continue;
    seen.add(key);
    const s = ctx.students.get(e.studentId);
    if (!s) continue;
    if (!out.has(e.centreId)) out.set(e.centreId, { paid: [], renewalPending: [], lapsed: [], newJoiners: [] });
    const roll = out.get(e.centreId)!;
    if (s.feeMonths.includes(month)) roll.paid.push(s);
    else if (e.startDate && dayDiff(e.startDate, ctx.date) >= 0 && dayDiff(e.startDate, ctx.date) <= NEW_JOINER_GRACE_DAYS) roll.newJoiners.push(s);
    else if (s.feeMonths.includes(prev)) roll.renewalPending.push(s);
    else roll.lapsed.push(s);
  }
  const byName = (a: StudentLite, b: StudentLite) => a.name.localeCompare(b.name);
  out.forEach((r) => { r.paid.sort(byName); r.renewalPending.sort(byName); r.lapsed.sort(byName); r.newJoiners.sort(byName); });
  return out;
}

/** Paid students absent at their last N register marks. */
async function absenceStreaks(ctx: DayContext): Promise<Map<string, { student: StudentLite; lastPresent: string | null }[]>> {
  const from = new Date(Date.parse(`${ctx.date}T00:00:00Z`) - 27 * 86_400_000).toISOString().slice(0, 10);
  const snap = await db.collectionGroup('records')
    .where('sessionDate', '>=', from)
    .where('sessionDate', '<=', ctx.date)
    .get();
  const byStudent = new Map<string, { date: string; status: string }[]>();
  snap.docs.forEach((d) => {
    const r = d.data();
    if (!r.studentId || (r.attendeeType !== 'REGULAR' && r.attendeeType !== 'MAKEUP')) return;
    const list = byStudent.get(r.studentId) ?? [];
    list.push({ date: r.sessionDate, status: r.status });
    byStudent.set(r.studentId, list);
  });
  const month = ctx.date.slice(0, 7);
  const out = new Map<string, { student: StudentLite; lastPresent: string | null }[]>();
  byStudent.forEach((marks, sid) => {
    const s = ctx.students.get(sid);
    if (!s || s.status !== 'ACTIVE' || !s.feeMonths.includes(month)) return;
    marks.sort((a, b) => b.date.localeCompare(a.date));
    if (marks.length < ABSENCE_STREAK || !marks.slice(0, ABSENCE_STREAK).every((m) => m.status === 'ABSENT')) return;
    const lastPresent = marks.find((m) => m.status === 'PRESENT' || m.status === 'LATE')?.date ?? null;
    const list = out.get(s.primaryCentreId) ?? [];
    list.push({ student: s, lastPresent });
    out.set(s.primaryCentreId, list);
  });
  return out;
}

interface FeeDay { todayCount: number; todayPaise: number; todayNames: string[]; monthPaise: number; monthCount: number }

async function feesByCentre(ctx: DayContext): Promise<Map<string, FeeDay>> {
  const month = ctx.date.slice(0, 7);
  // Start of the month in IST, as UTC ISO — paidAt is stored in UTC.
  const fromIso = new Date(Date.parse(`${month}-01T00:00:00+05:30`)).toISOString();
  const snap = await db.collection('payments').where('paidAt', '>=', fromIso).get();
  const out = new Map<string, FeeDay>();
  snap.docs.forEach((d) => {
    const p = d.data();
    if (p.status !== 'PAID' || !p.paidAt) return;
    const paidDate = istNow(new Date(p.paidAt as string)).date;
    if (paidDate.slice(0, 7) !== month || paidDate > ctx.date) return;
    const f = out.get(p.centreId) ?? { todayCount: 0, todayPaise: 0, todayNames: [], monthPaise: 0, monthCount: 0 };
    f.monthPaise += (p.totalAmountPaise as number) ?? 0;
    f.monthCount++;
    if (paidDate === ctx.date) {
      f.todayCount++;
      f.todayPaise += (p.totalAmountPaise as number) ?? 0;
      const name = ctx.students.get(p.studentId)?.name ?? 'Unknown';
      f.todayNames.push(`${name}${(p.coverageMonths as number) > 1 ? ' (3 months)' : ''}`);
    }
    out.set(p.centreId, f);
  });
  return out;
}

interface CoachTally { name: string; expected: number; onTime: number; late: number; missing: number }

async function coachMonthToDate(ctx: DayContext, today: AttendanceDailySession[]): Promise<CoachTally[]> {
  const month = ctx.date.slice(0, 7);
  const snap = await db.collection('attendanceDaily')
    .where(FieldPath.documentId(), '>=', `${month}-01`)
    .where(FieldPath.documentId(), '<', ctx.date)
    .get();
  const all: AttendanceDailySession[] = [...today];
  snap.docs.forEach((d) => all.push(...(((d.data() as AttendanceDailyDocument).sessions) ?? [])));
  const tally = new Map<string, CoachTally>();
  all.forEach((s) => {
    if (s.status === 'NOT_HELD') return;
    const ids = s.coachIds.length ? s.coachIds : ['__none__'];
    ids.forEach((id) => {
      const t = tally.get(id) ?? { name: id === '__none__' ? 'No coach assigned' : (ctx.people.get(id)?.name ?? id), expected: 0, onTime: 0, late: 0, missing: 0 };
      t.expected++;
      if (s.status === 'ON_TIME') t.onTime++;
      else if (s.status === 'LATE') t.late++;
      else t.missing++;
      tally.set(id, t);
    });
  });
  return Array.from(tally.values()).sort((a, b) => (a.onTime / a.expected) - (b.onTime / b.expected));
}

function toDaily(s: DaySession): AttendanceDailySession {
  return {
    batchId: s.batchId,
    batchName: s.batchName,
    centreId: s.centreId,
    coachIds: s.coachIds,
    endTime: s.endTime,
    // Nothing is "pending" once the day is over.
    status: s.status === 'PENDING' ? 'MISSING' : s.status,
    minutesAfterEnd: s.minutesAfterEnd,
    expected: s.expected,
    present: s.present,
    absent: s.absent,
    unpaidPresent: s.unpaidPresent.length,
    trials: s.trials.length,
    notHeldReason: s.notHeldReason,
  };
}

// ── Email ───────────────────────────────────────────────────────────────────

function inr(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.round(paise / 100));
}

const H3 = 'margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#64748b';
const TD = 'padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:13px;vertical-align:top';

const STATUS_BADGE: Record<string, [string, string]> = {
  ON_TIME: ['On time', '#15803d'],
  LATE: ['Late', '#b45309'],
  MISSING: ['Missing', '#b91c1c'],
  PENDING: ['Missing', '#b91c1c'],
  NOT_HELD: ['Not held', '#64748b'],
};

function names(list: StudentLite[], withPhone = false, max = 40): string {
  const shown = list.slice(0, max).map((s) => esc(s.name) + (withPhone && s.phone ? ` <span style="color:#94a3b8">${esc(s.phone)}</span>` : ''));
  return shown.join(', ') + (list.length > max ? ` … +${list.length - max} more` : '');
}

export function buildNightlyHtml(
  ctx: DayContext,
  roll: Map<string, CentreRoll>,
  streaks: Awaited<ReturnType<typeof absenceStreaks>>,
  fees: Map<string, FeeDay>,
  coaches: CoachTally[],
): { subject: string; html: string } {
  const month = ctx.date.slice(0, 7);
  const dayOfMonth = Number(ctx.date.slice(8, 10));
  const dateLabel = new Date(`${ctx.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  const missing = ctx.sessions.filter((s) => s.status === 'MISSING' || s.status === 'PENDING');
  const late = ctx.sessions.filter((s) => s.status === 'LATE');
  const unpaidPresent = ctx.sessions.flatMap((s) => s.unpaidPresent);
  const streakCount = Array.from(streaks.values()).reduce((t, l) => t + l.length, 0);
  const lapsedCount = Array.from(roll.values()).reduce((t, r) => t + r.lapsed.length, 0);
  const renewCount = Array.from(roll.values()).reduce((t, r) => t + r.renewalPending.length, 0);
  const present = ctx.sessions.reduce((t, s) => t + s.present, 0);
  const expected = ctx.sessions.filter((s) => s.status !== 'NOT_HELD').reduce((t, s) => t + s.expected, 0);
  const feesToday = Array.from(fees.values()).reduce((t, f) => t + f.todayPaise, 0);

  const actions: string[] = [];
  if (missing.length) actions.push(`<strong>${missing.length}</strong> register${missing.length === 1 ? '' : 's'} never taken`);
  if (unpaidPresent.length) actions.push(`<strong>${unpaidPresent.length}</strong> trained without a fee for ${formatMonthLabel(month)}`);
  if (streakCount) actions.push(`<strong>${streakCount}</strong> paid student${streakCount === 1 ? '' : 's'} absent ${ABSENCE_STREAK}+ sessions in a row`);
  if (renewCount && dayOfMonth > FEE_GRACE_DAY) actions.push(`<strong>${renewCount}</strong> renewal${renewCount === 1 ? '' : 's'} overdue (paid last month, not this)`);
  if (lapsedCount) actions.push(`<strong>${lapsedCount}</strong> still enrolled but unpaid 2+ months — end their enrolment if they've left`);

  const centreIds = Array.from(new Set([
    ...ctx.sessions.map((s) => s.centreId),
    ...roll.keys(),
    ...fees.keys(),
  ])).filter((id) => ctx.centres.has(id))
    .sort((a, b) => (ctx.centres.get(a)!.name).localeCompare(ctx.centres.get(b)!.name));

  const centreBlocks = centreIds.map((cid) => {
    const centre = ctx.centres.get(cid)!;
    const sessions = ctx.sessions.filter((s) => s.centreId === cid);
    const r = roll.get(cid) ?? { paid: [], renewalPending: [], lapsed: [], newJoiners: [] };
    const f = fees.get(cid);
    const st = streaks.get(cid) ?? [];

    const sessionRows = sessions.map((s) => {
      const [label, colour] = STATUS_BADGE[s.status] ?? ['?', '#64748b'];
      const coach = s.coachIds.map((id) => ctx.people.get(id)?.name ?? '?').join(', ') || '<span style="color:#b91c1c">no coach</span>';
      const when = s.status === 'NOT_HELD' ? esc(s.notHeldReason)
        : s.takenAt ? `${istClock(s.takenAt)}${s.status === 'LATE' && s.minutesAfterEnd ? ` (${Math.round(s.minutesAfterEnd / 60 * 10) / 10}h after)` : ''}` : '—';
      const counts = s.status === 'NOT_HELD' || !s.takenAt ? `${s.expected} expected`
        : `<span style="color:#15803d;font-weight:600">${s.present}P</span> / <span style="color:#b91c1c">${s.absent}A</span> · ${s.expected} expected`
          + (s.trials.length ? ` · ${s.trials.length} trial` : '')
          + (s.unpaidPresent.length ? ` · <span style="color:#b91c1c">${s.unpaidPresent.length} unpaid</span>` : '');
      return `<tr>
        <td style="${TD}">${fmtTime12(s.startTime)}<br><span style="color:#64748b">${esc(s.batchName)}</span></td>
        <td style="${TD}">${coach}</td>
        <td style="${TD}"><span style="color:${colour};font-weight:600">${label}</span><br><span style="color:#94a3b8;font-size:12px">${when}</span></td>
        <td style="${TD}">${counts}</td></tr>`;
    }).join('');

    const unpaid = sessions.flatMap((s) => s.unpaidPresent.map((u) => esc(u.name)));
    const trials = sessions.flatMap((s) => s.trials.map((t) => `${esc(t.name)}${t.phone ? ` <span style="color:#94a3b8">${esc(t.phone)}</span>` : ''}`));

    return `<div style="margin:0 0 26px;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px">
      <h2 style="margin:0 0 2px;font-size:16px;color:#0D1B2A">${esc(centre.name)}</h2>
      <p style="margin:0;font-size:12px;color:#64748b">
        ${r.paid.length} paid for ${formatMonthLabel(month)}
        ${r.newJoiners.length ? ` · ${r.newJoiners.length} new` : ''}
        ${r.renewalPending.length ? ` · ${r.renewalPending.length} renewal${r.renewalPending.length === 1 ? '' : 's'} pending` : ''}
        ${f ? ` · ${inr(f.monthPaise)} collected this month` : ''}
      </p>

      ${sessions.length ? `<p style="${H3}">Registers today</p>
      <table style="width:100%;border-collapse:collapse">${sessionRows}</table>` : `<p style="${H3}">No sessions scheduled today</p>`}

      ${unpaid.length ? `<p style="${H3};color:#b91c1c">Trained without a fee for ${formatMonthLabel(month)}</p><p style="margin:0;font-size:13px">${unpaid.join(', ')}</p>` : ''}
      ${trials.length ? `<p style="${H3}">Trials — follow up</p><p style="margin:0;font-size:13px">${trials.join(' · ')}</p>` : ''}
      ${st.length ? `<p style="${H3};color:#b45309">Absent ${ABSENCE_STREAK}+ sessions in a row (paid)</p><p style="margin:0;font-size:13px">${st.map((x) => `${esc(x.student.name)}${x.student.phone ? ` <span style="color:#94a3b8">${esc(x.student.phone)}</span>` : ''}${x.lastPresent ? ` <span style="color:#94a3b8">· last came ${x.lastPresent.slice(5)}</span>` : ''}`).join(' · ')}</p>` : ''}
      ${f && f.todayCount ? `<p style="${H3}">Fees received today</p><p style="margin:0;font-size:13px">${f.todayCount} · ${inr(f.todayPaise)} — ${f.todayNames.map(esc).join(', ')}</p>` : ''}
      ${r.renewalPending.length ? `<p style="${H3}">${dayOfMonth > FEE_GRACE_DAY ? 'Renewals overdue' : `Renewals due by ${FEE_GRACE_DAY} ${formatMonthLabel(month)}`}</p><p style="margin:0;font-size:13px">${names(r.renewalPending, true)}</p>` : ''}
      ${r.lapsed.length ? `<p style="${H3}">Enrolled but unpaid 2+ months — off the register</p><p style="margin:0;font-size:13px;color:#64748b">${names(r.lapsed)}</p>` : ''}
    </div>`;
  }).join('');

  const coachRows = coaches.map((c) => {
    const pct = c.expected ? Math.round((c.onTime / c.expected) * 100) : 0;
    const colour = pct >= 90 ? '#15803d' : pct >= 70 ? '#b45309' : '#b91c1c';
    return `<tr><td style="${TD}">${esc(c.name)}</td>
      <td style="${TD};text-align:right;color:${colour};font-weight:600">${pct}%</td>
      <td style="${TD};text-align:right">${c.onTime}/${c.expected}</td>
      <td style="${TD};text-align:right">${c.late}</td>
      <td style="${TD};text-align:right;color:${c.missing ? '#b91c1c' : 'inherit'}">${c.missing}</td></tr>`;
  }).join('');

  const subject = `BBA nightly — ${ctx.date}: ${present}/${expected} attended`
    + (missing.length ? ` · ${missing.length} register${missing.length === 1 ? '' : 's'} missing` : ' · all registers in')
    + (feesToday ? ` · ${inr(feesToday)} collected` : '');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:16px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937">
<div style="max-width:720px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#0D1B2A;padding:18px 22px;color:#fff">
    <div style="font-size:18px;font-weight:700">Nightly operations — ${esc(dateLabel)}</div>
    <div style="font-size:13px;opacity:.8;margin-top:4px">${present} of ${expected} expected students attended · ${ctx.sessions.length} sessions · ${inr(feesToday)} collected today</div>
  </div>
  <div style="padding:16px 22px;background:${actions.length ? '#fff7ed' : '#f0fdf4'};border-bottom:1px solid #e2e8f0;font-size:14px">
    ${actions.length
      ? `<div style="font-weight:700;margin-bottom:6px">Needs attention</div><ul style="margin:0;padding-left:18px">${actions.map((a) => `<li>${a}</li>`).join('')}</ul>`
      : '<strong style="color:#15803d">Nothing needs attention today.</strong>'}
  </div>
  <div style="padding:18px 22px">
    ${centreBlocks || '<p>No activity recorded.</p>'}
    ${coaches.length ? `<p style="${H3}">Coach punctuality — ${formatMonthLabel(month)} to date</p>
    <table style="width:100%;border-collapse:collapse">
      <tr><th style="${TD};text-align:left">Coach</th><th style="${TD};text-align:right">On time</th><th style="${TD};text-align:right">Taken</th><th style="${TD};text-align:right">Late</th><th style="${TD};text-align:right">Missing</th></tr>
      ${coachRows}</table>
    <p style="font-size:12px;color:#94a3b8">On time = saved within an hour of the session ending. Sessions marked "Not held" are excluded.</p>` : ''}
    <p style="font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:20px">
      Expected = paid for ${formatMonthLabel(month)}, last month's payers until the ${FEE_GRACE_DAY}th, and new joiners for ${NEW_JOINER_GRACE_DAYS} days.
      <a href="${APP_URL}/admin/attendance" style="color:#E8593C">Open today's board</a>
    </p>
  </div>
</div></body></html>`;

  return { subject, html };
}

// ── Run ─────────────────────────────────────────────────────────────────────

export async function runNightlyDigest(date: string, opts: { send: boolean }) {
  const feeSync = await syncAllFeeStanding();
  const nowMs = Date.now();
  const ctx = await loadDay(date, nowMs, { withRecords: true });

  const daily: AttendanceDailyDocument = {
    date,
    generatedAt: new Date(nowMs).toISOString(),
    sessions: ctx.sessions.map(toDaily),
  };
  await db.collection('attendanceDaily').doc(date).set(daily);

  const [streaks, fees, coaches] = await Promise.all([
    absenceStreaks(ctx),
    feesByCentre(ctx),
    coachMonthToDate(ctx, daily.sessions),
  ]);
  const { subject, html } = buildNightlyHtml(ctx, rollByCentre(ctx), streaks, fees, coaches);

  if (opts.send) {
    await sendMail({ to: OWNER_RECIPIENTS.join(', '), subject, html });
  }
  logger.info('[nightlyDigest] done', { date, sessions: ctx.sessions.length, feeSync, sent: opts.send });
  return { subject, sessions: ctx.sessions.length, feeSync, html: opts.send ? undefined : html };
}

export const nightlyOpsDigest = onSchedule(
  { schedule: '30 22 * * *', timeZone: 'Asia/Kolkata', region: REGION, timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    await runNightlyDigest(istNow().date, { send: true });
  },
);

/**
 * Manual trigger. POST { action?: 'digest' | 'watch' | 'syncFees', date?: 'YYYY-MM-DD', send?: boolean }.
 * `send: false` returns the email HTML instead of mailing it — for previewing.
 */
export const runOpsDigest = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 540, memory: '512MiB' },
  async (req, res): Promise<void> => {
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
    if (!(await requireAdminLike(req, res))) return;
    const action = (req.body?.action as string) ?? 'digest';
    const date = (req.body?.date as string) ?? istNow().date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD' }); return; }
    try {
      if (action === 'syncFees') { res.json({ ok: true, ...(await syncAllFeeStanding()) }); return; }
      if (action === 'watch') { res.json({ ok: true, ...(await runAttendanceWatch(Date.now())) }); return; }
      const out = await runNightlyDigest(date, { send: req.body?.send !== false });
      res.json({ ok: true, ...out });
    } catch (err) {
      logger.error('[runOpsDigest] failed', { err });
      res.status(500).json({ ok: false, error: (err as Error)?.message ?? 'Internal error' });
    }
  },
);
