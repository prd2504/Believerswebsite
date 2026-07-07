import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { sheets as sheetsApi, auth as sheetsAuth } from '@googleapis/sheets';
import { db } from '../admin.js';
import { canonicalPhone, normalizeName } from './phone.js';

/**
 * Read-only reconciliation between the Firestore `students` collection and the
 * Google Sheet `Player_Directory`. Answers the question behind "the student ID
 * isn't being fetched from the directory": which students already carry a real
 * ID, which are empty (so a payment mints a fresh one that tracks the invoice
 * number), and which have a Firestore ID that DISAGREES with the sheet.
 *
 * Writes nothing. Use it to decide the backfill before running one.
 *
 *   GET /reconcileStudentIds
 *   GET /reconcileStudentIds?centreCode=RBI
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

/** "RBI-047" -> 47. Used to find the current highest-in-use number per centre,
 * so lastStudentNo can be set to the true max (there's no sort-by-external-ID
 * view in the admin UI). */
function parseIdNumber(externalId: string | null | undefined): number | null {
  if (!externalId) return null;
  const m = String(externalId).match(/-(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

export const reconcileStudentIds = onRequest(
  { region: 'asia-south1', cors: true, timeoutSeconds: 120 },
  async (req, res): Promise<void> => {
    try {
      const centreCodeFilter = (req.query.centreCode as string | undefined)?.trim().toUpperCase();

      // ── Firestore side ──
      const centresSnap = await db.collection('centres').get();
      const centreById = new Map<string, { code: string; name: string }>();
      centresSnap.docs.forEach((d) => {
        const data = d.data();
        centreById.set(d.id, { code: (data.centreCode ?? '').toUpperCase(), name: data.name ?? d.id });
      });

      const studentsSnap = await db.collection('students').get();

      // ── Sheet side: Player_Directory rows (A=Student_ID, B=Name, C=Mobile) ──
      const sheets = getSheets();
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${PLAYER_DIRECTORY_TAB}!A:C`,
      });
      const rows = resp.data.values ?? [];

      // Index sheet rows by canonical phone and by normalized name (a student
      // may be findable by either). A phone can legitimately map to several
      // rows (siblings), so keep arrays.
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

      // ── Classify each Firestore student ──
      const perCentre: Record<string, any> = {};
      const backfillable: any[] = [];   // Firestore ID empty, sheet has exactly one confident match
      const conflicts: any[] = [];      // Firestore ID present but differs from the sheet's ID
      const ambiguous: any[] = [];      // empty Firestore ID, but 0 or >1 sheet matches → needs a human
      const okAlready: any[] = [];      // Firestore ID present and matches the sheet (or no sheet row)

      // externalStudentId -> [{studentId, name}] per centre, to both find the
      // current max (for lastStudentNo) and catch two students accidentally
      // sharing one ID (e.g. after a manual rename in the admin UI).
      const idHolders: Record<string, Map<string, { studentId: string; name: string }[]>> = {};

      studentsSnap.docs.forEach((d) => {
        const s = d.data();
        const centreId = s.primaryCentreId as string | undefined;
        if (!centreId) return;
        const centre = centreById.get(centreId);
        if (!centre) return;
        if (centreCodeFilter && centre.code !== centreCodeFilter) return;

        const cc = centre.code || centreId;
        perCentre[cc] ??= { total: 0, firestoreIdSet: 0, firestoreIdEmpty: 0, backfillable: 0, conflicts: 0, ambiguous: 0 };
        perCentre[cc].total += 1;

        const fsId = String(s.externalStudentId ?? '').trim();
        const phone = canonicalPhone(s.phone);
        const nameKey = normalizeName(s.name);

        if (fsId) {
          const holders = idHolders[cc] ??= new Map();
          const arr = holders.get(fsId) ?? [];
          arr.push({ studentId: d.id, name: s.name ?? '' });
          holders.set(fsId, arr);
        }

        // Prefer a phone match (more specific), fall back to name match.
        const phoneMatches = (byPhone.get(phone) ?? []).filter((m) => normalizeName(m.name) === nameKey);
        const nameMatches = byName.get(nameKey) ?? [];
        const matches = phoneMatches.length ? phoneMatches : nameMatches;
        const uniqueIds = [...new Set(matches.map((m) => m.id))];
        const base = { studentId: d.id, name: s.name ?? '', phone: phone || null, centreCode: cc, firestoreId: fsId || null, sheetIds: uniqueIds };

        if (fsId) {
          perCentre[cc].firestoreIdSet += 1;
          if (uniqueIds.length === 1 && uniqueIds[0] !== fsId) {
            perCentre[cc].conflicts += 1;
            conflicts.push({ ...base, sheetId: uniqueIds[0] });
          } else {
            okAlready.push(base);
          }
        } else {
          perCentre[cc].firestoreIdEmpty += 1;
          if (uniqueIds.length === 1) {
            perCentre[cc].backfillable += 1;
            backfillable.push({ ...base, proposedId: uniqueIds[0] });
          } else {
            perCentre[cc].ambiguous += 1;
            ambiguous.push(base); // 0 matches (no sheet ID) or >1 (siblings/dupes)
          }
        }
      });

      // Highest number currently in use per centre (→ what lastStudentNo should
      // be, since the admin UI has no sort-by-external-ID view), and any ID
      // held by more than one student (a real collision — should be zero).
      const duplicateExternalIds: any[] = [];
      Object.entries(idHolders).forEach(([cc, holders]) => {
        let highestNumber: number | null = null;
        let highestId: string | null = null;
        holders.forEach((studentsForId, id) => {
          const n = parseIdNumber(id);
          if (n != null && (highestNumber == null || n > highestNumber)) { highestNumber = n; highestId = id; }
          if (studentsForId.length > 1) {
            duplicateExternalIds.push({ centreCode: cc, externalStudentId: id, students: studentsForId });
          }
        });
        perCentre[cc] ??= {};
        perCentre[cc].highestExternalId = highestId;
        perCentre[cc].highestExternalNumber = highestNumber;
        perCentre[cc].suggestedLastStudentNo = highestNumber; // set centres/{id}.lastStudentNo to this
      });

      logger.info('[reconcileStudentIds] done', {
        backfillable: backfillable.length, conflicts: conflicts.length, ambiguous: ambiguous.length,
        duplicateExternalIds: duplicateExternalIds.length,
      });

      res.status(200).json({
        ok: true,
        perCentre,
        summary: {
          backfillable: backfillable.length,
          conflicts: conflicts.length,
          ambiguous: ambiguous.length,
          okAlready: okAlready.length,
          duplicateExternalIds: duplicateExternalIds.length,
        },
        // The actionable lists (capped so the payload stays readable).
        backfillable: backfillable.slice(0, 200),
        conflicts: conflicts.slice(0, 200),
        ambiguous: ambiguous.slice(0, 200),
        duplicateExternalIds,
      });
    } catch (err: any) {
      logger.error('[reconcileStudentIds] error', { error: err?.message });
      res.status(500).json({ ok: false, error: err?.message ?? 'Internal server error' });
    }
  },
);
