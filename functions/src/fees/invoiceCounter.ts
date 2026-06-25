import { db } from '../admin.js';

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

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
  });
}

export async function generateExternalInvoiceNo(centreCode: string): Promise<string> {
  const counterRef = db.collection('counters').doc('invoices');

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists ? (snap.data()?.lastInvoiceNo ?? 0) : 0;
    const next = current + 1;
    const invoiceNo = `BBA-${centreCode}-${pad3(next)}`;

    if (snap.exists) {
      tx.update(counterRef, { lastInvoiceNo: next });
    } else {
      tx.set(counterRef, { lastInvoiceNo: next });
    }

    return invoiceNo;
  });
}
