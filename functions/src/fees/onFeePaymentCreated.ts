import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { db, FieldValue } from '../admin.js';
import { buildInvoiceHtml } from './invoiceEmailTemplate.js';
import { buildWelcomeHtml } from './welcomeEmailTemplate.js';
import { syncPublicFeePayment, logAdminEvent } from './sheetsSync.js';
import { sendMail } from './mailer.js';

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/**
 * Auto-enrols a student who has no batch link yet — the case for anyone who
 * self-registered via "Can't find your name? Register a new student" on the
 * public /fees page and then paid. registerStudent() creates the student doc
 * with an empty batchIds and no enrollment; without this, that student is
 * invisible on Roster and anywhere else that's enrollment-driven, even though
 * their payment recorded fine (they'd only ever show up in Payments).
 *
 * Only acts when the choice is UNAMBIGUOUS: exactly one active batch at the
 * centre offers a pricing plan for the requested daysPerWeek. Zero or
 * multiple matches → do nothing, just log a warning. Guessing the wrong batch
 * would be worse than leaving it for an admin to enrol manually via Roster —
 * this only closes the common case automatically.
 *
 * selectedDays is a best-effort default (the first `daysPerWeek` of the
 * batch's offeredDays, in order) since the public page only captures a day
 * COUNT, not which specific days — noted in the enrollment so an admin knows
 * to double-check it against what the family actually wants.
 *
 * Exported so a one-time backfill (backfillEnrollments.ts) can reuse the exact
 * same logic for students who self-registered before this function existed.
 */
export async function autoEnrollIfMissing(
  studentId: string, centreId: string, daysPerWeek: number,
): Promise<{ batchId: string; batchName: string } | null> {
  const batchesSnap = await db.collection('batches')
    .where('centreId', '==', centreId)
    .where('status', '==', 'ACTIVE')
    .get();

  const matches = batchesSnap.docs.filter((d) =>
    ((d.data().frequencyPlans as { daysPerWeek: number }[]) ?? []).some((p) => p.daysPerWeek === daysPerWeek),
  );

  if (matches.length !== 1) {
    logger.warn('[onFeePaymentCreated] auto-enrol skipped — ambiguous batch match', {
      studentId, centreId, daysPerWeek, candidateCount: matches.length,
    });
    return null;
  }

  const batchDoc = matches[0];
  const batch = batchDoc.data();
  const plan = ((batch.frequencyPlans as { daysPerWeek: number; monthlyFeePaise: number }[]) ?? [])
    .find((p) => p.daysPerWeek === daysPerWeek);
  const offeredDays = [...((batch.offeredDays as number[]) ?? [])].sort((a, b) => a - b);
  const batchName = (batch.name as string) ?? '';

  // A batch whose plan asks for more days than the batch actually runs is
  // misconfigured. slice() would silently return too few days, creating an
  // enrollment with selectedDays.length !== daysPerWeek — which then makes the
  // admin Enrolment dialog unsatisfiable (it can never reach N/N, so the Enrol
  // button stays disabled forever) and trips enrollStudent's length guard.
  // Refuse to create the broken record; leave it for an admin to enrol
  // manually once the batch's offered days are corrected.
  if (offeredDays.length < daysPerWeek) {
    logger.warn('[onFeePaymentCreated] auto-enrol skipped — batch offers fewer days than the plan requires', {
      studentId, batchId: batchDoc.id, batchName, offeredDays: offeredDays.length, daysPerWeek,
    });
    return null;
  }

  const selectedDays = offeredDays.slice(0, daysPerWeek);

  const enrollmentRef = db.doc(`enrollments/${studentId}_${batchDoc.id}`);
  const existing = await enrollmentRef.get();
  if (existing.exists && existing.data()?.status === 'ACTIVE') {
    return { batchId: batchDoc.id, batchName }; // already enrolled — nothing to do
  }

  const now = new Date().toISOString();
  const writeBatch = db.batch();
  writeBatch.set(enrollmentRef, {
    studentId, batchId: batchDoc.id, centreId,
    daysPerWeek, monthlyFeePaise: plan?.monthlyFeePaise ?? 0,
    selectedDays, startDate: now.slice(0, 10), endDate: null,
    status: 'ACTIVE', timeSlotStartTime: (batch.startTime as string) ?? null,
    pausedMonths: [],
    notes: 'Auto-enrolled from a public /fees payment — verify the selected days match what the family actually attends.',
    createdAt: now, updatedAt: now, createdBy: 'PUBLIC_FEES_PAGE', updatedBy: 'PUBLIC_FEES_PAGE',
  });
  writeBatch.update(batchDoc.ref, {
    studentIds: FieldValue.arrayUnion(studentId),
    currentEnrolment: FieldValue.increment(1),
    updatedAt: now, updatedBy: 'PUBLIC_FEES_PAGE',
  });
  writeBatch.update(db.doc(`students/${studentId}`), {
    batchIds: FieldValue.arrayUnion(batchDoc.id), updatedAt: now,
  });
  await writeBatch.commit();

  logger.info('[onFeePaymentCreated] auto-enrolled', { studentId, batchId: batchDoc.id, daysPerWeek });
  return { batchId: batchDoc.id, batchName };
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

    // Batch name — and auto-enrol if this student has no batch link yet
    // (self-registered via /fees, never enrolled). See autoEnrollIfMissing().
    let batchId = after.batchId as string;
    let batchName = '';
    if (batchId) {
      const batchDoc = await db.doc(`batches/${batchId}`).get();
      if (batchDoc.exists) batchName = (batchDoc.data()!.name as string) ?? '';
    } else if (centreId && typeof after.daysPerWeek === 'number') {
      try {
        const enrolled = await autoEnrollIfMissing(studentId, centreId, after.daysPerWeek as number);
        if (enrolled) {
          batchId = enrolled.batchId;
          batchName = enrolled.batchName;
        }
      } catch (e: any) {
        logger.warn('[onFeePaymentCreated] auto-enrol failed', { studentId, error: e?.message });
      }
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
      const claim: Record<string, unknown> = { sideEffectsCompletedAt: new Date().toISOString() };
      // Backfill the payment's own batchId too, so /admin/payments and any
      // batch-joined report reflect the auto-enrollment, not just the sheet.
      if (batchId && !after.batchId) claim.batchId = batchId;
      tx.update(paymentRef, claim);
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
        // Payments written before quarterly existed carry neither field; they
        // were all single-month, so they mirror as MONTHLY covering their own
        // month and nothing in the sheet changes meaning.
        billingCycle: (after.billingCycle as string) ?? 'MONTHLY',
        coverageEndMonth: (after.coverageEndMonth as string) ?? (after.month as string),
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
    const nowIso = new Date().toISOString();
    const studentName = (student.name as string) ?? '—';

    if (!recipientEmail) {
      logger.warn(`[onFeePaymentCreated] No email for ${student.name} — sheets done, emails skipped`);
      // This is the case most likely to be silently lost — the payment and
      // invoice are recorded, but nobody ever receives a receipt. Make it
      // visible in the sheet, not just in Cloud Function logs.
      await logAdminEvent(
        'INVOICE_EMAIL_SKIPPED_NO_ADDRESS', studentName, centreName,
        `${(after.externalInvoiceNo as string) ?? ''} · no email on file for student`, nowIso,
      );
      return;
    }

    const month = monthLabel(after.month as string);

    // ── Invoice email ──
    // The admin_logs row written here is the ONLY reliable delivery signal in
    // the sheet — it fires from the real sendMail() outcome (SMTP
    // accepted/rejected), unlike the "Invoice generated" row in sheetsSync.ts
    // which just means an invoice number was logged, before this ever runs.
    try {
      const html = buildInvoiceHtml({
        studentName,
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
      const result = await sendMail({ to: recipientEmail, subject: `Fee Receipt — ${month} | BBA Sports`, html });
      logger.info(`[onFeePaymentCreated] Invoice email sent to ${recipientEmail} — ${month}`, { result });
      if (result) {
        const status = result.rejected.length ? 'REJECTED' : 'accepted for delivery';
        await logAdminEvent(
          result.rejected.length ? 'INVOICE_EMAIL_REJECTED' : 'Invoice emailed',
          studentName, centreName,
          `to ${recipientEmail} · ${status} · SMTP: ${result.response.slice(0, 80)}`, nowIso,
        );
      }
    } catch (err: any) {
      logger.error('[onFeePaymentCreated] Failed to send invoice email', { error: err?.message });
      await logAdminEvent('INVOICE_EMAIL_FAILED', studentName, centreName, `to ${recipientEmail} · ${String(err?.message).slice(0, 200)}`, nowIso);
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
