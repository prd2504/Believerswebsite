import { sheets as sheetsApi, auth as sheetsAuth } from '@googleapis/sheets';
import { logger } from 'firebase-functions';

const SPREADSHEET_ID = '10CHOa1P_NfP9KBdO7p3zxFk6BMTJTSEfCTbAppUqHuQ';

const CENTRE_TAB: Record<string, string> = {
  DAD: 'Payments_Dadar',
  RUI: 'Payments_Ruia',
  BAN: 'Payments_Bandra',
  RBI: 'Payments_RBI',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/**
 * Load the service-account credentials from the environment. Accepts either:
 *   - GOOGLE_SERVICE_ACCOUNT_BASE64 — base64 of the JSON file (recommended:
 *     immune to .env newline/quote mangling), or
 *   - GOOGLE_SERVICE_ACCOUNT_JSON — raw JSON, or base64 of it as a fallback.
 * Also repairs the common `\n`-escaped private_key so the JWT signer works.
 */
function loadCredentials(): { client_email: string; private_key: string; [k: string]: unknown } {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  let jsonStr: string | undefined;
  if (b64 && b64.trim()) {
    jsonStr = Buffer.from(b64.trim(), 'base64').toString('utf8');
  } else if (raw && raw.trim()) {
    const t = raw.trim();
    jsonStr = t.startsWith('{') ? t : Buffer.from(t, 'base64').toString('utf8');
  }
  if (!jsonStr) {
    throw new Error('No service account: set GOOGLE_SERVICE_ACCOUNT_BASE64 or GOOGLE_SERVICE_ACCOUNT_JSON');
  }

  let creds: any;
  try {
    creds = JSON.parse(jsonStr);
  } catch (e: any) {
    throw new Error(`Service account JSON is not valid JSON (likely .env newline mangling — use GOOGLE_SERVICE_ACCOUNT_BASE64): ${e.message}`);
  }
  if (typeof creds.private_key === 'string') {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error('Service account JSON missing client_email or private_key');
  }
  return creds;
}

function getAuth() {
  return new sheetsAuth.GoogleAuth({
    credentials: loadCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export interface SheetsPaymentPayload {
  externalInvoiceNo: string;
  now: string;
  externalStudentId: string | null;
  studentName: string;
  centreName: string;
  centreCode: string;
  month: string;
  batchName: string;
  amountRupees: number;
  method: string;
  coachName: string | null;
  screenshotUrl: string | null;
}

export async function appendPaymentToSheets(p: SheetsPaymentPayload): Promise<void> {
  const auth   = getAuth();
  const sheets = sheetsApi({ version: 'v4', auth });
  const dateStr  = formatDate(p.now);
  const monthStr = formatMonth(p.month);

  // 1. Invoice_Log tab
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Invoice_Log!A:M',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        p.externalInvoiceNo,
        dateStr,
        p.externalStudentId ?? '',
        p.studentName,
        p.centreName,
        monthStr,
        p.batchName,
        p.amountRupees,
        p.method,
        '',
        p.coachName ?? '',
        p.screenshotUrl ?? '',
        'Via bbashuttle.com/fees',
      ]],
    },
  });

  // 2. Per-centre Payments_<X> tab
  const tab = CENTRE_TAB[p.centreCode];
  if (!tab) {
    logger.warn('[sheetsSync] No tab mapping for centreCode — Invoice_Log written, per-centre tab skipped', {
      centreCode: p.centreCode,
    });
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        p.now,
        p.externalInvoiceNo,
        p.externalStudentId ?? '',
        p.studentName,
        p.batchName,
        p.amountRupees,
        monthStr,
        p.method,
        'Pending Verification',
      ]],
    },
  });
}
