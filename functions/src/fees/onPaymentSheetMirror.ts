/**
 * Keeps the Google Sheet in step with a payment after its rows were written.
 *
 * The sheet used to be write-once: an invoice's rows were added when it was
 * paid and never touched again, so a refund, a waiver, a corrected amount, an
 * extended coverage or a deleted payment left the sheet saying "paid". This
 * mirrors those changes onto the existing rows (found by invoice number).
 *
 * The first transition into PAID is not handled here — onFeePaymentCreated
 * writes the rows then. Failures are recorded on the payment (sheetMirror),
 * never thrown, so they can't loop the trigger.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { paymentCoverage } from '@bba/shared';
import { mirrorPaymentChange } from './sheetsSync.js';

const REGION = 'asia-south1';

function relevant(p: FirebaseFirestore.DocumentData) {
  const cov = paymentCoverage({ month: p.month, coverageMonths: p.coverageMonths, coverageEndMonth: p.coverageEndMonth });
  return { status: p.status, amount: p.totalAmountPaise, end: cov.end };
}

export const onPaymentSheetMirror = onDocumentWritten(
  { document: 'payments/{paymentId}', region: REGION, timeoutSeconds: 60 },
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data()! : null;
    const after = event.data?.after?.exists ? event.data.after.data()! : null;
    if (!before) return;                                     // creation: handled elsewhere
    const p = after ?? before;
    const invoiceNo = String(p.externalInvoiceNo ?? '').trim();
    if (!invoiceNo) return;
    // Rows exist only once the payment was synced (or came from the sheet form).
    const inSheet = !!before.sideEffectsCompletedAt || before.paymentSource === 'SHEETS_FORM';
    if (!inSheet) return;

    const was = relevant(before);
    const now = after ? relevant(after) : null;
    if (now && was.status === now.status && was.amount === now.amount && was.end === now.end) return;

    const centreSnap = p.centreId ? await db.doc(`centres/${p.centreId}`).get() : null;
    const centreCode = (centreSnap?.data()?.centreCode as string) ?? '';

    try {
      const res = await mirrorPaymentChange({
        invoiceNo,
        centreCode,
        amountRupees: Math.round(((now?.amount ?? was.amount) as number) / 100),
        status: now ? String(now.status) : 'DELETED',
        coverageEndMonth: now?.end ?? null,
      });
      if (after) {
        await event.data!.after.ref.update({
          sheetMirror: { status: res.invoiceLog ? 'OK' : 'ROW_NOT_FOUND', at: new Date().toISOString() },
        });
      }
      logger.info('[sheetMirror] mirrored', { invoiceNo, ...res, status: now?.status ?? 'DELETED' });
    } catch (err) {
      logger.error('[sheetMirror] failed', { invoiceNo, err });
      if (after) {
        await event.data!.after.ref.update({
          sheetMirror: { status: 'FAILED', error: String((err as Error)?.message ?? err).slice(0, 200), at: new Date().toISOString() },
        }).catch(() => undefined);
      }
    }
  },
);
