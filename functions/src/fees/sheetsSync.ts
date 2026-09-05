import { sheets as sheetsApi, auth as sheetsAuth } from '@googleapis/sheets';
import { logger } from 'firebase-functions';

export const SPREADSHEET_ID =
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
const CENTRE_CONFIG_TAB = 'Centre_Config';

/** 0-based column index → A1 column letter (0→A, 25→Z, 26→AA). */
function colLetter(idx: number): string {
  let s = '';
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

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

/**
 * The Month cell, forced to stay TEXT.
 *
 * Every write here uses valueInputOption: 'USER_ENTERED', which makes Sheets
 * parse values exactly as if a human typed them — and "Aug 2026" parses as a
 * DATE, not a string. The cell then holds a date serial, so Apps Script reads
 * it back as a Date object and every `cell === "Aug 2026"` comparison in the
 * rollover/fee-check silently fails. That is why monthly rows were never
 * cleared and why paid students could still show as unpaid.
 *
 * A leading apostrophe is the documented Sheets escape for "treat this as
 * text". It is not displayed in the cell and is not part of the stored value.
 * Do not remove it, and do not switch these appends to RAW — that would stop
 * amounts being stored as numbers.
 */
function monthCell(ym: string): string {
  return `'${formatMonth(ym)}`;
}

/** Covers_Until cell — same text-forcing rule as monthCell. */
function coversCell(ym: string): string {
  return `'${formatMonth(ym)}`;
}

function normPhone(s: string | null | undefined): string {
  const d = (s ?? '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
}
function normName(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getSheets() {
  const auth = new sheetsAuth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return sheetsApi({ version: 'v4', auth });
}

type Sheets = ReturnType<typeof getSheets>;

/**
 * Retry transient Sheets API failures (429 rate-limit, 5xx) with exponential
 * backoff. Matters when several /fees payments fan out to Sheets at once and
 * brush against the per-minute write quota.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const code = e?.code ?? e?.response?.status;
      const retriable = code === 429 || (typeof code === 'number' && code >= 500);
      if (!retriable || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 700 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

export const svcAppend = (sheets: Sheets, params: any) => withRetry(() => sheets.spreadsheets.values.append(params));
export const svcGet = (sheets: Sheets, params: any) => withRetry(() => sheets.spreadsheets.values.get(params));
export const svcUpdate = (sheets: Sheets, params: any) => withRetry(() => sheets.spreadsheets.values.update(params));
const svcBatchUpdate = (sheets: Sheets, params: any) => withRetry(() => sheets.spreadsheets.values.batchUpdate(params));

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
  /** MONTHLY or QUARTERLY — mirrored into the sheet's Cycle column. */
  billingCycle: string;
  /** Last month this payment covers, inclusive. Equals `month` for monthly. */
  coverageEndMonth: string;
  batchName: string;
  amountRupees: number;
  method: string;
  coachName: string | null;
  screenshotUrl: string | null;
  /** Latest Firestore counters to mirror into Centre_Config (null = skip). */
  lastInvoiceNo: number | null;
  lastStudentNo: number | null;
}

// ── individual writes (each thrown error is caught by the orchestrator) ──

async function appendInvoiceLog(sheets: Sheets, p: PublicFeeSyncPayload, ts: string, monthStr: string) {
  await svcAppend(sheets, {
    spreadsheetId: SPREADSHEET_ID,
    range: `${INVOICE_LOG_TAB}!A:O`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        p.externalInvoiceNo, ts, p.externalStudentId ?? '', p.studentName,
        p.centreName, monthStr, p.batchName, p.amountRupees, p.method,
        '', p.coachName ?? '', p.screenshotUrl ?? '', 'Via bbashuttle.com/fees',
        // Appended AFTER the existing 13 columns on purpose: Code.gs addresses
        // Invoice_Log by fixed index (INV_COL), so inserting mid-row would
        // silently shift every one of them.
        p.billingCycle, coversCell(p.coverageEndMonth),
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
  await svcAppend(sheets, {
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A:L`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        ts, p.externalInvoiceNo, p.externalStudentId ?? '', p.studentName,
        p.batchName, p.amountRupees, monthStr, p.method, 'Pending Verification',
        p.screenshotUrl ?? '',
        p.billingCycle, coversCell(p.coverageEndMonth),
      ]],
    },
  });
}

/** Player_Directory: find by Mobile+Name (case-insensitive). Update Batch if changed; else append. Returns isNew. */
async function findOrCreatePlayerDirectory(sheets: Sheets, p: PublicFeeSyncPayload): Promise<boolean> {
  const res = await svcGet(sheets, {
    spreadsheetId: SPREADSHEET_ID,
    range: `${PLAYER_DIRECTORY_TAB}!A:I`,
  });
  const rows = res.data.values ?? [];
  const targetId = (p.externalStudentId ?? '').trim();
  const targetPhone = normPhone(p.phone);
  const targetName = normName(p.studentName);

  // row 0 is the header; data starts at index 1 (sheet row = index + 1).
  // Match priority: the Student_ID column (A) is the reliable key — it's the
  // same stable external ID Firestore assigned, so it can't drift with a name
  // or phone typo. Fall back to canonical phone + name for legacy rows that
  // predate the ID being populated.
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rowId = (r[0] ?? '').toString().trim();
    const rowPhone = normPhone(r[2]);
    const idMatch = !!targetId && rowId === targetId;
    const contactMatch = !!targetPhone && rowPhone === targetPhone && normName(r[1]) === targetName;
    if (idMatch || contactMatch) {
      const currentBatch = (r[5] ?? '').toString();
      if (p.batchName && currentBatch !== p.batchName) {
        await svcUpdate(sheets, {
          spreadsheetId: SPREADSHEET_ID,
          range: `${PLAYER_DIRECTORY_TAB}!F${i + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[p.batchName]] },
        });
      }
      // Backfill Student_ID on a legacy row matched only by phone+name, so
      // future syncs match on the reliable key.
      if (!idMatch && targetId && !rowId) {
        await svcUpdate(sheets, {
          spreadsheetId: SPREADSHEET_ID,
          range: `${PLAYER_DIRECTORY_TAB}!A${i + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[targetId]] },
        });
      }
      return false; // existing student
    }
  }

  await svcAppend(sheets, {
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

/**
 * Mirror the latest Firestore counters into the Centre_Config sheet so it stays
 * in sync with /fees activity. Firestore is the single source of truth (the
 * Google Form is retired); this is a one-way write for visibility/back-compat.
 * Columns are detected by header name, and the centre row is matched by code or
 * name, so it tolerates differing Centre_Config layouts.
 */
async function mirrorCentreConfigCounters(
  sheets: Sheets, centreCode: string, centreName: string,
  lastInvoiceNo: number | null, lastStudentNo: number | null,
): Promise<void> {
  if (lastInvoiceNo == null && lastStudentNo == null) return;

  const res = await svcGet(sheets, {
    spreadsheetId: SPREADSHEET_ID,
    range: `${CENTRE_CONFIG_TAB}!A:Z`,
  });
  const rows = res.data.values ?? [];
  if (rows.length < 2) throw new Error('Centre_Config has no data rows');

  const headers = (rows[0] ?? []).map((h) => String(h ?? '').trim().toLowerCase());
  const invoiceCol = headers.findIndex((h) => h.includes('invoice'));
  const studentCol = headers.findIndex((h) => h.includes('student'));

  // Match the centre row by scanning all cells, so it works whether the sheet
  // keys on the prefix ("BBA-DAD"), the bare code ("DAD"), or the centre name.
  const candidates = new Set(
    [
      centreCode.trim().toLowerCase(),
      `bba-${centreCode.trim().toLowerCase()}`,
      centreName.trim().toLowerCase(),
    ].filter(Boolean),
  );
  let rowIdx = -1;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (row.some((c) => candidates.has(String(c ?? '').trim().toLowerCase()))) { rowIdx = i; break; }
  }
  if (rowIdx < 0) throw new Error(`Centre_Config: no row matching "${centreCode}" / "${centreName}"`);

  const sheetRow = rowIdx + 1;
  const data: { range: string; values: (number | string)[][] }[] = [];
  if (lastInvoiceNo != null && invoiceCol >= 0) {
    data.push({ range: `${CENTRE_CONFIG_TAB}!${colLetter(invoiceCol)}${sheetRow}`, values: [[lastInvoiceNo]] });
  }
  if (lastStudentNo != null && studentCol >= 0) {
    data.push({ range: `${CENTRE_CONFIG_TAB}!${colLetter(studentCol)}${sheetRow}`, values: [[lastStudentNo]] });
  }
  if (!data.length) throw new Error('Centre_Config: no invoice/student counter columns found');

  await svcBatchUpdate(sheets, {
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
}

async function appendAdminLog(
  sheets: Sheets, ts: string, action: string, studentName: string, centreName: string, notes: string,
) {
  await svcAppend(sheets, {
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
  // Display form for logs/emails; monthCell() is the text-forced form that
  // actually goes into the Month columns the rollover matches on.
  const monthStr = formatMonth(p.month);
  const monthText = monthCell(p.month);
  const errors: string[] = [];
  let isNew = false;

  try { isNew = await findOrCreatePlayerDirectory(sheets, p); }
  catch (e: any) { errors.push(`Player_Directory: ${e?.message}`); logger.warn('[sheetsSync] Player_Directory failed', { error: e?.message }); }

  try { await appendInvoiceLog(sheets, p, ts, monthText); }
  catch (e: any) { errors.push(`Invoice_Log: ${e?.message}`); logger.warn('[sheetsSync] Invoice_Log failed', { error: e?.message }); }

  try { await appendPaymentsTab(sheets, p, ts, monthText); }
  catch (e: any) { errors.push(`Payments: ${e?.message}`); logger.warn('[sheetsSync] Payments tab failed', { error: e?.message }); }

  try { await mirrorCentreConfigCounters(sheets, p.centreCode, p.centreName, p.lastInvoiceNo, p.lastStudentNo); }
  catch (e: any) { errors.push(`Centre_Config: ${e?.message}`); logger.warn('[sheetsSync] Centre_Config mirror failed', { error: e?.message }); }

  if (isNew) {
    try { await appendAdminLog(sheets, ts, 'New student auto-created', p.studentName, p.centreName, `ID: ${p.externalStudentId ?? ''} | Batch: ${p.batchName ?? ''}`); }
    catch (e: any) { errors.push(`admin_logs(new): ${e?.message}`); }
  }

  // NOTE: this fires when the invoice NUMBER is logged, before the email is
  // even attempted — it is not proof of delivery. "Invoice generated" (not
  // "sent") to stop it being read as an email-delivery confirmation. The
  // actual send outcome is logged separately by logAdminEvent() below, called
  // from onFeePaymentCreated after the real sendMail() attempt.
  try { await appendAdminLog(sheets, ts, 'Invoice generated', p.studentName, p.centreName, `${p.externalInvoiceNo} · Rs.${p.amountRupees} · ${monthStr}`); }
  catch (e: any) { errors.push(`admin_logs(invoice): ${e?.message}`); }

  if (errors.length) {
    try { await appendAdminLog(sheets, ts, 'SHEETS_SYNC_FAILED', p.studentName, p.centreName, errors.join(' ; ').slice(0, 500)); }
    catch { /* nothing more we can do */ }
  }

  return { isNewStudent: isNew };
}

/**
 * Standalone admin_logs writer for events outside syncPublicFeePayment's
 * pipeline — specifically the REAL outcome of an email send attempt, which
 * happens after the Sheets sync above completes. Best-effort; never throws.
 */
export async function logAdminEvent(
  action: string, studentName: string, centreName: string, notes: string, nowIso: string,
): Promise<void> {
  try {
    const sheets = getSheets();
    await appendAdminLog(sheets, formatISTDateTime(nowIso), action, studentName, centreName, notes);
  } catch (e: any) {
    logger.warn('[sheetsSync] logAdminEvent failed', { action, error: e?.message });
  }
}
