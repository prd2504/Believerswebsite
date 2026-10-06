/**
 * Register watchdog — every 30 minutes, 6 AM to 10:45 PM IST.
 *
 *   end + 30 min, no register → email the batch's coach(es)
 *   end + 2 h,    still none  → email the centre manager
 *
 * Each alert is claimed in /attendanceAlerts/{date}_{batchId} inside a
 * transaction, so overlapping runs never send the same alert twice. One email
 * per recipient per run lists everything outstanding, rather than one per batch.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { sendMail } from '../fees/mailer.js';
import {
  istNow,
  istWallClockMs,
  REGISTER_REMINDER_AFTER_MINUTES,
  REGISTER_ESCALATE_AFTER_MINUTES,
} from '@bba/shared';
import {
  loadDay, managersFor, fmtTime12, esc, APP_URL,
  type DaySession, type DayContext,
} from './opsDay.js';

const REGION = 'asia-south1';

async function claim(date: string, batchId: string, field: 'coachRemindedAt' | 'escalatedAt'): Promise<boolean> {
  const ref = db.doc(`attendanceAlerts/${date}_${batchId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()?.[field]) return false;
    tx.set(ref, { date, batchId, [field]: new Date().toISOString() }, { merge: true });
    return true;
  });
}

function listHtml(ctx: DayContext, sessions: DaySession[]): string {
  return sessions.map((s) => `<li style="margin:0 0 6px">
    <strong>${esc(s.batchName)}</strong> — ${esc(ctx.centres.get(s.centreId)?.name ?? '')},
    ended ${fmtTime12(s.endTime)} · ${s.expected} student${s.expected === 1 ? '' : 's'} expected
  </li>`).join('');
}

function wrap(title: string, body: string): string {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:16px;color:#1f2937">
  <div style="background:#0D1B2A;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0"><strong>${esc(title)}</strong></div>
  <div style="border:1px solid #e5e7eb;border-top:0;padding:18px;border-radius:0 0 10px 10px;font-size:14px;line-height:1.5">${body}</div>
</body></html>`;
}

export async function runAttendanceWatch(nowMs: number): Promise<{ reminded: number; escalated: number }> {
  const { date, time } = istNow(new Date(nowMs));
  if (time < '06:00' || time > '22:45') return { reminded: 0, escalated: 0 };

  const ctx = await loadDay(date, nowMs, { withRecords: false });
  const overdue = ctx.sessions.filter((s) =>
    (s.status === 'PENDING' || s.status === 'MISSING') &&
    nowMs - istWallClockMs(date, s.endTime) >= REGISTER_REMINDER_AFTER_MINUTES * 60_000);

  const toCoach = new Map<string, DaySession[]>();
  const toManager = new Map<string, DaySession[]>();
  const addTo = (m: Map<string, DaySession[]>, email: string, s: DaySession) => {
    if (!m.has(email)) m.set(email, []);
    m.get(email)!.push(s);
  };

  for (const s of overdue) {
    const minsLate = (nowMs - istWallClockMs(date, s.endTime)) / 60_000;
    const coachEmails = s.coachIds.map((id) => ctx.people.get(id)?.email).filter((e): e is string => !!e);

    if (coachEmails.length > 0 && await claim(date, s.batchId, 'coachRemindedAt')) {
      coachEmails.forEach((e) => addTo(toCoach, e, s));
    }
    // No coach to remind means nobody will act — go straight to the manager.
    if ((minsLate >= REGISTER_ESCALATE_AFTER_MINUTES || coachEmails.length === 0) &&
        await claim(date, s.batchId, 'escalatedAt')) {
      managersFor(ctx, s.centreId).forEach((m) => addTo(toManager, m.email!, s));
    }
  }

  for (const [email, list] of toCoach) {
    await sendMail({
      to: email,
      subject: `Attendance not marked yet — ${list.map((s) => s.batchName).join(', ')}`,
      html: wrap('Please mark today\'s attendance', `
        <p>The register for ${list.length === 1 ? 'this session has' : 'these sessions have'} not been saved yet:</p>
        <ul style="padding-left:18px">${listHtml(ctx, list)}</ul>
        <p><a href="${APP_URL}/coach/attendance" style="display:inline-block;background:#E8593C;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Mark attendance</a></p>
        <p style="color:#6b7280;font-size:12px">If the session did not happen (rain, holiday, court issue), tap “Not held” on the register so it isn't counted as missing.</p>`),
    }).catch((err) => logger.error('[attendanceWatch] coach email failed', { email, err }));
  }

  for (const [email, list] of toManager) {
    const rows = list.map((s) => {
      const coaches = s.coachIds.map((id) => ctx.people.get(id)?.name ?? 'Unknown').join(', ') || 'No coach assigned';
      return `<tr><td style="padding:6px 8px;border-bottom:1px solid #f1f5f9">${esc(s.batchName)}<br><span style="color:#6b7280;font-size:12px">${esc(ctx.centres.get(s.centreId)?.name ?? '')} · ended ${fmtTime12(s.endTime)}</span></td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9">${esc(coaches)}</td></tr>`;
    }).join('');
    await sendMail({
      to: email,
      subject: `⚠ ${list.length} register${list.length === 1 ? '' : 's'} still missing — ${date}`,
      html: wrap('Registers still missing', `
        <p>These sessions ended over ${REGISTER_ESCALATE_AFTER_MINUTES / 60} hours ago and no attendance has been saved. The coach has already been reminded.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">${rows}</table>
        <p style="margin-top:14px"><a href="${APP_URL}/admin/attendance">Open today's board</a></p>`),
    }).catch((err) => logger.error('[attendanceWatch] manager email failed', { email, err }));
  }

  logger.info('[attendanceWatch]', { date, time, overdue: overdue.length, coaches: toCoach.size, managers: toManager.size });
  return { reminded: toCoach.size, escalated: toManager.size };
}

export const attendanceWatch = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'Asia/Kolkata', region: REGION, timeoutSeconds: 300 },
  async () => { await runAttendanceWatch(Date.now()); },
);
