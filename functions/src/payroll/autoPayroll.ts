/**
 * Payroll generated from the attendance coaches mark in the app.
 *
 * A session is credited to exactly one coach — see creditedCoachUid() — when it
 * is not cancelled ("not held") and its register has been saved.
 *
 * Each ACTIVE staff member linked to an app account (staff.authUid) gets one
 * DRAFT run per month at payrollRuns/{staffId}_{month}. Regenerating updates
 * the sessions and pay but keeps any allowances, deductions and notes an admin
 * entered. APPROVED / PAID runs are never touched, and a manually created run
 * for the same coach and month is left alone.
 *
 * Runs nightly for the current month (a live month-to-date draft), and on the
 * 1st–3rd also re-finalises the previous month so late registers still count.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { requireAdminLike } from '../http/requireAdmin.js';
import { addMonths, autoPayrollRunId, computeAttendancePayroll, creditedCoachUid, istNow } from '@bba/shared';

const REGION = 'asia-south1';

export interface PayrollGenResult {
  month: string;
  generated: { staff: string; sessions: number; netRupees: number }[];
  skipped: { staff: string; reason: string }[];
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  return { start: `${month}-01`, end: `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` };
}

export async function generatePayrollFromAttendance(month: string): Promise<PayrollGenResult> {
  const { start, end } = monthRange(month);
  const [staffSnap, batchesSnap, runsSnap] = await Promise.all([
    db.collection('staff').where('status', '==', 'ACTIVE').get(),
    db.collection('batches').get(),
    db.collection('payrollRuns').where('month', '==', month).get(),
  ]);

  // uid → { batchName → sessions credited }
  const credited = new Map<string, Map<string, number>>();
  await Promise.all(batchesSnap.docs.map(async (b) => {
    const sessions = await db.collection(`attendance/${b.id}/sessions`)
      .where('sessionDate', '>=', start).where('sessionDate', '<=', end).get();
    const batchName = (b.data().name as string) ?? b.id;
    sessions.docs.forEach((s) => {
      const d = s.data();
      if (d.cancelled) return;
      if (!d.firstTakenAt && !d.endedAt) return;
      const batchCoachIds: string[] = Array.isArray(b.data().coachIds) ? b.data().coachIds : [];
      const uid = creditedCoachUid(d, batchCoachIds);
      if (!uid) return;
      if (!credited.has(uid)) credited.set(uid, new Map());
      const perBatch = credited.get(uid)!;
      perBatch.set(batchName, (perBatch.get(batchName) ?? 0) + 1);
    });
  }));

  const runsByStaff = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  runsSnap.docs.forEach((r) => {
    const sid = r.data().staffId as string;
    runsByStaff.set(sid, [...(runsByStaff.get(sid) ?? []), r]);
  });

  const out: PayrollGenResult = { month, generated: [], skipped: [] };
  const now = new Date().toISOString();

  for (const sd of staffSnap.docs) {
    const s = sd.data();
    const name = (s.name as string) ?? sd.id;
    if (!s.authUid) { out.skipped.push({ staff: name, reason: 'not linked to an app login — link it in Payroll → Staff' }); continue; }

    const autoId = autoPayrollRunId(sd.id, month);
    const existing = runsByStaff.get(sd.id) ?? [];
    const manual = existing.find((r) => r.id !== autoId);
    if (manual) { out.skipped.push({ staff: name, reason: 'a manually created run already exists for this month' }); continue; }
    const auto = existing.find((r) => r.id === autoId)?.data();
    if (auto && auto.status !== 'DRAFT') { out.skipped.push({ staff: name, reason: `already ${String(auto.status).toLowerCase()}` }); continue; }

    const perBatch = credited.get(s.authUid as string) ?? new Map<string, number>();
    const sessionsCount = Array.from(perBatch.values()).reduce((t, n) => t + n, 0);
    const pay = computeAttendancePayroll({
      employmentType: (s.employmentType as 'SALARIED' | 'PER_SESSION') ?? 'SALARIED',
      ratePaise: (s.ratePaise as number) ?? 0,
      sessionsCount,
      allowancesPaise: (auto?.allowancesPaise as number) ?? 0,
      deductionsPaise: {
        professionalTaxPaise: auto?.professionalTaxPaise as number,
        tdsPaise: auto?.tdsPaise as number,
        advanceRecoveryPaise: auto?.advanceRecoveryPaise as number,
        otherDeductionsPaise: auto?.otherDeductionsPaise as number,
      },
    });

    await db.doc(`payrollRuns/${autoId}`).set({
      staffId: sd.id,
      staffName: name,
      centreIds: Array.isArray(s.centreIds) ? s.centreIds : [],
      month,
      employmentType: s.employmentType ?? 'SALARIED',
      sessionsCount,
      sessionBreakdown: Object.fromEntries(perBatch),
      ...pay,
      professionalTaxPaise: (auto?.professionalTaxPaise as number) ?? 0,
      tdsPaise: (auto?.tdsPaise as number) ?? 0,
      advanceRecoveryPaise: (auto?.advanceRecoveryPaise as number) ?? 0,
      otherDeductionsPaise: (auto?.otherDeductionsPaise as number) ?? 0,
      status: 'DRAFT',
      approvedBy: null,
      approvedAt: null,
      paymentRef: null,
      paidAt: null,
      notes: (auto?.notes as string) ?? null,
      autoGenerated: true,
      generatedAt: now,
      ...(auto ? {} : { createdAt: now, createdBy: 'autoPayroll' }),
      updatedAt: now,
      updatedBy: 'autoPayroll',
    }, { merge: true });

    out.generated.push({ staff: name, sessions: sessionsCount, netRupees: Math.round(pay.netPayPaise / 100) });
  }

  logger.info('[autoPayroll]', { month, generated: out.generated.length, skipped: out.skipped });
  return out;
}

/** 11:15 PM IST nightly: refresh this month's drafts; early in a month, also close out last month. */
export const scheduledPayroll = onSchedule(
  { schedule: '15 23 * * *', timeZone: 'Asia/Kolkata', region: REGION, timeoutSeconds: 300 },
  async () => {
    const today = istNow().date;
    const month = today.slice(0, 7);
    await generatePayrollFromAttendance(month);
    if (Number(today.slice(8, 10)) <= 3) await generatePayrollFromAttendance(addMonths(month, -1));
  },
);

/** POST { month?: 'YYYY-MM' } — super admin refreshes a month from attendance. */
export const generatePayroll = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 300 },
  async (req, res): Promise<void> => {
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
    if (!(await requireAdminLike(req, res, { superAdminOnly: true }))) return;
    const month = String(req.body?.month ?? istNow().date.slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(month)) { res.status(400).json({ ok: false, error: 'month must be YYYY-MM' }); return; }
    try {
      res.json({ ok: true, ...(await generatePayrollFromAttendance(month)) });
    } catch (err) {
      logger.error('[generatePayroll] failed', { err });
      res.status(500).json({ ok: false, error: (err as Error)?.message ?? 'Internal error' });
    }
  },
);
