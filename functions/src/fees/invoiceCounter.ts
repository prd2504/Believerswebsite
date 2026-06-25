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
  });
}
