/**
 * Mirror every day pass into the spreadsheet.
 *
 * A day pass is a discretionary admission — someone let in without paying for
 * the month. That is exactly the kind of decision that needs a paper trail:
 * who asked, who approved, for whom, on what date and why. Kept in the sheet
 * so it can be read next to the fee tabs without opening the app.
 *
 * Every write mirrors, not just approvals, so a request that was declined is
 * as visible as one that was granted — a pattern of declined requests is worth
 * seeing.
 */

import { getSheets, svcAppend, svcGet, svcUpdate, SPREADSHEET_ID } from '../fees/sheetsSync.js';

const TAB = 'Gate_Passes';
const LAST_COL = 'L';
const ID_COL = 11; // L

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "05 Oct 2026", from an explicit table — en-IN renders September as "Sept". */
function fmtDate(iso: string): string {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

function tsToIso(ts: unknown): string {
  if (!ts) return '';
  if (typeof ts === 'string') return ts;
  if (typeof ts === 'object' && ts && 'toDate' in ts) {
    return (ts as { toDate(): Date }).toDate().toISOString();
  }
  return '';
}

export async function syncDayPassToSheet(
  passId: string,
  p: FirebaseFirestore.DocumentData,
): Promise<void> {
  const sheets = getSheets();

  const row = [
    new Date().toISOString(),
    // Text-forced: USER_ENTERED turns "05 Oct 2026" into a serial, which is
    // what silently broke the monthly rollover for two months.
    `'${fmtDate(String(p.validDate ?? ''))}`,
    String(p.centreName ?? ''),
    String(p.personName ?? ''),
    String(p.phone ?? ''),
    String(p.email ?? ''),
    String(p.reason ?? ''),
    String(p.notes ?? ''),
    String(p.status ?? ''),
    String(p.requestedByName ?? ''),
    String(p.approvedByName ?? ''),
    passId,
  ];

  const existing = await svcGet(sheets, {
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A:${LAST_COL}`,
  }).catch(() => null);

  const rows: string[][] = (existing?.data?.values as string[][]) ?? [];
  const found = rows.findIndex((r, i) => i > 0 && r[ID_COL] === passId);

  if (found > 0) {
    await svcUpdate(sheets, {
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB}!A${found + 1}:${LAST_COL}${found + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  } else {
    await svcAppend(sheets, {
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB}!A:${LAST_COL}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  }
  void tsToIso;
}
