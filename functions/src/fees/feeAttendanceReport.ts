/**
 * Fee-vs-attendance reconciliation — "who is training but hasn't paid?"
 *
 * Attendance and payments were tracked in completely separate places, so a
 * student could attend every session in a month with no payment on record and
 * nothing would ever surface it. This joins the two, per centre, per month.
 *
 * Runs on a schedule (8th of each month, after fees are due on the 7th) and
 * can also be triggered manually. Each run stores one document per centre and
 * sends a single consolidated email.
 *
 * Computed here rather than in the browser: deriving it client-side would mean
 * reading every attendance record for every batch on every page load. The
 * stored report is one document read instead.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { config } from '../config.js';
import { sendMail } from './mailer.js';
import {
  paymentCoversMonth,
  paymentCoverage,
  monthRank,
  formatMonthLabel,
  feeAttendanceReportId,
  type FeeAttendanceRow,
} from '@bba/shared';

const REGION = 'asia-south1';

/**
 * Where the report goes. Kept here rather than in an env var because these are
 * the two people accountable for collections; a silent env change that
 * redirected the money report would be worse than an obvious code change.
 */
const REPORT_RECIPIENTS = ['prdeshpande2504@gmail.com'];
/** Additional recipients pulled from CENTRE_MANAGER accounts at run time. */
const INCLUDE_CENTRE_MANAGERS = true;

/** Statuses that mean the student was physically present. */
const PRESENT_STATUSES = new Set(['PRESENT', 'LATE']);
/**
 * Attendee types that owe a monthly fee. TRIAL is excluded deliberately —
 * a walk-in trying a session is not enrolled and owes nothing, so counting
 * them would make the unpaid list wrong and chase people who aren't students.
 */
const FEE_BEARING_TYPES = new Set(['REGULAR', 'MAKEUP', 'EXTRA']);

function monthBounds(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${yearMonth}-01`, end: `${yearMonth}-${String(last).padStart(2, '0')}` };
}

function fmtINR(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Math.round(paise / 100));
}

export interface BuiltReport {
  centreId: string;
  centreName: string;
  yearMonth: string;
  rows: FeeAttendanceRow[];
  totals: {
    studentsAttended: number;
    paidCount: number;
    unpaidCount: number;
    unpaidSessions: number;
    estimatedDuePaise: number;
  };
}

/** Build every centre's report for a month. Pure read + compute; no writes. */
export async function buildReports(yearMonth: string): Promise<BuiltReport[]> {
  const { start, end } = monthBounds(yearMonth);

  const [centresSnap, studentsSnap, enrollSnap, batchesSnap] = await Promise.all([
    db.collection('centres').where('active', '==', true).get(),
    db.collection('students').get(),
    db.collection('enrollments').where('status', '==', 'ACTIVE').get(),
    db.collection('batches').get(),
  ]);

  // One collectionGroup query for the whole month across every batch, rather
  // than walking batches → sessions → records, which would be hundreds of
  // round trips.
  const recordsSnap = await db.collectionGroup('records')
    .where('sessionDate', '>=', start)
    .where('sessionDate', '<=', end)
    .get();

  const studentById = new Map(studentsSnap.docs.map((d) => [d.id, d.data()]));
  const batchById = new Map(batchesSnap.docs.map((d) => [d.id, d.data()]));

  // studentId → sessions attended this month
  const attendance = new Map<string, number>();
  recordsSnap.docs.forEach((d) => {
    const r = d.data();
    if (!r.studentId) return;                                  // pure walk-in, no student record
    if (!PRESENT_STATUSES.has(r.status)) return;
    if (!FEE_BEARING_TYPES.has(r.attendeeType ?? 'REGULAR')) return;
    attendance.set(r.studentId, (attendance.get(r.studentId) ?? 0) + 1);
  });

  // studentId → their enrolment (for expected fee + batch name)
  const enrolByStudent = new Map<string, FirebaseFirestore.DocumentData>();
  enrollSnap.docs.forEach((d) => {
    const e = d.data();
    if (!enrolByStudent.has(e.studentId)) enrolByStudent.set(e.studentId, e);
  });

  // Payments for anyone who attended — coverage-aware, so a quarterly payment
  // made in September correctly marks October and November as paid.
  const attendedIds = Array.from(attendance.keys());
  const coverage = new Map<string, { end: string; cycle: string } | null>();

  // Firestore 'in' caps at 30 values, so query in chunks.
  for (let i = 0; i < attendedIds.length; i += 30) {
    const chunk = attendedIds.slice(i, i + 30);
    const paySnap = await db.collection('payments').where('studentId', 'in', chunk).get();
    paySnap.docs.forEach((d) => {
      const p = d.data();
      if (p.status === 'REFUNDED' || p.status === 'WAIVED') return;
      if (!paymentCoversMonth(
        { month: p.month, coverageMonths: p.coverageMonths, coverageEndMonth: p.coverageEndMonth },
        yearMonth,
      )) return;
      const cov = paymentCoverage({
        month: p.month, coverageMonths: p.coverageMonths, coverageEndMonth: p.coverageEndMonth,
      });
      const prev = coverage.get(p.studentId);
      // Keep the furthest-reaching covering payment.
      if (!prev || monthRank(cov.end) > monthRank(prev.end)) {
        coverage.set(p.studentId, { end: cov.end, cycle: p.billingCycle ?? 'MONTHLY' });
      }
    });
  }

  return centresSnap.docs.map((centreDoc) => {
    const centre = centreDoc.data();
    const rows: FeeAttendanceRow[] = [];

    attendance.forEach((sessions, studentId) => {
      const s = studentById.get(studentId);
      if (!s || s.primaryCentreId !== centreDoc.id) return;

      const enrol = enrolByStudent.get(studentId);
      const batch = enrol?.batchId ? batchById.get(enrol.batchId) : undefined;
      const cov = coverage.get(studentId) ?? null;

      rows.push({
        studentId,
        studentName: s.name ?? studentId,
        externalStudentId: s.externalStudentId ?? null,
        phone: s.phone ?? null,
        batchName: (batch?.name as string) ?? '—',
        sessionsAttended: sessions,
        isPaid: !!cov,
        coveredThrough: cov?.end ?? null,
        billingCycle: cov?.cycle ?? null,
        expectedFeePaise: (enrol?.monthlyFeePaise as number) ?? 0,
      });
    });

    rows.sort((a, b) =>
      Number(a.isPaid) - Number(b.isPaid) ||
      b.sessionsAttended - a.sessionsAttended ||
      a.studentName.localeCompare(b.studentName));

    const unpaid = rows.filter((r) => !r.isPaid);
    return {
      centreId: centreDoc.id,
      centreName: (centre.name as string) ?? centreDoc.id,
      yearMonth,
      rows,
      totals: {
        studentsAttended: rows.length,
        paidCount: rows.length - unpaid.length,
        unpaidCount: unpaid.length,
        unpaidSessions: unpaid.reduce((t, r) => t + r.sessionsAttended, 0),
        estimatedDuePaise: unpaid.reduce((t, r) => t + r.expectedFeePaise, 0),
      },
    };
  });
}

function buildEmailHtml(reports: BuiltReport[], yearMonth: string): string {
  const label = formatMonthLabel(yearMonth);
  const grand = reports.reduce((a, r) => ({
    unpaid: a.unpaid + r.totals.unpaidCount,
    sessions: a.sessions + r.totals.unpaidSessions,
    due: a.due + r.totals.estimatedDuePaise,
    attended: a.attended + r.totals.studentsAttended,
  }), { unpaid: 0, sessions: 0, due: 0, attended: 0 });

  const centreBlocks = reports
    .filter((r) => r.totals.studentsAttended > 0)
    .map((r) => {
      const unpaid = r.rows.filter((x) => !x.isPaid);
      if (unpaid.length === 0) {
        return `<div style="margin:0 0 18px">
          <h3 style="margin:0 0 6px;font-size:14px;color:#0D1B2A">${r.centreName}</h3>
          <p style="margin:0;font-size:13px;color:#16a34a">✓ All ${r.totals.studentsAttended} attending students are paid.</p>
        </div>`;
      }
      const rowsHtml = unpaid.map((x) => `<tr>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0D1B2A">${x.studentName}
          ${x.externalStudentId ? `<span style="color:#94a3b8;font-size:11px"> · ${x.externalStudentId}</span>` : ''}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155">${x.batchName}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:center;color:#dc2626;font-weight:600">${x.sessionsAttended}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;color:#334155">${x.expectedFeePaise ? fmtINR(x.expectedFeePaise) : '—'}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">${x.phone ?? '—'}</td>
      </tr>`).join('');

      return `<div style="margin:0 0 22px">
        <h3 style="margin:0 0 8px;font-size:14px;color:#0D1B2A">${r.centreName}
          <span style="font-weight:400;color:#64748b">— ${unpaid.length} unpaid of ${r.totals.studentsAttended} attending</span></h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
          <tr style="background:#f8fafc">
            <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b">Student</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b">Batch</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b">Sessions</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b">Fee due</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b">Phone</th>
          </tr>
          ${rowsHtml}
        </table>
      </div>`;
    }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:720px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#0D1B2A;padding:18px 24px">
    <h2 style="margin:0;font-size:17px;color:#fff">Pending Fees — ${label}</h2>
    <p style="margin:4px 0 0;font-size:12px;color:#94a3b8">Students who attended but have no payment on record</p>
  </div>
  <div style="background:${grand.unpaid > 0 ? '#fef2f2' : '#f0fdf4'};padding:14px 24px;border-bottom:1px solid #e2e8f0">
    <p style="margin:0;font-size:14px;color:${grand.unpaid > 0 ? '#b91c1c' : '#15803d'};font-weight:600">
      ${grand.unpaid > 0
        ? `${grand.unpaid} unpaid across all centres · ${grand.sessions} sessions attended · approx ${fmtINR(grand.due)} outstanding`
        : `All ${grand.attended} attending students are paid up.`}
    </p>
  </div>
  <div style="padding:22px 24px">
    ${centreBlocks || '<p style="font-size:13px;color:#64748b">No attendance recorded this month.</p>'}
    <p style="margin:18px 0 0;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:14px">
      Trials and walk-ins are excluded — they are not enrolled and owe no monthly fee.
      Quarterly payers count as paid for every month their payment covers.<br>
      Full detail: <a href="https://bbashuttle.com/admin/payments" style="color:#D94F2A">Admin → Payments → Pending Fees</a>
    </p>
  </div>
</div></body></html>`;
}

/** Compute, store and email. Returns a short summary for the caller. */
export async function runFeeAttendanceReport(yearMonth: string): Promise<{
  centres: number; unpaid: number; emailed: string[];
}> {
  const reports = await buildReports(yearMonth);
  const nowIso = new Date().toISOString();

  await Promise.all(reports.map((r) =>
    db.collection('feeAttendanceReports').doc(feeAttendanceReportId(r.centreId, yearMonth)).set({
      ...r,
      generatedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: 'feeAttendanceReport',
      updatedBy: 'feeAttendanceReport',
    }, { merge: true })));

  const recipients = new Set(REPORT_RECIPIENTS);
  if (INCLUDE_CENTRE_MANAGERS) {
    const mgrSnap = await db.collection('users').where('role', '==', 'CENTRE_MANAGER').get();
    mgrSnap.docs.forEach((d) => {
      const email = d.data().email;
      if (email) recipients.add(String(email));
    });
  }

  const to = Array.from(recipients);
  const unpaid = reports.reduce((t, r) => t + r.totals.unpaidCount, 0);

  try {
    await sendMail({
      to: to.join(', '),
      subject: `Pending Fees — ${formatMonthLabel(yearMonth)} | ${unpaid} unpaid | BBA Sports`,
      html: buildEmailHtml(reports, yearMonth),
    });
  } catch (err) {
    // A mail failure must not lose the report — it is already stored and
    // visible in the webapp regardless.
    logger.error('[feeAttendanceReport] email failed; report still stored', { err });
  }

  logger.info('[feeAttendanceReport] done', { yearMonth, centres: reports.length, unpaid, to });
  return { centres: reports.length, unpaid, emailed: to };
}

/** Previous month in YYYY-MM. */
function previousMonth(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 8th of each month, 09:00 IST — a day after fees are due on the 7th, so the
 * list reflects who genuinely missed the deadline.
 *
 * Reports on the CURRENT month: that is the month people are attending and
 * owe for right now. The previous month is available via the manual endpoint
 * for catching up on an earlier period.
 */
export const scheduledFeeAttendanceReport = onSchedule(
  { schedule: '0 9 8 * *', timeZone: 'Asia/Kolkata', region: REGION, timeoutSeconds: 540 },
  async () => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await runFeeAttendanceReport(ym);
  },
);

/** Manual run: POST { month?: "2026-09" }. Defaults to the current month. */
export const generateFeeAttendanceReport = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 540 },
  async (req, res): Promise<void> => {
    const key = req.header('x-api-key');
    if (!config.sheets.apiKey || key !== config.sheets.apiKey) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }
    const now = new Date();
    const ym = (req.body?.month as string)
      ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      res.status(400).json({ ok: false, error: 'month must be YYYY-MM' });
      return;
    }
    try {
      const out = await runFeeAttendanceReport(ym);
      res.status(200).json({ ok: true, month: ym, ...out, previousMonth: previousMonth(now) });
    } catch (err: any) {
      logger.error('[generateFeeAttendanceReport] failed', { err });
      res.status(500).json({ ok: false, error: err?.message ?? 'Internal error' });
    }
  },
);
