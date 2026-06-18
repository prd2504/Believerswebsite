import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS, rupeesToPaise, paiseToRupees } from '@bba/shared';
import type {
  StaffDocument,
  PayrollRunDocument,
  EmploymentType,
  PayrollRunStatus,
} from '@bba/shared';
import type { StaffFormValues, PayrollRunFormValues } from '@/lib/schemas/payrollSchema';

function toIso(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts)
    return (ts as Timestamp).toDate().toISOString();
  return new Date().toISOString();
}

// ── Staff ──

function staffFromFirestore(id: string, d: DocumentData): StaffDocument {
  return {
    id,
    staffCode: d.staffCode ?? '',
    name: d.name ?? '',
    phone: d.phone ?? null,
    email: d.email ?? null,
    authUid: d.authUid ?? null,
    centreIds: Array.isArray(d.centreIds) ? d.centreIds : [],
    employmentType: (d.employmentType ?? 'SALARIED') as EmploymentType,
    ratePaise: d.ratePaise ?? 0,
    bankAccountLast4: d.bankAccountLast4 ?? null,
    upiId: d.upiId ?? null,
    dateOfJoining: d.dateOfJoining ?? null,
    status: d.status ?? 'ACTIVE',
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    createdBy: d.createdBy ?? null,
    updatedBy: d.updatedBy ?? null,
  };
}

export async function getAllStaff(): Promise<StaffDocument[]> {
  const q = query(collection(db, COLLECTIONS.staff), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => staffFromFirestore(d.id, d.data()));
}

export async function getStaffById(id: string): Promise<StaffDocument | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.staff, id));
  if (!snap.exists()) return null;
  return staffFromFirestore(snap.id, snap.data());
}

export async function createStaff(values: StaffFormValues, userId: string): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.staff), {
    staffCode: values.staffCode.trim(),
    name: values.name.trim(),
    phone: values.phone?.trim() || null,
    email: values.email?.trim() || null,
    authUid: null,
    centreIds: values.centreIds,
    employmentType: values.employmentType,
    ratePaise: rupeesToPaise(values.rateRupees),
    bankAccountLast4: values.bankAccountLast4?.trim() || null,
    upiId: values.upiId?.trim() || null,
    dateOfJoining: values.dateOfJoining || null,
    status: 'ACTIVE',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  });
  return ref.id;
}

export async function updateStaff(
  staffId: string,
  values: StaffFormValues,
  userId: string,
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.staff, staffId), {
    staffCode: values.staffCode.trim(),
    name: values.name.trim(),
    phone: values.phone?.trim() || null,
    email: values.email?.trim() || null,
    centreIds: values.centreIds,
    employmentType: values.employmentType,
    ratePaise: rupeesToPaise(values.rateRupees),
    bankAccountLast4: values.bankAccountLast4?.trim() || null,
    upiId: values.upiId?.trim() || null,
    dateOfJoining: values.dateOfJoining || null,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

export async function deleteStaff(staffId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.staff, staffId));
}

// ── Payroll Runs ──

function runFromFirestore(id: string, d: DocumentData): PayrollRunDocument {
  return {
    id,
    staffId: d.staffId ?? '',
    staffName: d.staffName ?? '',
    centreIds: Array.isArray(d.centreIds) ? d.centreIds : [],
    month: d.month ?? '',
    employmentType: (d.employmentType ?? 'SALARIED') as EmploymentType,
    sessionsCount: d.sessionsCount ?? 0,
    basicPaise: d.basicPaise ?? 0,
    perSessionPayPaise: d.perSessionPayPaise ?? 0,
    allowancesPaise: d.allowancesPaise ?? 0,
    professionalTaxPaise: d.professionalTaxPaise ?? 0,
    tdsPaise: d.tdsPaise ?? 0,
    advanceRecoveryPaise: d.advanceRecoveryPaise ?? 0,
    otherDeductionsPaise: d.otherDeductionsPaise ?? 0,
    grossPayPaise: d.grossPayPaise ?? 0,
    totalDeductionsPaise: d.totalDeductionsPaise ?? 0,
    netPayPaise: d.netPayPaise ?? 0,
    status: (d.status ?? 'DRAFT') as PayrollRunStatus,
    approvedBy: d.approvedBy ?? null,
    approvedAt: d.approvedAt ?? null,
    paymentRef: d.paymentRef ?? null,
    paidAt: d.paidAt ?? null,
    notes: d.notes ?? null,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    createdBy: d.createdBy ?? null,
    updatedBy: d.updatedBy ?? null,
  };
}

export async function getAllPayrollRuns(): Promise<PayrollRunDocument[]> {
  const q = query(collection(db, COLLECTIONS.payrollRuns), orderBy('month', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => runFromFirestore(d.id, d.data()));
}

export async function getPayrollRunsByMonth(month: string): Promise<PayrollRunDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.payrollRuns),
    where('month', '==', month),
    orderBy('staffName', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => runFromFirestore(d.id, d.data()));
}

export async function createPayrollRun(
  values: PayrollRunFormValues,
  staff: StaffDocument,
  userId: string,
): Promise<string> {
  const basicPaise = rupeesToPaise(values.basicRupees);
  const perSessionPaise = rupeesToPaise(values.perSessionPayRupees);
  const allowancesPaise = rupeesToPaise(values.allowancesRupees);
  const grossPaise = basicPaise + perSessionPaise + allowancesPaise;

  const ptPaise = rupeesToPaise(values.professionalTaxRupees);
  const tdsPaise = rupeesToPaise(values.tdsRupees);
  const advancePaise = rupeesToPaise(values.advanceRecoveryRupees);
  const otherPaise = rupeesToPaise(values.otherDeductionsRupees);
  const totalDeductions = ptPaise + tdsPaise + advancePaise + otherPaise;
  const netPaise = grossPaise - totalDeductions;

  const ref = await addDoc(collection(db, COLLECTIONS.payrollRuns), {
    staffId: staff.id,
    staffName: staff.name,
    centreIds: staff.centreIds,
    month: values.month,
    employmentType: staff.employmentType,
    sessionsCount: values.sessionsCount,
    basicPaise,
    perSessionPayPaise: perSessionPaise,
    allowancesPaise,
    professionalTaxPaise: ptPaise,
    tdsPaise,
    advanceRecoveryPaise: advancePaise,
    otherDeductionsPaise: otherPaise,
    grossPayPaise: grossPaise,
    totalDeductionsPaise: totalDeductions,
    netPayPaise: netPaise,
    status: 'DRAFT',
    approvedBy: null,
    approvedAt: null,
    paymentRef: null,
    paidAt: null,
    notes: values.notes?.trim() || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  });
  return ref.id;
}

export async function updatePayrollRun(
  runId: string,
  values: PayrollRunFormValues,
  staff: StaffDocument,
  userId: string,
): Promise<void> {
  const basicPaise = rupeesToPaise(values.basicRupees);
  const perSessionPaise = rupeesToPaise(values.perSessionPayRupees);
  const allowancesPaise = rupeesToPaise(values.allowancesRupees);
  const grossPaise = basicPaise + perSessionPaise + allowancesPaise;

  const ptPaise = rupeesToPaise(values.professionalTaxRupees);
  const tdsPaise = rupeesToPaise(values.tdsRupees);
  const advancePaise = rupeesToPaise(values.advanceRecoveryRupees);
  const otherPaise = rupeesToPaise(values.otherDeductionsRupees);
  const totalDeductions = ptPaise + tdsPaise + advancePaise + otherPaise;
  const netPaise = grossPaise - totalDeductions;

  await updateDoc(doc(db, COLLECTIONS.payrollRuns, runId), {
    staffId: staff.id,
    staffName: staff.name,
    centreIds: staff.centreIds,
    month: values.month,
    employmentType: staff.employmentType,
    sessionsCount: values.sessionsCount,
    basicPaise,
    perSessionPayPaise: perSessionPaise,
    allowancesPaise,
    professionalTaxPaise: ptPaise,
    tdsPaise,
    advanceRecoveryPaise: advancePaise,
    otherDeductionsPaise: otherPaise,
    grossPayPaise: grossPaise,
    totalDeductionsPaise: totalDeductions,
    netPayPaise: netPaise,
    notes: values.notes?.trim() || null,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

export async function approvePayrollRun(runId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.payrollRuns, runId), {
    status: 'APPROVED',
    approvedBy: userId,
    approvedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

export async function markPayrollPaid(
  runId: string,
  paymentRef: string,
  userId: string,
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.payrollRuns, runId), {
    status: 'PAID',
    paymentRef: paymentRef.trim() || null,
    paidAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

export async function deletePayrollRun(runId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.payrollRuns, runId));
}

export function calculateProfessionalTax(grossPayPaise: number, month: number): number {
  const grossRupees = paiseToRupees(grossPayPaise);
  if (grossRupees <= 7500) return 0;
  if (grossRupees <= 10000) return rupeesToPaise(175);
  const isSurchargeMonth = month === 2;
  return rupeesToPaise(isSurchargeMonth ? 300 : 200);
}
