/**
 * The spreadsheet column contract.
 *
 * Apps Script (Code.gs) declares each tab's headers; a Cloud Function writes
 * rows into that tab by POSITION and finds existing rows by reading one fixed
 * column. Nothing links the two. Reorder a header, or add a field to one side
 * and not the other, and every row shifts silently — the id lookup then misses,
 * so updates start appending duplicates instead.
 *
 * This reads both sides with the TypeScript parser and counts the actual array
 * elements. It replaces the line-counting check run during the session, which
 * miscounted once on a string containing a comma.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const parse = (rel: string) =>
  ts.createSourceFile(rel, readFileSync(root + rel, 'utf8'), ts.ScriptTarget.Latest, true);

/** Every array literal assigned to a variable with this name, in source order. */
function arraysNamed(sf: ts.SourceFile, name: string): ts.ArrayLiteralExpression[] {
  const found: ts.ArrayLiteralExpression[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name
        && n.initializer && ts.isArrayLiteralExpression(n.initializer)) {
      found.push(n.initializer);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/** A string-literal array's values. */
const strings = (a: ts.ArrayLiteralExpression) =>
  a.elements.map((e) => (ts.isStringLiteral(e) ? e.text : `<non-literal:${e.kind}>`));

/** The value of `const NAME = 'X'` or `= 7`. */
function constValue(sf: ts.SourceFile, name: string): string | number {
  let out: string | number | undefined;
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name && n.initializer) {
      if (ts.isStringLiteral(n.initializer)) out = n.initializer.text;
      if (ts.isNumericLiteral(n.initializer)) out = Number(n.initializer.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (out === undefined) throw new Error(`${name} not found`);
  return out;
}

/** 'A' → 1 … 'T' → 20. */
const colNumber = (letter: string) => letter.charCodeAt(0) - 64;

const gs = parse('apps-script/Code.gs');
const courtSync = parse('functions/src/slots/courtSheetSync.ts');
const passSync = parse('functions/src/passes/dayPassSheet.ts');

describe('Court_Rentals', () => {
  const headers = strings(arraysNamed(gs, 'COURT_HEADERS')[0]);
  const row = arraysNamed(courtSync, 'row')[0];   // first `row` = the booking row

  it('writes exactly as many cells as there are headers', () => {
    expect(row.elements.length).toBe(headers.length);
  });
  it('declares a last column that matches', () => {
    expect(colNumber(String(constValue(courtSync, 'BOOKING_LAST_COL')))).toBe(headers.length);
  });
  it('looks rows up by the Booking_ID column', () => {
    expect(headers[Number(constValue(courtSync, 'BOOKING_ID_COL'))]).toBe('Booking_ID');
  });
});

describe('Court_Plans', () => {
  const headers = strings(arraysNamed(gs, 'COURT_PLAN_HEADERS')[0]);
  const row = arraysNamed(courtSync, 'row')[1];   // second `row` = the plan row

  it('writes exactly as many cells as there are headers', () => {
    expect(row.elements.length).toBe(headers.length);
  });
  it('declares a last column that matches', () => {
    expect(colNumber(String(constValue(courtSync, 'PLAN_LAST_COL')))).toBe(headers.length);
  });
  it('looks rows up by the Plan_ID column', () => {
    expect(headers[Number(constValue(courtSync, 'PLAN_ID_COL'))]).toBe('Plan_ID');
  });
});

describe('Gate_Passes', () => {
  const headers = strings(arraysNamed(gs, 'GATE_PASS_HEADERS')[0]);
  const row = arraysNamed(passSync, 'row')[0];

  it('writes exactly as many cells as there are headers', () => {
    expect(row.elements.length).toBe(headers.length);
  });
  it('declares a last column that matches', () => {
    expect(colNumber(String(constValue(passSync, 'LAST_COL')))).toBe(headers.length);
  });
  it('looks rows up by the Pass_ID column', () => {
    expect(headers[Number(constValue(passSync, 'ID_COL'))]).toBe('Pass_ID');
  });
});

/**
 * Fee tabs: sheetsSync.ts appends Invoice_Log and Payments_<centre> rows by
 * position; Code.gs reads them by INV_COL / PAY_COL index. These pin both sides.
 */
describe('fee tabs: Cloud Function rows line up with Code.gs columns', () => {
  const feeSync = parse('functions/src/fees/sheetsSync.ts');

  /** The `values: [[ … ]]` row literal inside a named function. */
  function rowIn(fnName: string): ts.ArrayLiteralExpression {
    let row: ts.ArrayLiteralExpression | undefined;
    const visit = (n: ts.Node, inside: boolean) => {
      const here = inside || (ts.isFunctionDeclaration(n) && n.name?.text === fnName);
      if (here && !row && ts.isPropertyAssignment(n) && n.name.getText(feeSync) === 'values'
          && ts.isArrayLiteralExpression(n.initializer)
          && ts.isArrayLiteralExpression(n.initializer.elements[0])) {
        row = n.initializer.elements[0] as ts.ArrayLiteralExpression;
      }
      ts.forEachChild(n, (c) => visit(c, here));
    };
    visit(feeSync, false);
    if (!row) throw new Error(`no values row in ${fnName}`);
    return row;
  }

  /** `var NAME = { KEY: n, … }` from Code.gs. */
  function colMap(name: string): Record<string, number> {
    const m = readFileSync(root + 'apps-script/Code.gs', 'utf8').match(new RegExp(`var ${name}\\s*=\\s*\\{([^}]*)\\}`));
    if (!m) throw new Error(`${name} not found`);
    return Object.fromEntries(m[1].split(',').map((kv) => kv.split(':').map((x) => x.trim())).filter((kv) => kv.length === 2)
      .map(([k, v]) => [k, Number(v)]));
  }

  it('Invoice_Log row has every INV_COL column, with Month, Cycle and Covers_Until in place', () => {
    const row = rowIn('appendInvoiceLog').elements.map((e) => e.getText(feeSync));
    const cols = colMap('INV_COL');
    expect(row.length).toBe(Math.max(...Object.values(cols)) + 1);
    expect(row[cols.INVOICE]).toContain('externalInvoiceNo');
    expect(row[cols.MONTH]).toBe('monthStr');
    expect(row[cols.CYCLE]).toContain('billingCycle');
    expect(row[cols.COVERS_UNTIL]).toContain('coverageEndMonth');
  });

  it('Payments_<centre> row has every PAY_COL column, with Month, Cycle and Covers_Until in place', () => {
    const row = rowIn('appendPaymentsTab').elements.map((e) => e.getText(feeSync));
    const cols = colMap('PAY_COL');
    expect(row.length).toBe(Math.max(...Object.values(cols)) + 1);
    expect(row[cols.INVOICE]).toContain('externalInvoiceNo');
    expect(row[cols.MONTH]).toBe('monthStr');
    expect(row[cols.CYCLE]).toContain('billingCycle');
    expect(row[cols.COVERS_UNTIL]).toContain('coverageEndMonth');
  });

  it('the Covers_Until updater writes the Invoice_Log column Code.gs reads', () => {
    const src = readFileSync(root + 'functions/src/fees/sheetsSync.ts', 'utf8');
    const letter = src.match(/INVOICE_LOG_TAB\}!([A-Z])\$\{row\}/)?.[1];
    expect(letter && colNumber(letter) - 1).toBe(colMap('INV_COL').COVERS_UNTIL);
  });
});
