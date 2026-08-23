/**
 * Mirror a confirmed court hire into the Court_Rentals sheet tab.
 *
 * Its own tab, not Payments_<centre>: this is facility income, and the
 * Payments tabs are cleared every month by the rollover, whereas rental rows
 * are the permanent record of what was sold. Keeping them apart also means
 * the fee-attendance reconciliation and the invoice sequence never see them.
 *
 * Fires on the HELD → CONFIRMED transition, so an unverified hold never
 * reaches the sheet. Reverses on un-confirm, the same way onPayrollPaid
 * reverses a salary expense, so a mistaken confirmation can be taken back.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getSheets, svcAppend, svcGet, svcUpdate, SPREADSHEET_ID } from '../fees/sheetsSync.js';

const REGION = 'asia-south1';
const TAB = 'Court_Rentals';

/** "05 Oct 2026" in IST. */
function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

function hour12(hhmm: string): string {
  const [h] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${ampm}`;
}

export const onCourtBookingConfirmed = onDocumentWritten(
  { document: 'courtBookings/{bookingId}', region: REGION, timeoutSeconds: 60 },
  async (event) => {
    if (!event.data) return;
    const bookingId = event.params.bookingId as string;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;

    const wasConfirmed = before?.status === 'CONFIRMED';
    const isConfirmed = after?.status === 'CONFIRMED';
    if (wasConfirmed === isConfirmed) return;   // nothing changed that we mirror

    let sheets;
    try {
      sheets = getSheets();
    } catch (err) {
      logger.warn('[courtRentals] Sheets not configured — skipping', { bookingId });
      return;
    }

    try {
      // Locate an existing row for this booking so a re-confirm updates rather
      // than appending a duplicate.
      const existing = await svcGet(sheets, {
        spreadsheetId: SPREADSHEET_ID,
        range: `${TAB}!A:K`,
      }).catch(() => null);

      const rows: string[][] = (existing?.data?.values as string[][]) ?? [];
      const idCol = 10; // K — Booking_ID
      const foundIdx = rows.findIndex((r, i) => i > 0 && r[idCol] === bookingId);

      if (!isConfirmed) {
        // Un-confirmed: mark the row cancelled rather than deleting it, so the
        // history of what was sold and then reversed stays visible.
        if (foundIdx > 0) {
          await svcUpdate(sheets, {
            spreadsheetId: SPREADSHEET_ID,
            range: `${TAB}!J${foundIdx + 1}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['CANCELLED']] },
          });
          logger.info('[courtRentals] reversed', { bookingId });
        }
        return;
      }

      const b = after!;
      const row = [
        new Date().toISOString(),
        `'${fmtDate(b.date as string)}`,   // text-forced, same reason as the Month column
        hour12(b.startHour as string),
        String(b.hours ?? 1),
        b.bookerName ?? '',
        b.bookerPhone ?? '',
        String(Math.round((b.hourlyRatePaise ?? 0) / 100)),
        String(Math.round((b.amountPaise ?? 0) / 100)),
        b.source ?? 'ONLINE',
        'CONFIRMED',
        bookingId,
      ];

      if (foundIdx > 0) {
        await svcUpdate(sheets, {
          spreadsheetId: SPREADSHEET_ID,
          range: `${TAB}!A${foundIdx + 1}:K${foundIdx + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [row] },
        });
      } else {
        await svcAppend(sheets, {
          spreadsheetId: SPREADSHEET_ID,
          range: `${TAB}!A:K`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [row] },
        });
      }
      logger.info('[courtRentals] synced', { bookingId, amount: b.amountPaise });
    } catch (err) {
      // Never throw: the booking is already correct in Firestore, and the
      // webapp is the source of truth. A sheet problem must not retry-loop
      // against a booking that is fine.
      logger.error('[courtRentals] sheet sync failed', { bookingId, err });
    }
  },
);
