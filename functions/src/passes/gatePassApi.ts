/**
 * The public pass lookup, and the day-pass side effects.
 *
 * ── Why the pass page goes through a function ──
 * A pass has to be openable by a player who is not signed in, standing at a
 * gate. But deciding whether it is valid means reading /students and /payments,
 * both admin-only and both carrying far more than a guard needs. So the page
 * sends a token and gets back exactly what it prints: a name, a centre, a
 * validity window and a colour. No phone number, no fee amount, no student id.
 *
 * That also keeps the cost flat. One invocation and two reads per view, and
 * only when somebody actually opens it — a printed pass costs nothing at all.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { randomUUID } from 'node:crypto';
import { db } from '../admin.js';
import { config } from '../config.js';
import { sendMail } from '../fees/mailer.js';
import {
  paymentCoversMonth,
  coveredMonths,
  istNow,
  passCode,
  dayPassState,
  monthColour,
  DAY_PASS_REASON_LABELS,
  type PassView,
} from '@bba/shared';
import { buildPassEmail } from './passEmail.js';

const REGION = 'asia-south1';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthWord(ym: string): string {
  return `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`.toUpperCase();
}

/** "30 Nov 2026" — explicit month table, never toLocaleDateString. */
function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_ABBR[m - 1]} ${y}`;
}

/** Last day of a YYYY-MM. */
function endOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

/**
 * The standing pass for a student: valid because their fees cover today.
 *
 * Looks back three months because that is the longest cycle sold — a
 * quarterly payment made in September is what makes November valid, and a
 * query for November alone would never find it.
 */
async function buildStandingPass(studentId: string, token: string): Promise<PassView | null> {
  const now = istNow();
  const thisMonth = now.date.slice(0, 7);

  const studentSnap = await db.collection('students').doc(studentId).get();
  if (!studentSnap.exists) return null;
  const s = studentSnap.data()!;

  const [y, m] = thisMonth.split('-').map(Number);
  const from = new Date(y, m - 3, 1);
  const fromMonth = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;

  const [paySnap, centreSnap] = await Promise.all([
    db.collection('payments')
      .where('studentId', '==', studentId)
      .where('month', '>=', fromMonth)
      .get(),
    s.primaryCentreId
      ? db.collection('centres').doc(String(s.primaryCentreId)).get()
      : Promise.resolve(null),
  ]);

  // The payment whose coverage reaches furthest — someone who paid monthly and
  // then quarterly should get the quarterly window, not whichever row came
  // back first.
  let best: { month: string; months: number; end: string } | null = null;
  paySnap.docs.forEach((d) => {
    const p = d.data();
    if (p.status === 'REFUNDED') return;
    const months = Number(p.coverageMonths) > 0 ? Number(p.coverageMonths) : 1;
    const end = String(p.coverageEndMonth || coveredMonths(String(p.month), months).slice(-1)[0]);
    if (!paymentCoversMonth(
      { month: String(p.month), coverageMonths: months, coverageEndMonth: end }, thisMonth,
    )) return;
    if (!best || end > best.end) best = { month: String(p.month), months, end };
  });

  const centreName = centreSnap?.exists ? String(centreSnap.data()!.name ?? '') : '';
  const centreCode = centreSnap?.exists ? String(centreSnap.data()!.centreCode ?? '') : '';

  const base = {
    kind: 'STANDING' as const,
    personName: String(s.name ?? ''),
    centreName,
    centreCode,
    batchLabel: null as string | null,
    colourMonth: thisMonth,
    code: passCode(centreCode || 'BBA', `${thisMonth}-01`, token),
    reasonLabel: null,
  };

  if (!best) {
    return {
      ...base,
      state: 'EXPIRED',
      validLabel: monthWord(thisMonth),
      validUntilLabel: 'Fees not received for this month',
      coversMonths: [],
      message: 'Your fees for this month have not been recorded. Please pay at bbashuttle.com/fees, or speak to the centre manager.',
    };
  }

  const b = best as { month: string; months: number; end: string };
  return {
    ...base,
    state: 'VALID',
    validLabel: monthWord(thisMonth),
    validUntilLabel: `Valid until ${longDate(endOfMonth(b.end))}`,
    coversMonths: coveredMonths(b.month, b.months),
    message: null,
  };
}

async function buildDayPass(passId: string): Promise<PassView | null> {
  const snap = await db.collection('dayPasses').doc(passId).get();
  if (!snap.exists) return null;
  const p = snap.data()!;
  const now = istNow();
  const state = dayPassState({ status: p.status, validDate: String(p.validDate) }, now.date);

  return {
    kind: 'DAY',
    state,
    personName: String(p.personName ?? ''),
    centreName: String(p.centreName ?? ''),
    centreCode: String(p.centreCode ?? ''),
    batchLabel: null,
    validLabel: longDate(String(p.validDate)).toUpperCase(),
    validUntilLabel: state === 'VALID'
      ? 'One-day pass · valid today only'
      : state === 'PENDING'
        ? 'Not yet approved — do not admit'
        : state === 'REJECTED'
          ? 'This pass was declined'
          : `This pass was for ${longDate(String(p.validDate))}`,
    coversMonths: [],
    colourMonth: String(p.validDate).slice(0, 7),
    code: passCode(String(p.centreCode ?? 'BBA'), String(p.validDate), String(p.token ?? passId)),
    reasonLabel: DAY_PASS_REASON_LABELS[p.reason as keyof typeof DAY_PASS_REASON_LABELS] ?? null,
    message: state === 'EXPIRED' ? 'A one-day pass admits on its date only.' : null,
  };
}

/**
 * Public pass lookup. `d:<id>` for a day pass, anything else is a standing
 * pass token.
 *
 * The kind is encoded in the token rather than a separate query parameter, so
 * a pass URL is one opaque string that cannot be turned into a different
 * lookup by editing it.
 */
export const getPass = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 30 },
  async (req, res): Promise<void> => {
    const token = String(req.query.token ?? '');
    if (!token || token.length < 8) {
      res.status(400).json({ ok: false, error: 'Bad pass link' });
      return;
    }

    try {
      let view: PassView | null = null;

      if (token.startsWith('d:')) {
        view = await buildDayPass(token.slice(2));
      } else {
        const raw = token.startsWith('s:') ? token.slice(2) : token;
        const q = await db.collection('students').where('passToken', '==', raw).limit(1).get();
        if (!q.empty) view = await buildStandingPass(q.docs[0].id, raw);
      }

      if (!view) {
        res.status(404).json({ ok: false, error: 'That pass link is not valid.' });
        return;
      }

      res.status(200).json({
        ok: true,
        pass: view,
        colour: monthColour(view.colourMonth),
        today: istNow().date,
      });
    } catch (err) {
      logger.error('[getPass] failed', { err });
      res.status(500).json({ ok: false, error: 'Could not load the pass' });
    }
  },
);

/** Ensure a student has a pass token, and return it. */
export async function ensurePassToken(studentId: string): Promise<string> {
  const ref = db.collection('students').doc(studentId);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data()?.passToken : null;
  if (existing) return String(existing);
  const token = randomUUID().replace(/-/g, '');
  await ref.update({ passToken: token, updatedAt: new Date().toISOString() });
  return token;
}

function passUrl(token: string): string {
  const base = process.env.APP_BASE_URL ?? 'https://bba-sports-prod.web.app';
  return `${base}/pass/${encodeURIComponent(token)}`;
}

/** Email a student their standing pass link. Admin-triggered. */
export const sendStandingPass = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 60 },
  async (req, res): Promise<void> => {
    if (!config.sheets.apiKey || req.header('x-api-key') !== config.sheets.apiKey) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }
    const studentId = String(req.query.studentId ?? req.body?.studentId ?? '');
    if (!studentId) { res.status(400).json({ ok: false, error: 'studentId required' }); return; }

    try {
      const token = await ensurePassToken(studentId);
      const view = await buildStandingPass(studentId, token);
      if (!view) { res.status(404).json({ ok: false, error: 'Student not found' }); return; }

      const snap = await db.collection('students').doc(studentId).get();
      const email = snap.data()?.email as string | undefined;
      const url = passUrl(token);

      // Preview: mint the token and hand back the link without sending
      // anything. Testing a pass should never mean mailing a real parent.
      if (String(req.query.preview ?? '') === '1') {
        res.status(200).json({ ok: true, emailed: false, preview: true, url, state: view.state, validLabel: view.validLabel });
        return;
      }

      if (!email) {
        // Still useful — the office can hand over the link or print it.
        res.status(200).json({ ok: true, emailed: false, url, state: view.state, reason: 'no email on file' });
        return;
      }
      await sendMail({
        to: email,
        subject: `Your BBA gate pass — ${view.validLabel} | ${view.centreName}`,
        html: buildPassEmail(view, monthColour(view.colourMonth), url),
      });
      res.status(200).json({ ok: true, emailed: true, url, state: view.state });
    } catch (err: any) {
      logger.error('[sendStandingPass] failed', { studentId, err });
      res.status(500).json({ ok: false, error: err?.message ?? 'Internal error' });
    }
  },
);

/**
 * Day pass side effects: email the holder once a super admin approves, and
 * mirror every decision into the spreadsheet.
 *
 * The email fires on approval, never on request. A pass that has not been
 * approved is not a pass, and sending one would invite somebody to turn up
 * holding it.
 */
export const onDayPassWritten = onDocumentWritten(
  { document: 'dayPasses/{passId}', region: REGION, timeoutSeconds: 60 },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after) return;

    const passId = event.params.passId as string;
    const justApproved = before?.status !== 'APPROVED' && after.status === 'APPROVED';

    // Sheet first, so the audit row exists whether or not the email works.
    try {
      const { syncDayPassToSheet } = await import('./dayPassSheet.js');
      await syncDayPassToSheet(passId, after);
    } catch (err) {
      logger.error('[dayPass] sheet sync failed', { passId, err });
    }

    if (!justApproved || !after.email) return;

    try {
      const view = await buildDayPass(passId);
      if (!view) return;
      await sendMail({
        to: String(after.email),
        subject: `Gate pass approved — ${view.validLabel} | ${after.centreName}`,
        html: buildPassEmail(view, monthColour(view.colourMonth), passUrl(`d:${passId}`)),
      });
    } catch (err) {
      logger.error('[dayPass] email failed', { passId, err });
    }
  },
);
