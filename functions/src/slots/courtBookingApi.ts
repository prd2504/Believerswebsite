/**
 * Court booking reads and writes, server-side.
 *
 * ── Why this exists ──
 * `courtBookings` is admin-read-only, and rightly so: every document carries a
 * member of the public's name and phone number, and unlike slotBookings there
 * is no public "who's playing" view to justify opening it. But the booking
 * page has to know which hours are taken, and it is used by people who are not
 * signed in to anything. Reading the collection from that page was denied by
 * the rules, so availability came back empty and every date rendered as
 * "nothing free" — the page only ever appeared to work for whoever was already
 * signed in as an admin.
 *
 * The same wall blocked writes: a Firestore transaction reads before it
 * writes, so even the booking attempt would have failed on the read.
 *
 * So both move here. `courtAvailability` returns which hours are occupied and
 * nothing else — no names, no phones, no amounts — and the two create
 * endpoints do the transaction with the admin SDK.
 *
 * ── The clock ──
 * The server decides what "now" is. A phone with a wrong timezone, or a
 * curious person editing the request, must not be able to book an hour that
 * has already started or a date that has already passed.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../admin.js';
import { checkRateLimit } from '../fees/rateLimiter.js';
import { sendMail } from '../fees/mailer.js';
import { notifyTeam, rulesHtml, fmtDate, fmtINR, hour12 } from './onCourtBookingCreated.js';
import { logoImg } from '../fees/brand.js';
import {
  DEFAULT_COURT_CONFIG,
  buildDayAvailability,
  bookingHours,
  addOnsTotalPaise,
  istNow,
  isHourPast,
  datesInMonth,
  publicBookingHorizon,
  MAX_BOOKING_HOURS,
  type CourtRentalConfig,
  type CourtBookingDocument,
} from '@bba/shared';

const REGION = 'asia-south1';
const BOOKINGS = 'courtBookings';
const CONFIG = 'courtRentalConfig';
const PLANS = 'courtRentalPlans';

/** Widest range the availability endpoint will serve, in days. */
const MAX_RANGE_DAYS = 70;

function normPhone(s: unknown): string {
  const d = String(s ?? '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
}

function clientKey(req: { ip?: string; header(n: string): string | undefined }): string {
  return req.ip ?? req.header('x-forwarded-for') ?? 'anon';
}

async function loadConfig(centreId: string): Promise<CourtRentalConfig> {
  const snap = await db.collection(CONFIG).doc(centreId).get();
  const d = snap.exists ? (snap.data() as Record<string, unknown>) : {};
  return {
    centreId,
    isOpen: (d.isOpen as boolean) ?? DEFAULT_COURT_CONFIG.isOpen,
    nextMonthOpensOnDay: (d.nextMonthOpensOnDay as number) ?? DEFAULT_COURT_CONFIG.nextMonthOpensOnDay,
    hourlyRatePaise: (d.hourlyRatePaise as number) ?? DEFAULT_COURT_CONFIG.hourlyRatePaise,
    planHourlyRatePaise: (d.planHourlyRatePaise as number) ?? DEFAULT_COURT_CONFIG.planHourlyRatePaise,
    windows: (d.windows as CourtRentalConfig['windows']) ?? DEFAULT_COURT_CONFIG.windows,
    coachingWindows: (d.coachingWindows as CourtRentalConfig['coachingWindows']) ?? DEFAULT_COURT_CONFIG.coachingWindows,
    dateOverrides: (d.dateOverrides as CourtRentalConfig['dateOverrides']) ?? {},
    updatedAt: '',
    updatedBy: null,
  };
}

/** Occupying bookings in a date range, stripped to what availability needs. */
async function occupiedInRange(
  centreId: string, from: string, to: string,
): Promise<Pick<CourtBookingDocument, 'id' | 'date' | 'startHour' | 'hours' | 'status' | 'bookerName'>[]> {
  const snap = await db.collection(BOOKINGS)
    .where('centreId', '==', centreId)
    .where('date', '>=', from)
    .where('date', '<=', to)
    .get();
  return snap.docs.map((doc) => {
    const b = doc.data();
    return {
      id: doc.id,
      date: b.date,
      startHour: b.startHour,
      hours: b.hours ?? 1,
      status: b.status,
      // Deliberately blank. The public grid shows an hour as taken; it does
      // not show who took it. That is the whole reason this endpoint exists.
      bookerName: '',
    };
  });
}

/**
 * Public availability. Returns the server's clock alongside the slots, so the
 * page shows the court's time rather than the device's.
 */
export const courtAvailability = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 30 },
  async (req, res): Promise<void> => {
    const centreId = String(req.query.centreId ?? '');
    const from = String(req.query.from ?? '');
    const to = String(req.query.to ?? '');
    if (!centreId || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
      res.status(400).json({ ok: false, error: 'centreId, from and to (YYYY-MM-DD) are required' });
      return;
    }
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (span > MAX_RANGE_DAYS) {
      res.status(400).json({ ok: false, error: 'Range too wide' });
      return;
    }
    if (!checkRateLimit(`courtavail:${clientKey(req)}`, 120, 10 * 60 * 1000)) {
      res.status(429).json({ ok: false, error: 'Too many requests' });
      return;
    }

    try {
      const [cfg, bookings] = await Promise.all([
        loadConfig(centreId),
        occupiedInRange(centreId, from, to),
      ]);
      const now = istNow();

      // Next month is not on sale until the 25th. Clamping here rather than
      // trusting the query means the rule holds however the page asks.
      const horizon = publicBookingHorizon(now, cfg.nextMonthOpensOnDay);
      const end = to < horizon ? to : horizon;

      // Walk the range day by day rather than by month, so a window that
      // spans three calendar months does not silently drop the middle one.
      const days: Record<string, { hour: string; endHour: string; state: string; ratePaise: number }[]> = {};
      for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
        const date = new Date(t).toISOString().slice(0, 10);
        const slots = buildDayAvailability(cfg, date, bookings, now)
          .map(({ hour, endHour, state, ratePaise }) => ({ hour, endHour, state, ratePaise }));
        if (slots.length > 0) days[date] = slots;
      }

      res.status(200).json({
        ok: true,
        now,
        // The page uses this to decide whether to offer a next-month tab at
        // all, rather than showing an empty one.
        horizon,
        isOpen: cfg.isOpen,
        hourlyRatePaise: cfg.hourlyRatePaise,
        planHourlyRatePaise: cfg.planHourlyRatePaise,
        days,
      });
    } catch (err) {
      logger.error('[courtAvailability] failed', { err });
      res.status(500).json({ ok: false, error: 'Could not load availability' });
    }
  },
);

interface BookArgs {
  centreId: string;
  date: string;
  startHour: string;
  hours: number;
  bookerName: string;
  bookerPhone: string;
  bookerEmail: string | null;
  addOns: Record<string, number>;
  screenshotUrl: string | null;
  planId: string | null;
  ratePaise: number;
  source: 'ONLINE' | 'MONTHLY_PLAN';
}

class Unavailable extends Error {}

/**
 * Claim the hours for one date, atomically.
 *
 * The deterministic id `{centreId}_{date}_{hour}` is the concurrency
 * primitive: two people paying for the same hour a second apart contend on
 * the same document and exactly one wins. A read-then-write check would let
 * both through, because both would read "free" before either wrote.
 */
async function claimHours(a: BookArgs): Promise<string> {
  const hours = Math.max(1, Math.min(MAX_BOOKING_HOURS, a.hours));
  const wanted = bookingHours(a.startHour, hours);
  const bookingId = `${a.centreId}_${a.date}_${a.startHour.replace(':', '')}`;
  const addOnsPaise = addOnsTotalPaise(a.addOns);
  const courtPaise = a.ratePaise * hours;

  await db.runTransaction(async (tx) => {
    const refs = wanted.map((h) => db.collection(BOOKINGS).doc(`${a.centreId}_${a.date}_${h.replace(':', '')}`));
    const snaps = await tx.getAll(...refs);
    snaps.forEach((s) => {
      const existing = s.exists ? s.data() : null;
      if (existing && existing.status !== 'CANCELLED') {
        throw new Unavailable('Someone just booked that time. Please pick another slot.');
      }
    });

    const now = FieldValue.serverTimestamp();
    refs.forEach((ref, i) => {
      tx.set(ref, {
        centreId: a.centreId,
        date: a.date,
        startHour: wanted[i],
        hours: 1,
        bookerName: a.bookerName,
        bookerPhone: a.bookerPhone,
        bookerEmail: a.bookerEmail,
        hourlyRatePaise: a.ratePaise,
        // Money rides on the FIRST lock document only, so a two-hour booking
        // is not counted as two full-price bookings in the P&L, and the
        // notification trigger sends one email rather than one per hour.
        courtPaise: i === 0 ? courtPaise : 0,
        addOns: i === 0 ? a.addOns : {},
        addOnsPaise: i === 0 ? addOnsPaise : 0,
        amountPaise: i === 0 ? courtPaise + addOnsPaise : 0,
        status: 'HELD',
        source: a.source,
        planId: a.planId,
        screenshotUrl: a.screenshotUrl,
        notes: i === 0 ? null : `Part of ${bookingId}`,
        verifiedBy: null,
        verifiedAt: null,
        createdAt: now,
        updatedAt: now,
        createdBy: a.source,
        updatedBy: a.source,
      });
    });
  });

  return bookingId;
}

/** Shared validation for both create endpoints. Returns an error string or null. */
function validateBooker(b: Record<string, any>): string | null {
  if (String(b.bookerName ?? '').trim().length < 2) return 'Name is required';
  if (normPhone(b.bookerPhone).length !== 10) return 'A 10-digit phone number is required';
  if (b.bookerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.bookerEmail))) return 'That email address looks wrong';
  return null;
}

/** Add-on quantities, clamped. Anything unrecognised is dropped. */
function cleanAddOns(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Math.floor(Number(v));
    if (Number.isFinite(n) && n > 0) out[k] = Math.min(10, n);
  }
  return out;
}

export const createCourtBookingPublic = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 60 },
  async (req, res): Promise<void> => {
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
    const b = req.body ?? {};

    const bad = validateBooker(b);
    if (bad) { res.status(400).json({ ok: false, error: bad }); return; }
    if (!b.centreId || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) || !/^\d{2}:\d{2}$/.test(String(b.startHour))) {
      res.status(400).json({ ok: false, error: 'centreId, date and startHour are required' });
      return;
    }
    if (!checkRateLimit(`courtbook:${clientKey(req)}`, 10, 10 * 60 * 1000)) {
      res.status(429).json({ ok: false, error: 'Too many requests. Try again shortly.' });
      return;
    }

    try {
      const cfg = await loadConfig(b.centreId);
      if (!cfg.isOpen) { res.status(409).json({ ok: false, error: 'Court booking is currently closed.' }); return; }

      const now = istNow();
      const hours = Math.max(1, Math.min(MAX_BOOKING_HOURS, Number(b.hours) || 1));

      const horizon = publicBookingHorizon(now, cfg.nextMonthOpensOnDay);
      if (String(b.date) > horizon) {
        res.status(409).json({ ok: false, error: 'That date isn\'t open for booking yet.' });
        return;
      }

      // Checked here and not only in the browser: a device clock is a
      // suggestion. Every hour of a multi-hour block is tested, not just the
      // first, so a block cannot straddle the current moment.
      for (const h of bookingHours(String(b.startHour), hours)) {
        if (isHourPast(String(b.date), h, now)) {
          res.status(409).json({ ok: false, error: 'That time has already passed. Please pick a later slot.' });
          return;
        }
      }

      const dayBookings = await occupiedInRange(b.centreId, b.date, b.date);
      const slots = buildDayAvailability(cfg, b.date, dayBookings, now);
      const byHour = new Map(slots.map((s) => [s.hour, s]));
      for (const h of bookingHours(String(b.startHour), hours)) {
        if (byHour.get(h)?.state !== 'AVAILABLE') {
          res.status(409).json({ ok: false, error: 'That time is no longer available. Please pick another slot.' });
          return;
        }
      }

      const bookingId = await claimHours({
        centreId: b.centreId,
        date: b.date,
        startHour: b.startHour,
        hours,
        bookerName: String(b.bookerName).trim(),
        bookerPhone: normPhone(b.bookerPhone),
        bookerEmail: b.bookerEmail ? String(b.bookerEmail).trim() : null,
        addOns: cleanAddOns(b.addOns),
        screenshotUrl: b.screenshotUrl ? String(b.screenshotUrl) : null,
        planId: null,
        ratePaise: cfg.hourlyRatePaise,
        source: 'ONLINE',
      });

      res.status(201).json({ ok: true, bookingId });
    } catch (err: any) {
      if (err instanceof Unavailable) {
        res.status(409).json({ ok: false, error: err.message });
        return;
      }
      logger.error('[createCourtBookingPublic] failed', { err });
      res.status(500).json({ ok: false, error: 'Could not create the booking' });
    }
  },
);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Confirmation for a whole plan, listing every date it holds.
 *
 * The dates are the point: someone paying for five Saturdays needs to see
 * which five, and — when an hour was already gone — which one they are not
 * getting, in the same email rather than in a phone call later.
 */
function planEmailHtml(p: {
  name: string; weekday: number; startHour: string;
  booked: string[]; clashes: string[]; ratePaise: number; totalPaise: number;
}): string {
  const rows = p.booked.map((d) =>
    `<li style="margin:0 0 6px;font-size:13px;color:#334155">${fmtDate(d)}</li>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#0A0A0A;padding:20px 24px">
    <table role="presentation" style="border-collapse:collapse"><tr>
      <td style="padding-right:12px;vertical-align:middle">${logoImg(40)}</td>
      <td style="vertical-align:middle">
        <h2 style="margin:0;font-size:17px;color:#fff">BBA Sports Academy</h2>
        <p style="margin:4px 0 0;font-size:12px;color:#E84C1E">Monthly court plan received</p>
      </td>
    </tr></table>
  </div>

  <div style="background:#fff8f5;padding:14px 24px;border-bottom:1px solid #e2e8f0">
    <p style="margin:0;font-size:14px;color:#9a3412;font-weight:600">
      ${p.name}, your ${WEEKDAYS[p.weekday]} ${hour12(p.startHour)} hour is held for the month.
      We&rsquo;ll confirm once the payment is verified.
    </p>
  </div>

  <div style="padding:22px 24px">
    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;letter-spacing:1.5px;text-transform:uppercase">
      Your dates
    </p>
    <ul style="margin:0 0 16px;padding-left:18px">${rows}</ul>

    ${p.clashes.length ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 16px;margin-bottom:16px">
      <p style="margin:0;font-size:13px;color:#9a3412">
        We couldn&rsquo;t include ${p.clashes.map(fmtDate).join(', ')} &mdash; that hour was already taken.
        We&rsquo;ll call you about the difference before charging for it.
      </p>
    </div>` : ''}

    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px">
      <tr><td style="padding:5px 0;color:#64748b;width:45%">Rate</td>
          <td style="padding:5px 0;color:#0A0A0A">${fmtINR(p.ratePaise)}/hour (plan rate)</td></tr>
      <tr><td style="padding:8px 0 5px;color:#64748b;border-top:1px solid #e2e8f0">Total</td>
          <td style="padding:8px 0 5px;font-weight:700;font-size:15px;color:#0A0A0A;border-top:1px solid #e2e8f0">${fmtINR(p.totalPaise)}</td></tr>
    </table>

    <div style="background:#fff8f5;border:1px solid #fce0d4;border-radius:8px;padding:16px 18px">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#E84C1E;letter-spacing:1.5px;text-transform:uppercase">
        Court rules &mdash; please read
      </p>
      <ul style="margin:0;padding-left:18px">${rulesHtml()}</ul>
    </div>

    <p style="margin:18px 0 0;font-size:12px;color:#64748b;line-height:1.6">
      A week you can&rsquo;t make isn&rsquo;t credited &mdash; the hour is reserved for you and can&rsquo;t be resold,
      which is what the lower rate pays for. Questions? Reply to this email or contact us at hello@bbashuttle.com.
    </p>
  </div>
</div></body></html>`;
}

/**
 * Monthly plan: one weekday hour, every week of a month, at the plan rate.
 *
 * Occurrences are booked individually and clashes are REPORTED rather than
 * thrown. If four of five Saturdays are free, booking those four and telling
 * everyone about the fifth beats refusing the lot — the customer keeps the
 * hours they can have, and the team has one date to sort out instead of a
 * lost sale.
 *
 * The page prices the plan on what it was told is free, so a clash here means
 * the customer has paid for an hour they did not get. The response says
 * exactly which dates those are, the page tells them so in plain words, and
 * the team is notified with the same list.
 */
export const createCourtPlanPublic = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 120 },
  async (req, res): Promise<void> => {
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
    const b = req.body ?? {};

    const bad = validateBooker(b);
    if (bad) { res.status(400).json({ ok: false, error: bad }); return; }
    const weekday = Number(b.weekday);
    if (!b.centreId || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      res.status(400).json({ ok: false, error: 'centreId and weekday are required' });
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(String(b.yearMonth)) || !/^\d{2}:\d{2}$/.test(String(b.startHour))) {
      res.status(400).json({ ok: false, error: 'yearMonth and startHour are required' });
      return;
    }
    if (!checkRateLimit(`courtplan:${clientKey(req)}`, 5, 60 * 60 * 1000)) {
      res.status(429).json({ ok: false, error: 'Too many requests. Try again shortly.' });
      return;
    }

    try {
      const cfg = await loadConfig(b.centreId);
      if (!cfg.isOpen) { res.status(409).json({ ok: false, error: 'Court booking is currently closed.' }); return; }

      const now = istNow();
      const hours = Math.max(1, Math.min(MAX_BOOKING_HOURS, Number(b.hours) || 1));
      const rate = cfg.planHourlyRatePaise;
      const yearMonth = String(b.yearMonth);
      const planId = `${b.centreId}_${yearMonth}_${weekday}_${String(b.startHour).replace(':', '')}`;

      const horizon = publicBookingHorizon(now, cfg.nextMonthOpensOnDay);
      if (`${yearMonth}-01` > horizon) {
        res.status(409).json({ ok: false, error: 'That month isn\'t open for booking yet.' });
        return;
      }

      const candidates = datesInMonth(yearMonth).filter((d) => d <= horizon).filter((d) => {
        const [y, m, dd] = d.split('-').map(Number);
        return new Date(y, m - 1, dd).getDay() === weekday
          && !bookingHours(String(b.startHour), hours).some((h) => isHourPast(d, h, now));
      });

      if (candidates.length === 0) {
        res.status(409).json({ ok: false, error: 'No dates left in that month for this slot.' });
        return;
      }

      const monthBookings = await occupiedInRange(b.centreId, `${yearMonth}-01`, `${yearMonth}-31`);

      const booked: string[] = [];
      const clashes: string[] = [];
      for (const date of candidates) {
        const slots = buildDayAvailability(cfg, date, monthBookings, now);
        const byHour = new Map(slots.map((s) => [s.hour, s]));
        const free = bookingHours(String(b.startHour), hours).every((h) => byHour.get(h)?.state === 'AVAILABLE');
        if (!free) { clashes.push(date); continue; }
        try {
          await claimHours({
            centreId: b.centreId,
            date,
            startHour: b.startHour,
            hours,
            bookerName: String(b.bookerName).trim(),
            bookerPhone: normPhone(b.bookerPhone),
            bookerEmail: b.bookerEmail ? String(b.bookerEmail).trim() : null,
            addOns: {},
            screenshotUrl: b.screenshotUrl ? String(b.screenshotUrl) : null,
            planId,
            ratePaise: rate,
            source: 'MONTHLY_PLAN',
          });
          booked.push(date);
        } catch {
          // Lost the race between the availability read above and the write.
          clashes.push(date);
        }
      }

      if (booked.length === 0) {
        res.status(409).json({ ok: false, error: 'That weekly slot is already taken for this month.' });
        return;
      }

      await db.collection(PLANS).doc(planId).set({
        centreId: b.centreId,
        bookerName: String(b.bookerName).trim(),
        bookerPhone: normPhone(b.bookerPhone),
        bookerEmail: b.bookerEmail ? String(b.bookerEmail).trim() : null,
        weekday,
        startHour: b.startHour,
        hours,
        yearMonth,
        hourlyRatePaise: rate,
        active: true,
        bookedDates: booked,
        clashDates: clashes,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: 'ONLINE',
      }, { merge: true });

      const totalPaise = booked.length * rate * hours;

      // One notification for the whole plan. The per-booking trigger skips
      // anything carrying a planId precisely so this can be the only message.
      await notifyTeam(
        `🔁 Monthly court plan\n${String(b.bookerName).trim()} · ${normPhone(b.bookerPhone)}\n` +
        `${WEEKDAYS[weekday]}s at ${hour12(String(b.startHour))} · ${booked.length} session(s) in ${yearMonth}\n` +
        `Amount: ${fmtINR(totalPaise)}` +
        (clashes.length ? `\n⚠️ Could not book: ${clashes.join(', ')}` : '') +
        `\nStatus: awaiting payment verification`,
      );

      if (b.bookerEmail) {
        try {
          await sendMail({
            to: String(b.bookerEmail).trim(),
            subject: `Monthly court plan received — ${WEEKDAYS[weekday]}s | BBA Sports`,
            html: planEmailHtml({
              name: String(b.bookerName).trim(),
              weekday,
              startHour: String(b.startHour),
              booked,
              clashes,
              ratePaise: rate,
              totalPaise,
            }),
          });
        } catch (err) {
          // The plan is already booked and correct. A mail failure must not
          // turn into a 500 that makes the caller think it wasn't.
          logger.error('[createCourtPlanPublic] email failed', { planId, err });
        }
      }

      res.status(201).json({
        ok: true,
        planId,
        booked,
        clashes,
        totalPaise,
      });
    } catch (err) {
      logger.error('[createCourtPlanPublic] failed', { err });
      res.status(500).json({ ok: false, error: 'Could not create the plan' });
    }
  },
);
