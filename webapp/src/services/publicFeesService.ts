const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL
  || `https://${import.meta.env.VITE_FUNCTIONS_REGION || 'asia-south1'}-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

export interface StudentLookupResult {
  studentId: string;
  name: string;
  externalStudentId: string | null;
  batchName: string;
  monthlyFeeRupees: number;
  daysPerWeek: number;
}

export interface FeeSubmissionResult {
  paymentId: string;
  externalInvoiceNo: string;
  externalStudentId: string;
  studentName: string;
}

export async function lookupStudentByPhone(
  centreCode: string,
  phone: string,
): Promise<StudentLookupResult[]> {
  const res = await fetch(`${FUNCTIONS_BASE}/lookupStudent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ centreCode, phone }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Lookup failed');
  return data.students;
}

export async function submitFeePayment(input: {
  centreCode: string;
  phone: string;
  externalStudentId?: string;
  month: string;
  amountRupees: number;
  method: 'UPI' | 'CASH' | 'BANK_TRANSFER';
  screenshotUrl?: string | null;
  notes?: string | null;
}): Promise<FeeSubmissionResult> {
  const res = await fetch(`${FUNCTIONS_BASE}/submitFeePayment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Submission failed');
  return data;
}
