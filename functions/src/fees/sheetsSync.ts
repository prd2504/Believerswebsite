import { sheets as sheetsApi, auth as sheetsAuth } from '@googleapis/sheets';
import { logger } from 'firebase-functions';

const SPREADSHEET_ID =
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '10CHOa1P_NfP9KBdO7p3zxFk6BMTJTSEfCTbAppUqHuQ';

const CENTRE_TAB: Record<string, string> = {
  DAD: 'Payments_Dadar',
  RUI: 'Payments_Ruia',
  BAN: 'Payments_Bandra',
  RBI: 'Payments_RBI',
};
const INVOICE_LOG_TAB = 'Invoice_Log';
const PLAYER_DIRECTORY_TAB = 'Player_Directory';
const ADMIN_LOGS_TAB = 'admin_logs';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** DD/MM/YYYY HH:MM:SS in IST — used for every timestamp column. */
function formatISTDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}:${g('second')}`;
}

/** "29 Jun 2026" in IST — used for Join_Date only. */
function formatJoinDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('day')} ${g('month')} ${g('year')}`;
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function normPhone(s: string | null | undefined): string {
  const d = (s ?? '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
}
function normName(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getSheets() {
  const auth = new sheetsAuth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return sheetsApi({ version: 'v4', auth });
}

type Sheets = ReturnType<typeof getSheets>;

export interface PublicFeeSyncPayload {
  externalInvoiceNo: string;
  nowIso: string;
  externalStudentId: string | null;
  studentName: string;
  phone: string | null;
  email: string | null;
  centreName: string;
  centreCode: string;
  month: string;
  batchName: string;
  amountRupees: number;
  method: string;
  coachName: string | null;
  screenshotUrl: string | null;
}

// ── individual writes (each thrown error is caught by the orchestrator) ──

async function appendInvoiceLog(sheets: Sheets, p: PublicFeeSyncPayload, ts: string, monthStr: string) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${INVOICE_LOG_TAB}!A:M`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        p.externalInvoiceNo, ts, p.externalStudentId ?? '', p.studentName,
        p.centreName, monthStr, p.batchName, p.amountRupees, p.method,
        '', p.coachName ?? '', p.screenshotUrl ?? '', 'Via bbashuttle.com/fees',
      ]],
    },
  });
}

async function appendPaymentsTab(sheets: Sheets, p: PublicFeeSyncPayload, ts: string, monthStr: string) {
  const tab = CENTRE_TAB[p.centreCode];
  if (!tab) {
    logger.warn('[sheetsSync] no per-centre tab for centreCode', { centreCode: p.centreCode });
    return;
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        ts, p.externalInvoiceNo, p.externalStudentId ?? '', p.studentName,
        p.batchName, p.amountRupees, monthStr, p.method, 'Pending Verification',
      ]],
    },
  });
}

/** Player_Directory: find by Mobile+Name (case-insensitive). Update Batch if changed; else append. Returns isNew. */
async function findOrCreatePlayerDirectory(sheets: Sheets, p: PublicFeeSyncPayload): Promise<boolean> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PLAYER_DIRECTORY_TAB}!A:I`,
  });
  const rows = res.data.values ?? [];
  const targetPhone = normPhone(p.phone);
  const targetName = normName(p.studentName);

  // row 0 is the header; data starts at index 1 (sheet row = index + 1)
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rowPhone = normPhone(r[2]);
    if (targetPhone && rowPhone === targetPhone && normName(r[1]) === targetName) {
      const currentBatch = (r[5] ?? '').toString();
      if (p.batchName && currentBatch !== p.batchName) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${PLAYER_DIRECTORY_TAB}!F${i + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[p.batchName]] },
        });
      }
      return false; // existing student
    }
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PLAYER_DIRECTORY_TAB}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        p.externalStudentId ?? '', p.studentName, p.phone ?? '', p.email ?? '',
        p.centreName, p.batchName ?? '', formatJoinDate(p.nowIso), 'Active',
        'Auto-created via bbashuttle.com/fees',
      ]],
    },
  });
  return true; // new student
}

async function appendAdminLog(
  sheets: Sheets, ts: string, action: string, studentName: string, centreName: string, notes: string,
) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ADMIN_LOGS_TAB}!A:E`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[ts, action, studentName, centreName, notes]] },
  });
}

/**
 * Full Apps Script parity for a PUBLIC_FEES_PAGE payment. Every write is
 * best-effort; a failure in one never blocks the others. Returns whether a new
 * Player_Directory student was created (so the caller can send a welcome email).
 */
export async function syncPublicFeePayment(p: PublicFeeSyncPayload): Promise<{ isNewStudent: boolean }> {
  const sheets = getSheets();
  const ts = formatISTDateTime(p.nowIso);
  const monthStr = formatMonth(p.month);
  const errors: string[] = [];
  let isNew = false;

  try { isNew = await findOrCreatePlayerDirectory(sheets, p); }
  catch (e: any) { errors.push(`Player_Directory: ${e?.message}`); logger.warn('[sheetsSync] Player_Directory failed', { error: e?.message }); }

  try { await appendInvoiceLog(sheets, p, ts, monthStr); }
  catch (e: any) { errors.push(`Invoice_Log: ${e?.message}`); logger.warn('[sheetsSync] Invoice_Log failed', { error: e?.message }); }

  try { await appendPaymentsTab(sheets, p, ts, monthStr); }
  catch (e: any) { errors.push(`Payments: ${e?.message}`); logger.warn('[sheetsSync] Payments tab failed', { error: e?.message }); }

  if (isNew) {
    try { await appendAdminLog(sheets, ts, 'New student auto-created', p.studentName, p.centreName, `ID: ${p.externalStudentId ?? ''} | Batch: ${p.batchName ?? ''}`); }
    catch (e: any) { errors.push(`admin_logs(new): ${e?.message}`); }
  }

  try { await appendAdminLog(sheets, ts, 'Invoice sent', p.studentName, p.centreName, `${p.externalInvoiceNo} · Rs.${p.amountRupees} · ${monthStr}`); }
  catch (e: any) { errors.push(`admin_logs(invoice): ${e?.message}`); }

  if (errors.length) {
    try { await appendAdminLog(sheets, ts, 'SHEETS_SYNC_FAILED', p.studentName, p.centreName, errors.join(' ; ').slice(0, 500)); }
    catch { /* nothing more we can do */ }
  }

  return { isNewStudent: isNew };
}
