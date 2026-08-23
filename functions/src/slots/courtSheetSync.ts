/**
 * Mirror court hires and monthly plans into the spreadsheet.
 *
 * Their own tabs, not Payments_<centre>: this is facility income, and the
 * Payments tabs are cleared every month by the rollover, whereas rental rows
 * are the permanent record of what was sold. Keeping them apart also means the
 * fee-attendance reconciliation and the invoice sequence never see them.
 *
 * ── Every entry, not just the confirmed ones ──
 * This used to fire only on HELD → CONFIRMED, so a booking was invisible in
 * the sheet during exactly the window when someone needs to look at it: after
 * the money has supposedly arrived and before anyone has checked. Now every
 * write mirrors, and the row is updated in place — one row per booking, from
 * request through verification to cancellation, keyed on the booking id.
 *
 * ── Why rows are updated, never deleted ──
 * A cancelled hire is marked CANCELLED rather than removed. What was sold and
 * then reversed is exactly what someone reconciling a bank statement is
 * looking for; a vanished row just looks like a mistake in the bank.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { describeAddOns } from '@bba/shared';
import { getSheets, svcAppend, svcGet, svcUpdate, SPREADSHEET_ID } from '../fees/sheetsSync.js';

const REGION = 'asia-south1';
const BOOKING_TAB = 'Court_Rentals';
const PLAN_TAB = 'Court_Plans';

/** Last column of each tab — keep in step with the Apps Script headers. */
const BOOKING_LAST_COL = 'R';
const PLAN_LAST_COL = 'O';

/** Zero-based index of the id column each tab is keyed on. */
const BOOKING_ID_COL = 17;  // R
const PLAN_ID_COL = 1;      // B

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "05 Oct 2026". Built from an explicit month table rather than toLocaleDateString,
 *  which renders September as "Sept" under en-IN and breaks every text match. */
function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

function fmtMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function hour12(hhmm: string): string {
  const [h] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${ampm}`;
}

function rupees(paise: unknown): string {
  return String(Math.round((Number(paise) || 0) / 100));
}

function tsToIso(ts: unknown): string {
  if (!ts) return '';
  if (typeof ts === 'string') return ts;
  if (typeof ts === 'object' && ts && 'toDate' in ts) {
    return (ts as { toDate(): Date }).toDate().toISOString();
  }
  return '';
}

/**
 * Write a row, replacing the existing one for this id if there is one.
 *
 * Read-then-write, so two writes to the same document landing together could
 * in principle both append. In practice the gap between a booking arriving and
 * a human confirming it is minutes, and a plan's several bookings all carry
 * distinct ids, so there is nothing for them to collide on. Getting this
 * properly atomic would mean a lock the spreadsheet cannot offer.
 */
async function upsertRow(
  sheets: ReturnType<typeof getSheets>,
  tab: string,
  lastCol: string,
  idCol: number,
  id: string,
  row: string[],
): Promise<void> {
  const existing = await svcGet(sheets, {
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A:${lastCol}`,
  }).catch(() => null);

  const rows: string[][] = (existing?.data?.values as string[][]) ?? [];
  const foundIdx = rows.findIndex((r, i) => i > 0 && r[idCol] === id);

  if (foundIdx > 0) {
    await svcUpdate(sheets, {
      spreadsheetId: SPREADSHEET_ID,
      range: `${tab}!A${foundIdx + 1}:${lastCol}${foundIdx + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  } else {
    await svcAppend(sheets, {
      spreadsheetId: SPREADSHEET_ID,
      range: `${tab}!A:${lastCol}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  }
}

export const onCourtBookingSheetSync = onDocumentWritten(
  { document: 'courtBookings/{bookingId}', region: REGION, timeoutSeconds: 60 },
  async (event) => {
    if (!event.data) return;
    const bookingId = event.params.bookingId as string;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    const b = after ?? before;
    if (!b) return;

    // A multi-hour booking claims one lock document per hour, and only the
    // first carries the money. Mirroring the others would put a ₹0 row in the
    // sheet for every extra hour of every long booking — the row already says
    // how many hours it covers.
    if (typeof b.notes === 'string' && b.notes.startsWith('Part of ')) return;

    let sheets;
    try {
      sheets = getSheets();
    } catch {
      logger.warn('[courtSheet] Sheets not configured — skipping', { bookingId });
      return;
    }

    // A deleted document still deserves a row: it was sold at some point, and
    // the sheet is where that is reconciled against the bank.
    const status = !after ? 'DELETED' : String(b.status ?? 'HELD');

    const row = [
      new Date().toISOString(),
      `'${fmtDate(String(b.date))}`,          // text-forced: USER_ENTERED would
      hour12(String(b.startHour)),            // otherwise coerce it to a serial
      String(b.hours ?? 1),
      String(b.bookerName ?? ''),
      String(b.bookerPhone ?? ''),
      String(b.bookerEmail ?? ''),
      rupees(b.hourlyRatePaise),
      rupees(b.courtPaise ?? b.amountPaise),
      describeAddOns(b.addOns as Record<string, number>),
      rupees(b.addOnsPaise),
      rupees(b.amountPaise),
      String(b.source ?? 'ONLINE'),
      String(b.planId ?? ''),
      status,
      tsToIso(b.verifiedAt),
      String(b.screenshotUrl ?? ''),
      bookingId,
    ];

    try {
      await upsertRow(sheets, BOOKING_TAB, BOOKING_LAST_COL, BOOKING_ID_COL, bookingId, row);
      logger.info('[courtSheet] booking synced', { bookingId, status });
    } catch (err) {
      // Never throw: the booking is already correct in Firestore, which is the
      // source of truth. A sheet problem must not retry-loop against a booking
      // that is fine.
      logger.error('[courtSheet] booking sync failed', { bookingId, err });
    }
  },
);

/**
 * Mirror the plan itself, alongside the individual sessions it books.
 *
 * Both are wanted. The sessions are what actually happened on court and what
 * the money reconciles against; the plan is the arrangement, and without it a
 * reader has to infer from five rows sharing a Plan_ID that somebody bought a
 * month of Saturdays at the plan rate.
 */
export const onCourtPlanSheetSync = onDocumentWritten(
  { document: 'courtRentalPlans/{planId}', region: REGION, timeoutSeconds: 60 },
  async (event) => {
    if (!event.data) return;
    const planId = event.params.planId as string;
    const after = event.data.after.exists ? event.data.after.data() : null;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const p = after ?? before;
    if (!p) return;

    let sheets;
    try {
      sheets = getSheets();
    } catch {
      logger.warn('[courtSheet] Sheets not configured — skipping', { planId });
      return;
    }

    const booked: string[] = Array.isArray(p.bookedDates) ? p.bookedDates : [];
    const clashes: string[] = Array.isArray(p.clashDates) ? p.clashDates : [];
    const hours = Number(p.hours) || 1;
    const sessions = booked.length;

    const row = [
      new Date().toISOString(),
      planId,
      `'${fmtMonth(String(p.yearMonth))}`,     // text-forced, same reason as Date
      WEEKDAYS[Number(p.weekday) ?? 0] ?? '',
      hour12(String(p.startHour)),
      String(hours),
      String(p.bookerName ?? ''),
      String(p.bookerPhone ?? ''),
      String(p.bookerEmail ?? ''),
      rupees(p.hourlyRatePaise),
      String(sessions),
      rupees((Number(p.hourlyRatePaise) || 0) * sessions * hours),
      !after ? 'DELETED' : (p.active ? 'ACTIVE' : 'CANCELLED'),
      booked.map(fmtDate).join(', '),
      clashes.map(fmtDate).join(', '),
    ];

    try {
      await upsertRow(sheets, PLAN_TAB, PLAN_LAST_COL, PLAN_ID_COL, planId, row);
      logger.info('[courtSheet] plan synced', { planId, sessions });
    } catch (err) {
      logger.error('[courtSheet] plan sync failed', { planId, err });
    }
  },
);
