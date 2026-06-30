import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { buildInvoiceHtml } from './invoiceEmailTemplate.js';
import { buildWelcomeHtml } from './welcomeEmailTemplate.js';
import { syncPublicFeePayment } from './sheetsSync.js';
import { sendMail } from './mailer.js';

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/**
 * Fires when a public /fees payment is recorded. Runs all the slow side-effects
 * asynchronously — Google Sheets sync (Player_Directory, Invoice_Log,
 * Payments_<centre>, Centre_Config mirror, admin_logs) and the invoice + welcome
 * emails — so submitFeePayment can return immediately and the payer isn't kept
 * waiting on ~6 Sheets API calls + SMTP.
 */
export const onFeePaymentCreated = onDocumentWritten(
  {
    document: 'payments/{paymentId}',
    region: 'asia-south1',
    timeoutSeconds: 120,
  },
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;
    const after = afterSnap.data()!;

    // Only the public /fees page (SHEETS_FORM is handled by the Apps Script).
    if (after.paymentSource !== 'PUBLIC_FEES_PAGE') return;
    if (after.status !== 'PAID') return;

    // Fire once — only when status transitions into PAID.
    const beforeSnap = event.data?.before;
    if (beforeSnap?.exists && beforeSnap.data()!.status === 'PAID') return;

    const studentId = after.studentId as string;
    if (!studentId) return;

    const studentDoc = await db.doc(`students/${studentId}`).get();
    if (!studentDoc.exists) {
      logger.warn(`[onFeePaymentCreated] Student ${studentId} not found`);
      return;
    }
    const student = studentDoc.data()!;

    // Centre (name, code, and the latest counters to mirror).
    const centreId = after.centreId as string;
    let centreData: Record<string, any> = {};
    if (centreId) {
      const centreDoc = await db.doc(`centres/${centreId}`).get();
      if (centreDoc.exists) centreData = centreDoc.data()!;
    }
    const centreName = (centreData.name as string) ?? centreId ?? '—';
    const centreCode = (centreData.centreCode as string) ?? '';

    // Batch name.
    const batchId = after.batchId as string;
    let batchName = '';
    if (batchId) {
      const batchDoc = await db.doc(`batches/${batchId}`).get();
      if (batchDoc.exists) batchName = (batchDoc.data()!.name as string) ?? '';
    }

    // ── Idempotency claim ──
    // Eventarc delivers at-least-once, so this trigger can fire more than once
    // for the same payment (transient platform retries, redelivery under load).
    // Without a guard, a redelivery would append a second Invoice_Log /
    // Payments_<centre> row and send a second invoice email — corrupting the
    // CA's records and confusing the payer. Claim the side-effects atomically so
    // they run exactly once. Placed after the lookups above so a transient read
    // failure there still lets the platform retry the whole trigger cleanly.
    const paymentRef = db.doc(`payments/${event.params.paymentId}`);
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(paymentRef);
      if (!snap.exists) return false;
      if (snap.data()!.sideEffectsCompletedAt) return false; // already handled
      tx.update(paymentRef, { sideEffectsCompletedAt: new Date().toISOString() });
      return true;
    });
    if (!claimed) {
      logger.info('[onFeePaymentCreated] Side-effects already done — skipping duplicate delivery', {
        paymentId: event.params.paymentId,
      });
      return;
    }

    // ── Google Sheets sync (best-effort; never throws) ──
    let isNewStudent = false;
    try {
      const res = await syncPublicFeePayment({
        externalInvoiceNo: (after.externalInvoiceNo as string) ?? '',
        nowIso: (after.paidAt as string) ?? new Date().toISOString(),
        externalStudentId: (student.externalStudentId as string) ?? null,
        studentName: (student.name as string) ?? '—',
        phone: (student.phone as string) ?? null,
        email: (student.email as string) ?? null,
        centreName,
        centreCode,
        month: after.month as string,
        batchName,
        amountRupees: Math.round((after.totalAmountPaise as number) / 100),
        method: after.method as string,
        coachName: (after.coachName as string) ?? null,
        screenshotUrl: (after.screenshotUrl as string) ?? null,
        lastInvoiceNo: (centreData.lastInvoiceNo as number) ?? null,
        lastStudentNo: (centreData.lastStudentNo as number) ?? null,
      });
      isNewStudent = res.isNewStudent;
      logger.info('[onFeePaymentCreated] Sheets sync complete', {
        externalInvoiceNo: after.externalInvoiceNo, isNewStudent,
      });
    } catch (e: any) {
      logger.warn('[onFeePaymentCreated] Sheets sync error', { error: e?.message });
    }

    // ── Recipient email (student, then guardian's user) ──
    let recipientEmail = (student.email as string | null) ?? null;
    if (!recipientEmail && student.guardianUserId) {
      const userDoc = await db.doc(`users/${student.guardianUserId}`).get();
      if (userDoc.exists) recipientEmail = (userDoc.data()!.email as string) ?? null;
    }
    if (!recipientEmail) {
      logger.warn(`[onFeePaymentCreated] No email for ${student.name} — sheets done, emails skipped`);
      return;
    }

    const month = monthLabel(after.month as string);

    // ── Invoice email ──
    try {
      const html = buildInvoiceHtml({
        studentName: (student.name as string) ?? '—',
        centreName,
        batchName: batchName || '—',
        month: after.month as string,
        externalInvoiceNo: (after.externalInvoiceNo as string) ?? '—',
        externalStudentId: (student.externalStudentId as string) ?? null,
        baseAmountPaise: after.baseAmountPaise as number,
        gstAmountPaise: after.gstAmountPaise as number,
        totalAmountPaise: after.totalAmountPaise as number,
        gstRatePercent: after.gstRatePercentSnapshot as number,
        paymentMethod: after.method as string,
        paymentDate: after.paidAt as string | null,
      });
      await sendMail({ to: recipientEmail, subject: `Fee Receipt — ${month} | BBA Sports`, html });
      logger.info(`[onFeePaymentCreated] Invoice email sent to ${recipientEmail} — ${month}`);
    } catch (err: any) {
      logger.error('[onFeePaymentCreated] Failed to send invoice email', { error: err?.message });
    }

    // ── Welcome email — ONLY for students who self-registered via the public
    // /fees page (welcomeEmailPending flag set by registerStudent). Students
    // found via name autocomplete are existing and get the invoice only. Cleared
    // after sending so it never repeats on later payments. ──
    if (student.welcomeEmailPending === true) {
      try {
        await sendMail({
          to: recipientEmail,
          subject: 'Welcome to BBA Sports! 🏸',
          html: buildWelcomeHtml({
            studentName: (student.name as string) ?? '—',
            externalStudentId: (student.externalStudentId as string) ?? null,
            centreName,
            batchName,
          }),
        });
        await db.doc(`students/${studentId}`).update({ welcomeEmailPending: false });
        logger.info('[onFeePaymentCreated] Welcome email sent', { to: recipientEmail });
      } catch (err: any) {
        logger.warn('[onFeePaymentCreated] Welcome email failed', { error: err?.message });
      }
    }
  },
);
