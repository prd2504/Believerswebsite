/**
 * Court booking notifications: email to the booker, Telegram push to the team.
 *
 * Fires on create (HELD) and again on confirmation, because the two carry
 * different information — "we have your slot, here are the rules" versus
 * "payment received, you're on".
 *
 * ── Why a webhook rather than writing to the JarvisOS repo ──
 * The alternative was having this function commit to 11_DATA/OUTBOX.json via
 * the GitHub API. That works and is already proven for scheduled agents, but
 * it would give a customer-facing payment surface write access to a personal
 * automation repo, and adds ~2 minutes of poll latency to a message whose
 * whole value is immediacy. A booking notification that arrives two minutes
 * late is a booking someone has already phoned about.
 *
 * So this POSTs to a single configured endpoint with a shared secret. The
 * relay side needs a small authenticated route (see JARVIS_NOTIFY_URL below);
 * until that exists, the env var is simply unset and this no-ops quietly.
 * Nothing here knows anything about Telegram, chat ids, or the repo layout —
 * if the delivery mechanism changes, only the relay changes.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { sendMail } from '../fees/mailer.js';
import { COURT_RULES, describeAddOns, formatHourRange, INCLUDED_PLAYERS } from '@bba/shared';
import { logoImg } from '../fees/brand.js';

const REGION = 'asia-south1';

export function fmtINR(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Math.round(paise / 100));
}

export function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function hour12(hhmm: string): string {
  const [h] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}${ampm}`;
}

/**
 * Push a line to the team's Telegram via the relay.
 *
 * Best-effort by design: a booking must never fail because a notification
 * could not be delivered. Failures are logged and swallowed.
 */
export async function notifyTeam(text: string): Promise<void> {
  const url = process.env.JARVIS_NOTIFY_URL;
  const secret = process.env.JARVIS_NOTIFY_SECRET;
  if (!url || !secret) {
    logger.info('[courtNotify] JARVIS_NOTIFY_URL not set — skipping push', { text });
    return;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-jarvis-secret': secret },
      body: JSON.stringify({ to: 'jaydeep', text, source: 'court-booking' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn('[courtNotify] relay rejected', { status: res.status });
    }
  } catch (err) {
    logger.warn('[courtNotify] relay unreachable', { err: String(err) });
  }
}

export function rulesHtml(): string {
  return COURT_RULES.map((r) =>
    `<li style="margin:0 0 7px;font-size:13px;color:#334155;line-height:1.5">${r}</li>`).join('');
}

function bookingEmailHtml(b: Record<string, any>, confirmed: boolean): string {
  const addOns = describeAddOns(b.addOns);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#0A0A0A;padding:20px 24px">
    <table role="presentation" style="border-collapse:collapse"><tr>
      <td style="padding-right:12px;vertical-align:middle">${logoImg(40)}</td>
      <td style="vertical-align:middle">
        <h2 style="margin:0;font-size:17px;color:#fff">BBA Sports Academy</h2>
        <p style="margin:4px 0 0;font-size:12px;color:#E84C1E">${confirmed ? 'Booking confirmed' : 'Booking received'}</p>
      </td>
    </tr></table>
  </div>

  <div style="background:${confirmed ? '#f0fdf4' : '#fff8f5'};padding:14px 24px;border-bottom:1px solid #e2e8f0">
    <p style="margin:0;font-size:14px;color:${confirmed ? '#15803d' : '#9a3412'};font-weight:600">
      ${confirmed
        ? 'Your court is booked. See you there.'
        : 'Your slot is held. We&rsquo;ll confirm once the payment is verified.'}
    </p>
  </div>

  <div style="padding:22px 24px">
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px">
      <tr><td style="padding:5px 0;color:#64748b;width:38%">Date</td>
          <td style="padding:5px 0;font-weight:600;color:#0A0A0A">${fmtDate(b.date)}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b">Time</td>
          <td style="padding:5px 0;font-weight:600;color:#0A0A0A">${formatHourRange(b.startHour, b.hours ?? 1)}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b">Court time</td>
          <td style="padding:5px 0;color:#0A0A0A">${fmtINR(b.courtPaise ?? b.amountPaise ?? 0)}</td></tr>
      ${addOns ? `<tr><td style="padding:5px 0;color:#64748b">Extras</td>
          <td style="padding:5px 0;color:#0A0A0A">${addOns} — ${fmtINR(b.addOnsPaise ?? 0)}</td></tr>` : ''}
      ${(b.guestPaise ?? 0) > 0 ? `<tr><td style="padding:5px 0;color:#64748b">Guests</td>
          <td style="padding:5px 0;color:#0A0A0A">${(b.players ?? 0) - INCLUDED_PLAYERS} over ${INCLUDED_PLAYERS} — ${fmtINR(b.guestPaise)}</td></tr>` : ''}
      <tr><td style="padding:8px 0 5px;color:#64748b;border-top:1px solid #e2e8f0">Total</td>
          <td style="padding:8px 0 5px;font-weight:700;font-size:15px;color:#0A0A0A;border-top:1px solid #e2e8f0">${fmtINR(b.amountPaise ?? 0)}</td></tr>
    </table>

    <div style="background:#fff8f5;border:1px solid #fce0d4;border-radius:8px;padding:16px 18px">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#E84C1E;letter-spacing:1.5px;text-transform:uppercase">
        Court rules — please read
      </p>
      <ul style="margin:0;padding-left:18px">${rulesHtml()}</ul>
    </div>

    ${confirmed ? '' : `<div style="margin-top:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px">
      <p style="margin:0 0 6px;font-size:12px;color:#334155">
        Couldn&rsquo;t complete the payment? Pay from any UPI app to:
      </p>
      <p style="margin:0;font-size:15px;font-weight:700;font-family:monospace;color:#0A0A0A">85287401@ubin</p>
      <p style="margin:6px 0 0;font-size:11px;color:#64748b">
        Send ${fmtINR(b.amountPaise ?? 0)} and reply with the screenshot.
      </p>
    </div>`}

    <p style="margin:18px 0 0;font-size:12px;color:#64748b;line-height:1.6">
      Questions? Reply to this email or contact us at hello@bbashuttle.com.
    </p>
  </div>
</div></body></html>`;
}

export const onCourtBookingCreated = onDocumentWritten(
  { document: 'courtBookings/{bookingId}', region: REGION, timeoutSeconds: 60 },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after) return;

    // Only the money-bearing lock document represents the booking; the
    // extra per-hour rows of a multi-hour booking would otherwise send a
    // duplicate email and a duplicate Telegram line for the same person.
    if ((after.amountPaise ?? 0) <= 0) return;

    // A monthly plan books four or five separate dates, each of which is a
    // money-bearing document in its own right. Left alone, one plan would send
    // five near-identical emails and five Telegram lines. The plan endpoint
    // sends a single summary instead — see createCourtPlanPublic.
    if (after.planId) return;

    const isNew = !before;
    const justConfirmed = before?.status !== 'CONFIRMED' && after.status === 'CONFIRMED';
    if (!isNew && !justConfirmed) return;

    const when = `${fmtDate(after.date)}, ${formatHourRange(after.startHour, after.hours ?? 1)}`;
    const addOns = describeAddOns(after.addOns);

    // ── Telegram ──
    if (isNew) {
      await notifyTeam(
        `🏸 New court booking\n${after.bookerName} · ${after.bookerPhone}\n${when}` +
        `${(after.players ?? 0) > INCLUDED_PLAYERS ? `\nPlayers: ${after.players} (${after.players - INCLUDED_PLAYERS} guest)` : ''}` +
        `${addOns ? `\nExtras: ${addOns}` : ''}` +
        `\nAmount: ${fmtINR(after.amountPaise)}\nStatus: awaiting payment verification`,
      );
    } else if (justConfirmed) {
      await notifyTeam(`✅ Court booking confirmed\n${after.bookerName} · ${when} · ${fmtINR(after.amountPaise)}`);
    }

    // ── Email the booker ──
    if (!after.bookerEmail) {
      logger.info('[courtNotify] no email on booking — skipping mail', { id: event.params.bookingId });
      return;
    }
    try {
      await sendMail({
        to: after.bookerEmail,
        subject: justConfirmed
          ? `Court booking confirmed — ${fmtDate(after.date)} | BBA Sports`
          : `Court booking received — ${fmtDate(after.date)} | BBA Sports`,
        html: bookingEmailHtml(after, justConfirmed),
      });
    } catch (err) {
      // Never throw: the booking is already correct, and a mail failure must
      // not retry-loop against a document that is fine.
      logger.error('[courtNotify] email failed', { id: event.params.bookingId, err });
    }
  },
);

/**
 * Nudge repeat bookers toward a monthly plan.
 *
 * Runs weekly. Anyone with 3+ confirmed hours in the last 28 days is paying
 * ad-hoc for what a plan would cover more cheaply, so the team gets a list to
 * offer it to. Deliberately a prompt to a human rather than an automatic
 * upsell email — a plan reserves a specific weekly hour, which needs a
 * conversation about which hour.
 */
export async function findMonthlyPlanCandidates(centreId: string, now = new Date()): Promise<
  { phone: string; name: string; bookings: number; spentPaise: number }[]
> {
  const from = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const snap = await db.collection('courtBookings')
    .where('centreId', '==', centreId)
    .where('date', '>=', iso(from))
    .where('date', '<=', iso(now))
    .get();

  const byPhone = new Map<string, { phone: string; name: string; bookings: number; spentPaise: number }>();
  snap.docs.forEach((d) => {
    const b = d.data();
    if (b.status !== 'CONFIRMED') return;
    if ((b.amountPaise ?? 0) <= 0) return;      // secondary lock row
    if (b.planId) return;                        // already on a plan
    const key = String(b.bookerPhone ?? '');
    if (!key) return;
    const cur = byPhone.get(key) ?? { phone: key, name: b.bookerName ?? '', bookings: 0, spentPaise: 0 };
    cur.bookings += 1;
    cur.spentPaise += b.amountPaise ?? 0;
    byPhone.set(key, cur);
  });

  return Array.from(byPhone.values())
    .filter((c) => c.bookings >= 3)
    .sort((a, b) => b.bookings - a.bookings);
}
