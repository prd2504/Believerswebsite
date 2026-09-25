/**
 * Auto-schedule each month's slot-booking window.
 *
 * Previously `openAt` was a single timestamp set by hand for one launch. Once
 * that moment passed it stayed in the past, so the window was permanently open
 * and every subsequent month had no announced opening unless someone
 * remembered to edit Firestore.
 *
 * This writes the NEXT booking month's opening time into `openAtByMonth`. It
 * cannot use the plain `openAt` field: that is global, so a future value
 * intended to gate October would also close September. Keying by month scopes
 * the gate to exactly the month being booked.
 *
 * Opt-in per centre via `autoOpenEnabled` — a centre that never wants a timed
 * drop is simply left alone.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { config } from '../config.js';
import { computeAutoOpenAt } from '@bba/shared';

const REGION = 'asia-south1';

/**
 * The month /fees will start filing bookings under next.
 *
 * getDefaultMonth() on the public form flips to the next month on the 25th, so
 * the month to schedule is always "the month after the one currently being
 * booked". Run on the 1st, that is simply next month.
 */
function nextBookingMonth(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function scheduleUpcomingWindows(now = new Date()): Promise<{
  scheduled: { centreId: string; month: string; openAt: string }[];
  skipped: string[];
}> {
  const snap = await db.collection('slotBookingConfig').get();
  const month = nextBookingMonth(now);
  const scheduled: { centreId: string; month: string; openAt: string }[] = [];
  const skipped: string[] = [];

  for (const doc of snap.docs) {
    const cfg = doc.data();
    if (!cfg.autoOpenEnabled) { skipped.push(`${doc.id} (auto-open off)`); continue; }

    const existing = (cfg.openAtByMonth ?? {}) as Record<string, string>;
    if (existing[month]) { skipped.push(`${doc.id} (${month} already scheduled)`); continue; }

    const openAt = computeAutoOpenAt(
      month,
      typeof cfg.autoOpenDayOfMonth === 'number' ? cfg.autoOpenDayOfMonth : 25,
      typeof cfg.autoOpenTime === 'string' ? cfg.autoOpenTime : '21:30',
    );

    // Merge rather than replace: past months stay recorded, which is useful
    // when reconstructing why a window opened when it did.
    await doc.ref.set({
      openAtByMonth: { ...existing, [month]: openAt },
      updatedAt: new Date().toISOString(),
      updatedBy: 'scheduleSlotWindow',
    }, { merge: true });

    scheduled.push({ centreId: doc.id, month, openAt });
  }

  logger.info('[scheduleSlotWindow] done', { month, scheduled, skipped });
  return { scheduled, skipped };
}

/** 1st of each month, 02:00 IST — well clear of any month-end activity. */
export const scheduledSlotWindow = onSchedule(
  { schedule: '0 2 1 * *', timeZone: 'Asia/Kolkata', region: REGION },
  async () => { await scheduleUpcomingWindows(); },
);

/** Manual run, for setting up the first month or re-running after a change. */
export const scheduleSlotWindowNow = onRequest(
  { region: REGION, cors: true },
  async (req, res): Promise<void> => {
    if (!config.sheets.apiKey || req.header('x-api-key') !== config.sheets.apiKey) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }
    try {
      res.status(200).json({ ok: true, ...(await scheduleUpcomingWindows()) });
    } catch (err: any) {
      logger.error('[scheduleSlotWindowNow] failed', { err });
      res.status(500).json({ ok: false, error: err?.message ?? 'Internal error' });
    }
  },
);


/**
 * Weekly nudge: who is booking often enough that a monthly plan would suit
 * them better. Sent to the team, not to the customer — a plan reserves a
 * specific weekly hour, which needs a conversation about which hour.
 */
export const weeklyPlanCandidates = onSchedule(
  { schedule: '0 10 * * MON', timeZone: 'Asia/Kolkata', region: REGION },
  async () => {
    const { findMonthlyPlanCandidates } = await import('./onCourtBookingCreated.js');
    const centres = await db.collection('courtRentalConfig').get();

    for (const cfg of centres.docs) {
      const candidates = await findMonthlyPlanCandidates(cfg.id);
      if (candidates.length === 0) continue;

      const lines = candidates.slice(0, 10).map(
        (c) => `• ${c.name} (${c.phone}) — ${c.bookings} hours, ₹${Math.round(c.spentPaise / 100)}`,
      );
      const text =
        `📅 Monthly plan candidates — last 28 days\n` +
        `${candidates.length} regular${candidates.length > 1 ? 's' : ''} booking ad-hoc:\n\n` +
        lines.join('\n') +
        `\n\nA monthly plan is ₹700/hr vs ₹800 — worth offering.`;

      const url = process.env.JARVIS_NOTIFY_URL;
      const secret = process.env.JARVIS_NOTIFY_SECRET;
      if (!url || !secret) { logger.info('[planCandidates] relay not configured', { text }); continue; }
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-jarvis-secret': secret },
          body: JSON.stringify({ to: 'jaydeep', text, source: 'court-plan-candidates' }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (err) {
        logger.warn('[planCandidates] relay unreachable', { err: String(err) });
      }
    }
  },
);
