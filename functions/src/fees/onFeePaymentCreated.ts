import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import nodemailer from 'nodemailer';
import { db } from '../admin.js';
import { buildInvoiceHtml } from './invoiceEmailTemplate.js';

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export const onFeePaymentCreated = onDocumentWritten(
  {
    document: 'payments/{paymentId}',
    region: 'asia-south1',
    timeoutSeconds: 60,
  },
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;

    const after = afterSnap.data()!;

    // Only fire for payments with paymentSource (skip legacy admin-created payments)
    if (!after.paymentSource) return;

    // Only fire when status becomes PAID
    if (after.status !== 'PAID') return;

    const beforeSnap = event.data?.before;
    if (beforeSnap?.exists) {
      const before = beforeSnap.data()!;
      if (before.status === 'PAID') return;
    }

    const studentId = after.studentId as string;
    if (!studentId) return;

    // Look up student
    const studentDoc = await db.doc(`students/${studentId}`).get();
    if (!studentDoc.exists) {
      console.warn(`[onFeePaymentCreated] Student ${studentId} not found`);
      return;
    }
    const student = studentDoc.data()!;

    // Find recipient email — student email, then guardian's user email
    let recipientEmail = student.email as string | null;
    if (!recipientEmail && student.guardianUserId) {
      const userDoc = await db.doc(`users/${student.guardianUserId}`).get();
      if (userDoc.exists) {
        recipientEmail = userDoc.data()!.email ?? null;
      }
    }

    if (!recipientEmail) {
      console.warn(`[onFeePaymentCreated] No email for student ${studentId} (${student.name}) — skipping`);
      return;
    }

    // Look up centre
    const centreId = after.centreId as string;
    let centreName = '—';
    if (centreId) {
      const centreDoc = await db.doc(`centres/${centreId}`).get();
      if (centreDoc.exists) centreName = centreDoc.data()!.name ?? centreId;
    }

    // Look up batch
    const batchId = after.batchId as string;
    let batchName = '—';
    if (batchId) {
      const batchDoc = await db.doc(`batches/${batchId}`).get();
      if (batchDoc.exists) batchName = batchDoc.data()!.name ?? batchId;
    }

    const html = buildInvoiceHtml({
      studentName: student.name ?? '—',
      centreName,
      batchName,
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

    const month = monthLabel(after.month as string);
    const subject = `Fee Receipt — ${month} | BBA Sports`;

    // ── Send email ──
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const emailFrom = process.env.EMAIL_FROM ?? 'BBA Sports <noreply@bbasports.in>';

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.log('[onFeePaymentCreated] SMTP not configured — invoice email logged.');
      console.log(`TO: ${recipientEmail}`);
      console.log(`SUBJECT: ${subject}`);
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort ?? '587'),
        secure: Number(smtpPort ?? '587') === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: emailFrom,
        to: recipientEmail,
        cc: 'hello@bbashuttle.com',
        subject,
        html,
      });

      console.log(`[onFeePaymentCreated] Invoice email sent to ${recipientEmail} for ${student.name} — ${month}`);
    } catch (err) {
      console.error('[onFeePaymentCreated] Failed to send invoice email:', err);
    }
  },
);
