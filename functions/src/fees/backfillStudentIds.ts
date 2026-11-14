import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { sheets as sheetsApi, auth as sheetsAuth } from '@googleapis/sheets';
import { db } from '../admin.js';
import { canonicalPhone, normalizeName } from './phone.js';

/**
 * Restores each student's ORIGINAL id from the Google Sheet Player_Directory
 * into Firestore's externalStudentId, so the fee flow stops minting fresh ids
 * that track the invoice counter. Uses the same phone+name matching as
 * reconcileStudentIds, so the reconciliation report is a faithful preview.
 *
 *   GET /backfillStudentIds?token=…                 → dry run, backfillable only
 *   GET /backfillStudentIds?token=…&centreCode=RBI  → scope to one centre
 *   GET /backfillStudentIds?token=…&includeConflicts=true   → also overwrite a
 *        minted id (e.g. RBI-055) with the sheet's original id
 *   GET /backfillStudentIds?token=…&execute=true    → apply the writes
 *
 * Safety: gated behind CLEANUP_TOKEN, dry-run by default. Only ever fills (or,
 * with includeConflicts, replaces) externalStudentId — touches nothing else. Genuinely
 * new students (no Player_Directory id) are left with their current id.
 * Returns each change with the student's invoice numbers so the corresponding
 * Sheet rows (Payments_<centre> / Invoice_Log Student_ID column) can be fixed.
 */

const SPREADSHEET_ID =
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '10CHOa1P_NfP9KBdO7p3zxFk6BMTJTSEfCTbAppUqHuQ';
const PLAYER_DIRECTORY_TAB = 'Player_Directory';

function getSheets() {
  const auth = new sheetsAuth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return sheetsApi({ version: 'v4', auth });
}

export const backfillStudentIds = onRequest(
  { region: 'asia-south1', cors: true, timeoutSeconds: 300 },
  async (req, res): Promise<void> => {
    const secret = process.env.CLEANUP_TOKEN;
    if (!secret) {
      res.status(403).json({ ok: false, error: 'Disabled: CLEANUP_TOKEN is not set.' });
      return;
    }
    const token = (req.query.token as string | undefined) ?? req.header('x-cleanup-token');
    if (token !== secret) {
      res.status(401).json({ ok: false, error: 'Invalid token' });
      return;
    }

    const centreCodeFilter = (req.query.centreCode as string | undefined)?.trim().toUpperCase();
    const includeConflicts = req.query.includeConflicts === 'true';
    const execute = req.query.execute === 'true';

    try {
      const centresSnap = await db.collection('centres').get();
      const centreById = new Map<string, { code: string; name: string }>();
      centresSnap.docs.forEach((d) => {
        const data = d.data();
        centreById.set(d.id, { code: (data.centreCode ?? '').toUpperCase(), name: data.name ?? d.id });
      });

      const studentsSnap = await db.collection('students').get();

      // Payments per student → invoice numbers, so the caller knows which Sheet
      // rows to correct after the Firestore ids change.
      const paymentsSnap = await db.collection('payments').get();
      const invoicesByStudent = new Map<string, string[]>();
      paymentsSnap.docs.forEach((d) => {
        const sid = d.data().studentId as string | undefined;
        const inv = d.data().externalInvoiceNo as string | undefined;
        if (sid && inv) { const a = invoicesByStudent.get(sid) ?? []; a.push(inv); invoicesByStudent.set(sid, a); }
      });

      // Index Player_Directory by canonical phone + normalized name.
      const sheets = getSheets();
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID, range: `${PLAYER_DIRECTORY_TAB}!A:C`,
      });
      const rows = resp.data.values ?? [];
      const byPhone = new Map<string, { id: string; name: string }[]>();
      const byName = new Map<string, { id: string; name: string }[]>();
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] ?? [];
        const sheetId = String(r[0] ?? '').trim();
        const name = String(r[1] ?? '').trim();
        const phone = canonicalPhone(r[2]);
        if (!sheetId) continue;
        const entry = { id: sheetId, name };
        if (phone) { const a = byPhone.get(phone) ?? []; a.push(entry); byPhone.set(phone, a); }
        const nk = normalizeName(name);
        if (nk) { const a = byName.get(nk) ?? []; a.push(entry); byName.set(nk, a); }
      }

      const planned: any[] = [];   // { studentId, name, from, to, kind, invoices }
      const skipped: any[] = [];   // ambiguous / no match
      const contested: any[] = []; // two+ different students both proposing the same target id

      studentsSnap.docs.forEach((d) => {
        const s = d.data();
        const centreId = s.primaryCentreId as string | undefined;
        if (!centreId) return;
        const centre = centreById.get(centreId);
        if (!centre) return;
        if (centreCodeFilter && centre.code !== centreCodeFilter) return;

        const fsId = String(s.externalStudentId ?? '').trim();
        const phone = canonicalPhone(s.phone);
        const nameKey = normalizeName(s.name);
        const phoneMatches = (byPhone.get(phone) ?? []).filter((m) => normalizeName(m.name) === nameKey);
        const nameMatches = byName.get(nameKey) ?? [];
        const uniqueIds = [...new Set((phoneMatches.length ? phoneMatches : nameMatches).map((m) => m.id))];

        const rec = {
          studentId: d.id, name: s.name ?? '', centreCode: centre.code,
          from: fsId || null, to: uniqueIds[0] ?? null,
          invoices: invoicesByStudent.get(d.id) ?? [],
        };

        if (uniqueIds.length !== 1) {
          if (!fsId) skipped.push({ ...rec, reason: uniqueIds.length === 0 ? 'no Player_Directory id' : `${uniqueIds.length} possible ids` });
          return;
        }
        const sheetId = uniqueIds[0];
        if (!fsId) planned.push({ ...rec, kind: 'backfill' });          // empty → restore
        else if (fsId !== sheetId && includeConflicts) planned.push({ ...rec, kind: 'conflict-overwrite' });
        // fsId === sheetId → already correct, nothing to do
      });

      // Safety net: if two or more DIFFERENT students both resolve to the same
      // target id (e.g. two placeholder-phone same-name students both matching
      // the one sheet row — seen in practice with "Swayam" appearing twice at
      // Dadar), writing them all would silently create a duplicateExternalIds
      // collision. Pull every contested id OUT of planned entirely — none of
      // them get written, even the "right" one — since we can't tell which
      // (if any) is actually correct without a human looking. Re-run
      // setStudentExternalId by hand once you know which student it really is.
      const targetCounts = new Map<string, number>();
      planned.forEach((p) => targetCounts.set(p.to, (targetCounts.get(p.to) ?? 0) + 1));
      const contestedIds = new Set([...targetCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id));
      if (contestedIds.size) {
        for (let i = planned.length - 1; i >= 0; i--) {
          if (contestedIds.has(planned[i].to)) contested.push(...planned.splice(i, 1));
        }
      }

      if (execute) {
        // Firestore batches cap at 500 writes.
        for (let i = 0; i < planned.length; i += 400) {
          const batch = db.batch();
          planned.slice(i, i + 400).forEach((p) => {
            batch.update(db.doc(`students/${p.studentId}`), {
              externalStudentId: p.to, updatedAt: new Date().toISOString(),
            });
          });
          await batch.commit();
        }
        logger.info('[backfillStudentIds] applied', { changed: planned.length });
      }

      res.status(200).json({
        ok: true,
        dryRun: !execute,
        summary: {
          willChange: planned.length,
          backfills: planned.filter((p) => p.kind === 'backfill').length,
          conflictOverwrites: planned.filter((p) => p.kind === 'conflict-overwrite').length,
          skipped: skipped.length,
          contested: contested.length,
          includeConflicts,
        },
        planned: planned.slice(0, 300),
        skipped: skipped.slice(0, 100),
        contested: contested.slice(0, 100),
        note: execute ? 'Applied.' : 'Dry run — add &execute=true to apply. Then correct the Student_ID column in the Sheet rows for the listed invoices, and reset each centre\'s lastStudentNo counter to its true max. Check "contested" — those need a human call via setStudentExternalId, not this bulk tool.',
      });
    } catch (err: any) {
      logger.error('[backfillStudentIds] error', { error: err?.message });
      res.status(500).json({ ok: false, error: err?.message ?? 'Internal server error' });
    }
  },
);
