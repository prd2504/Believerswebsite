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
