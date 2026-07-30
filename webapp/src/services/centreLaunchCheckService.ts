/**
 * Pre-flight checks for taking a centre's public /fees page live.
 *
 * The one that actually matters is the ID-counter check. `externalStudentId`
 * (RUI-001) and `externalInvoiceNo` (BBA-RUI-001) are minted by incrementing
 * `lastStudentNo` / `lastInvoiceNo` on the centre doc, and those fields default
 * to 0 when absent. So a centre whose students were numbered by hand — or
 * imported from the old Sheets flow — will re-mint IDs that are already in use
 * the moment its first public payment lands, silently creating duplicates.
 *
 * There is no admin UI that writes these counters (the centre form deliberately
 * doesn't touch them), so before this they could only be checked and set from
 * the Firebase console — easy to forget on launch day.
 */

import { collection, doc, getDocs, query, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@bba/shared';

/** Trailing digits of an ID (`RUI-012` → 12). Null when there are none. */
function trailingNo(id: string | null | undefined): number | null {
  if (!id) return null;
  const m = /(\d+)\s*$/.exec(String(id).trim());
  return m ? Number(m[1]) : null;
}

export interface IdCounterHealth {
  /** Counter currently stored on the centre doc. */
  counter: number;
  /** Highest number actually in use by an existing record. */
  maxInUse: number;
  /** IDs that appear on more than one record — already-corrupted data. */
  duplicates: string[];
  /** IDs that don't carry this centre's prefix — likely mis-filed records. */
  foreign: string[];
  /** Records of this centre with no ID assigned at all. */
  missing: number;
  /**
   * True when the next mint would collide with an ID already in use, i.e.
   * counter < maxInUse. This is the launch-blocking condition.
   */
  willCollide: boolean;
}

export interface CentreLaunchCheck {
  centreId: string;
  centreName: string;
  centreCode: string | null;
  active: boolean;
  studentCount: number;
  paymentCount: number;
  batchCount: number;
  students: IdCounterHealth;
  invoices: IdCounterHealth;
  /** Everything that must be true before the public page can safely take money. */
  blockers: string[];
}

function analyse(
  ids: (string | null)[],
  counter: number,
  expectedPrefix: string | null,
): IdCounterHealth {
  const present = ids.filter((v): v is string => !!v && v.trim().length > 0);
  const missing = ids.length - present.length;

  const seen = new Map<string, number>();
  present.forEach((v) => seen.set(v, (seen.get(v) ?? 0) + 1));
  const duplicates = Array.from(seen.entries())
    .filter(([, n]) => n > 1)
    .map(([v]) => v)
    .sort();

  const foreign = expectedPrefix
    ? Array.from(seen.keys()).filter((v) => !v.toUpperCase().startsWith(expectedPrefix.toUpperCase())).sort()
    : [];

  // Only IDs carrying this centre's prefix inform the counter — a stray
  // DAD-004 sitting on a Ruia student must not push Ruia's counter to 4.
  const own = expectedPrefix
    ? present.filter((v) => v.toUpperCase().startsWith(expectedPrefix.toUpperCase()))
    : present;
  const maxInUse = own.reduce((max, v) => Math.max(max, trailingNo(v) ?? 0), 0);

  return {
    counter,
    maxInUse,
    duplicates,
    foreign,
    missing,
    willCollide: counter < maxInUse,
  };
}

export async function checkCentreLaunchReadiness(centre: {
  id: string;
  name: string;
  centreCode: string | null;
  active: boolean;
  lastStudentNo: number;
  lastInvoiceNo: number;
}): Promise<CentreLaunchCheck> {
  const [studentSnap, paymentSnap, batchSnap] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.students), where('primaryCentreId', '==', centre.id))),
    getDocs(query(collection(db, COLLECTIONS.payments), where('centreId', '==', centre.id))),
    getDocs(query(collection(db, COLLECTIONS.batches), where('centreId', '==', centre.id))),
  ]);

  const students = analyse(
    studentSnap.docs.map((d) => (d.data().externalStudentId ?? null) as string | null),
    centre.lastStudentNo,
    centre.centreCode,
  );

  const invoices = analyse(
    paymentSnap.docs.map((d) => (d.data().externalInvoiceNo ?? null) as string | null),
    centre.lastInvoiceNo,
    centre.centreCode ? `BBA-${centre.centreCode}` : null,
  );

  const blockers: string[] = [];
  if (!centre.centreCode) {
    blockers.push('No centre code set — the public /fees page cannot resolve this centre.');
  }
  if (!centre.active) {
    blockers.push('Centre is inactive — it will not appear on the /fees page.');
  }
  if (students.willCollide) {
    blockers.push(
      `Student counter is ${students.counter} but ${centre.centreCode}-${String(students.maxInUse).padStart(3, '0')} is already in use — ` +
      `the next ${students.maxInUse - students.counter} registration(s) would duplicate existing IDs.`,
    );
  }
  if (invoices.willCollide) {
    blockers.push(
      `Invoice counter is ${invoices.counter} but BBA-${centre.centreCode}-${String(invoices.maxInUse).padStart(3, '0')} is already issued — ` +
      `the next ${invoices.maxInUse - invoices.counter} payment(s) would duplicate invoice numbers.`,
    );
  }
  if (students.duplicates.length > 0) {
    blockers.push(`${students.duplicates.length} student ID(s) already duplicated: ${students.duplicates.slice(0, 5).join(', ')}`);
  }
  if (invoices.duplicates.length > 0) {
    blockers.push(`${invoices.duplicates.length} invoice number(s) already duplicated: ${invoices.duplicates.slice(0, 5).join(', ')}`);
  }

  return {
    centreId: centre.id,
    centreName: centre.name,
    centreCode: centre.centreCode,
    active: centre.active,
    studentCount: studentSnap.size,
    paymentCount: paymentSnap.size,
    batchCount: batchSnap.size,
    students,
    invoices,
    blockers,
  };
}

/**
 * Set the ID counters on a centre. Deliberately separate from updateCentre(),
 * which never touches these — a counter is only ever moved on purpose, and
 * only ever forward (moving it back would re-issue numbers already used).
 */
export async function setCentreCounters(
  centreId: string,
  patch: { lastStudentNo?: number; lastInvoiceNo?: number },
  userId: string,
): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: serverTimestamp(), updatedBy: userId };
  if (typeof patch.lastStudentNo === 'number') update.lastStudentNo = patch.lastStudentNo;
  if (typeof patch.lastInvoiceNo === 'number') update.lastInvoiceNo = patch.lastInvoiceNo;
  await updateDoc(doc(db, COLLECTIONS.centres, centreId), update);
}
