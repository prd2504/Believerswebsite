import { db } from '../admin.js';

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

// Sequential invoice/student numbers must be gap-free for the CA, so they come
// from a single counter on the centre doc — an unavoidable serialization point.
// When several parents in one centre's WhatsApp group pay within the same second
// or two, their transactions contend on that one doc. Firestore retries
// contended transactions automatically; we raise the attempt budget well above
// the SDK default (5) so even a tight burst serializes cleanly instead of
// surfacing an error to a payer. Each attempt is a tiny read+increment, so the
// extra attempts cost only milliseconds.
const COUNTER_TX_OPTS = { maxAttempts: 25 } as const;

export async function assignExternalStudentId(
  centreId: string,
  centreCode: string,
  studentId: string,
): Promise<string> {
  const centreRef = db.collection('centres').doc(centreId);
  const studentRef = db.collection('students').doc(studentId);

  return db.runTransaction(async (tx) => {
    const centreSnap = await tx.get(centreRef);
    const current = centreSnap.data()?.lastStudentNo ?? 0;
    const next = current + 1;
    const externalId = `${centreCode}-${pad3(next)}`;

    tx.update(centreRef, { lastStudentNo: next });
    tx.update(studentRef, { externalStudentId: externalId });

    return externalId;
  }, COUNTER_TX_OPTS);
}

export async function generateExternalInvoiceNo(
  centreId: string,
  centreCode: string,
): Promise<string> {
  const centreRef = db.collection('centres').doc(centreId);

  return db.runTransaction(async (tx) => {
    const centreSnap = await tx.get(centreRef);
    const current = centreSnap.data()?.lastInvoiceNo ?? 0;
    const next = current + 1;
    const invoiceNo = `BBA-${centreCode}-${pad3(next)}`;

    tx.update(centreRef, { lastInvoiceNo: next });

    return invoiceNo;
  }, COUNTER_TX_OPTS);
}
