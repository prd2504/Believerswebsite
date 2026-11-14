/**
 * Send salary slip email when a payroll run is marked PAID.
 *
 * Trigger: onDocumentWritten on payrollRuns/{runId}
 * Fires when status changes to PAID, sends a formatted payslip email
 * to the coach (via their linked staff email or user account email).
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import nodemailer from 'nodemailer';
import { db } from '../admin.js';

const REGION = 'asia-south1';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t} ${o}` : t;
}

function threeDigits(n: number): string {
  if (n === 0) return '';
  if (n < 100) return twoDigits(n);
  const h = ONES[Math.floor(n / 100)];
  const rest = twoDigits(n % 100);
  return rest ? `${h} Hundred ${rest}` : `${h} Hundred`;
}

function numberToWordsIndian(n: number): string {
  if (n === 0) return 'Zero';
  n = Math.round(n);
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore > 0) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n > 0) parts.push(threeDigits(n));
  return parts.join(' ');
}

function formatINR(paise: number): string {
  const rupees = Math.round(paise / 100);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(rupees);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function earningRow(label: string, paise: number): string {
  if (paise <= 0) return '';
  return `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155">${label}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;color:#334155">${formatINR(paise)}</td>
  </tr>`;
}

function deductionRow(label: string, paise: number): string {
  if (paise <= 0) return '';
  return `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155">${label}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;color:#334155">${formatINR(paise)}</td>
  </tr>`;
}

function buildPayslipHtml(run: Record<string, any>, staffName: string, staffCode: string, centreNames: string, bankLast4: string | null): string {
  const docType = run.employmentType === 'SALARIED' ? 'SALARY SLIP' : 'FEE VOUCHER';
  const month = monthLabel(run.month);
  const netRupees = Math.round(run.netPayPaise / 100);
  const netWords = `Indian Rupees ${numberToWordsIndian(netRupees)} Only`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">

  <!-- Header -->
  <div style="background:#0D1B2A;padding:20px 24px;text-align:center">
    <h2 style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.5px">BBA Sports Private Limited</h2>
    <p style="margin:4px 0 0;font-size:11px;color:#94a3b8">hello@bbashuttle.com</p>
  </div>

  <!-- Doc type bar -->
  <div style="background:#D94F2A;padding:10px 24px;text-align:center">
    <span style="font-size:13px;font-weight:700;color:#ffffff;letter-spacing:1.5px">${docType}</span>
    <span style="font-size:13px;color:#ffffff;opacity:0.9;margin-left:12px">${month}</span>
  </div>

  <div style="padding:24px">
    <!-- Employee Info -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px">
      <tr>
        <td style="padding:6px 0;color:#64748b;width:30%">Employee Name</td>
        <td style="padding:6px 0;font-weight:600;color:#0D1B2A">${staffName}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#64748b">Employee ID</td>
        <td style="padding:6px 0;font-weight:600;color:#0D1B2A">${staffCode}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#64748b">Centre</td>
        <td style="padding:6px 0;color:#0D1B2A">${centreNames}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#64748b">Designation</td>
        <td style="padding:6px 0;color:#0D1B2A">Badminton Coach</td>
      </tr>
      ${run.sessionsCount > 0 ? `<tr>
        <td style="padding:6px 0;color:#64748b">Sessions</td>
        <td style="padding:6px 0;color:#0D1B2A">${run.sessionsCount}</td>
      </tr>` : ''}
    </table>

    <!-- Earnings & Deductions side by side -->
    <div style="display:flex;gap:16px;margin-bottom:20px">
      <!-- Earnings -->
      <div style="flex:1;border-left:3px solid #D94F2A;border-radius:4px;overflow:hidden">
        <div style="background:#fef2f2;padding:8px 12px">
          <h4 style="margin:0;font-size:13px;font-weight:700;color:#0D1B2A">Earnings</h4>
        </div>
        <table style="width:100%;border-collapse:collapse">
          ${earningRow('Basic Pay', run.basicPaise)}
          ${earningRow('Per-Session Pay', run.perSessionPayPaise)}
          ${earningRow('Allowances / Bonus', run.allowancesPaise)}
          <tr style="background:#f8fafc">
            <td style="padding:10px 12px;font-size:13px;font-weight:700;color:#0D1B2A">Gross Earnings (A)</td>
            <td style="padding:10px 12px;font-size:13px;font-weight:700;text-align:right;color:#16a34a">${formatINR(run.grossPayPaise)}</td>
          </tr>
        </table>
      </div>

      <!-- Deductions -->
      <div style="flex:1;border-left:3px solid #64748b;border-radius:4px;overflow:hidden">
        <div style="background:#f8fafc;padding:8px 12px">
          <h4 style="margin:0;font-size:13px;font-weight:700;color:#0D1B2A">Deductions</h4>
        </div>
        <table style="width:100%;border-collapse:collapse">
          ${deductionRow('Professional Tax', run.professionalTaxPaise)}
          ${deductionRow('TDS', run.tdsPaise)}
          ${deductionRow('Advance Recovery', run.advanceRecoveryPaise)}
          ${deductionRow('Other Deductions', run.otherDeductionsPaise)}
          <tr style="background:#f8fafc">
            <td style="padding:10px 12px;font-size:13px;font-weight:700;color:#0D1B2A">Total Deductions (B)</td>
            <td style="padding:10px 12px;font-size:13px;font-weight:700;text-align:right;color:#dc2626">${formatINR(run.totalDeductionsPaise)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Net Pay -->
    <div style="background:#0D1B2A;border-radius:8px;padding:16px 24px;text-align:center;margin-bottom:16px">
      <p style="margin:0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Net Pay (A − B)</p>
      <p style="margin:6px 0 0;font-size:28px;font-weight:700;color:#ffffff">${formatINR(run.netPayPaise)}</p>
    </div>

    <!-- Amount in words -->
    <div style="background:#f8fafc;border-radius:6px;padding:10px 16px;margin-bottom:20px;text-align:center">
      <p style="margin:0;font-size:12px;color:#64748b;font-style:italic">${netWords}</p>
    </div>

    <!-- Payment Details -->
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
      <tr>
        <td style="padding:6px 0;color:#64748b">Payment Date</td>
        <td style="padding:6px 0;color:#0D1B2A">${formatDate(run.paidAt)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#64748b">Payment Mode</td>
        <td style="padding:6px 0;color:#0D1B2A">Bank Transfer${bankLast4 ? ` · A/C: ••••${bankLast4}` : ''}</td>
      </tr>
      ${run.paymentRef ? `<tr>
        <td style="padding:6px 0;color:#64748b">UTR / Reference</td>
        <td style="padding:6px 0;font-weight:600;color:#0D1B2A">${run.paymentRef}</td>
      </tr>` : ''}
    </table>

    ${run.notes ? `<p style="font-size:12px;color:#64748b;font-style:italic;margin:0 0 16px">Note: ${run.notes}</p>` : ''}

    <!-- Footer -->
    <div style="border-top:1px solid #e2e8f0;padding-top:16px;text-align:center">
      <p style="margin:0;font-size:10px;color:#94a3b8;line-height:1.5">
        This is a system-generated document issued under the Code on Wages, 2019 and applicable Maharashtra State rules.<br>
        No signature is required for electronically generated payslips.
      </p>
      <p style="margin:12px 0 0;font-size:11px;color:#64748b">
        For <strong>BBA Sports Private Limited</strong><br>
        <span style="font-size:10px;color:#94a3b8">Authorised Signatory</span>
      </p>
    </div>
  </div>

</div>
</body>
</html>`;
}

export const onPayrollPaid = onDocumentWritten(
  {
    document: 'payrollRuns/{runId}',
    region: REGION,
    timeoutSeconds: 60,
  },
  async (event) => {
    if (!event.data) return;

    const runId = event.params.runId as string;
    const afterSnap = event.data.after;
    const beforeSnap = event.data.before;
    const afterStatus = afterSnap.exists ? afterSnap.data()!.status : null;
    const beforeStatus = beforeSnap.exists ? beforeSnap.data()!.status : null;

    // Reverse the booked salary expense if a previously-PAID run is un-paid or
    // deleted, so the monthly P&L doesn't keep counting a payment that was
    // rolled back. (Idempotent: deleting an already-absent doc is a no-op.)
    if (beforeStatus === 'PAID' && afterStatus !== 'PAID') {
      try {
        await db.doc(`centreExpenses/payroll_${runId}`).delete();
        console.log(`[onPayrollPaid] Reversed salary expense payroll_${runId} (run no longer PAID)`);
      } catch (err) {
        console.error('[onPayrollPaid] Failed to reverse salary expense', err);
      }
    }

    if (!afterSnap.exists) return;
    const after = afterSnap.data()!;

    if (after.status !== 'PAID') return;

    // Fire once — skip if it was already PAID before this write.
    if (beforeStatus === 'PAID') return;

    // ── Book the salary as a COACH_SALARY expense for the month, so the monthly
    // P&L / profit report picks it up automatically (the Financials page already
    // sums every expense category into totalExpenses and netProfit). Done here,
    // before any email early-return, so a coach with no email on file still gets
    // the cost recorded.
    //
    // Amount = GROSS pay: that's the true cost of employment. TDS / professional
    // tax withheld from the coach are part of that cost and are remitted to
    // government separately, so booking gross once is complete and avoids the
    // double-count you'd get from booking net PLUS the tax payment.
    //
    // Idempotent: the expense doc id is derived from the payroll run id, so
    // Eventarc redelivery or a re-mark-as-paid updates the same row instead of
    // creating a duplicate expense. Multi-centre coaches are booked to their
    // first centre (company-wide totals are unaffected).
    try {
      const centreId = ((after.centreIds as string[]) ?? [])[0] ?? null;
      const grossPaise = (after.grossPayPaise as number) ?? (after.netPayPaise as number) ?? 0;
      if (centreId && grossPaise > 0) {
        const nowIso = new Date().toISOString();
        await db.doc(`centreExpenses/payroll_${runId}`).set({
          centreId,
          category: 'COACH_SALARY',
          description: `Salary (gross) — ${after.staffName ?? after.staffId ?? '—'} · ${monthLabel(after.month as string)}`,
          amountPaise: grossPaise,
          expenseDate: (after.paidAt as string | null)?.slice(0, 10) ?? nowIso.slice(0, 10),
          yearMonth: after.month as string,
          receiptPath: null,
          // The payroll run was already approved and paid before this fires, so
          // the resulting cost is approved spend — it must not sit in the
          // manager approval queue waiting to be re-approved.
          status: 'APPROVED',
          approvedBy: after.approvedBy ?? null,
          approvedAt: nowIso,
          rejectionReason: null,
          submittedBy: 'onPayrollPaid',
          sourcePayrollRunId: runId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: 'onPayrollPaid',
          updatedBy: 'onPayrollPaid',
        }, { merge: true });
        console.log(`[onPayrollPaid] Booked COACH_SALARY expense payroll_${runId} — ${formatINR(grossPaise)} · ${after.month}`);
      } else {
        console.warn(`[onPayrollPaid] Expense skipped — centreId=${centreId} grossPaise=${grossPaise} (run ${event.params.runId})`);
      }
    } catch (err) {
      console.error('[onPayrollPaid] Failed to book salary expense', err);
    }

    const staffId = after.staffId as string;
    if (!staffId) return;

    // Look up staff for email + details
    const staffDoc = await db.doc(`staff/${staffId}`).get();
    if (!staffDoc.exists) {
      console.warn(`Staff ${staffId} not found for payroll email`);
      return;
    }
    const staff = staffDoc.data()!;

    // Find coach email — try staff.email, then linked user account
    let coachEmail = staff.email as string | null;
    if (!coachEmail && staff.authUid) {
      const userDoc = await db.doc(`users/${staff.authUid}`).get();
      if (userDoc.exists) {
        coachEmail = userDoc.data()!.email ?? null;
      }
    }

    if (!coachEmail) {
      console.warn(`No email found for staff ${staffId} (${staff.name}) — skipping payslip email`);
      return;
    }

    // Look up centre names
    const centreIds = (staff.centreIds as string[]) ?? [];
    const centreNames: string[] = [];
    for (const cid of centreIds) {
      const cDoc = await db.doc(`centres/${cid}`).get();
      if (cDoc.exists) centreNames.push(cDoc.data()!.name ?? cid);
    }

    const html = buildPayslipHtml(
      after,
      staff.name ?? '—',
      staff.staffCode ?? '—',
      centreNames.join(', ') || '—',
      staff.bankAccountLast4 ?? null,
    );

    const month = monthLabel(after.month as string);
    const docType = after.employmentType === 'SALARIED' ? 'Salary Slip' : 'Fee Voucher';
    const subject = `${docType} — ${month} | BBA Sports`;

    // ── Send email ──
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const emailFrom = process.env.EMAIL_FROM ?? 'BBA Sports <noreply@bbasports.in>';

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.log('SMTP not configured — payslip email logged.');
      console.log(`TO: ${coachEmail}`);
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
        to: coachEmail,
        cc: 'hello@bbashuttle.com',
        subject,
        html,
      });

      console.log(`Payslip email sent to ${coachEmail} for ${staff.name} — ${month}`);
    } catch (err) {
      console.error('Failed to send payslip email:', err);
    }
  },
);
