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

export interface CentreOption {
  id: string;
  name: string;
  city: string;
  centreCode: string | null;
}

export interface StudentSearchResult {
  studentId: string;
  name: string;
  maskedPhone: string;
  externalStudentId: string | null;
  batchName: string;
  monthlyFeeRupees: number;
  daysPerWeek: number;
}

export interface RegisterStudentResult {
  studentId: string;
  name: string;
  maskedPhone: string;
}

/** Active centres for the /fees page — plain HTTP GET (faster cold load than the Firestore SDK). */
export async function fetchActiveCentres(): Promise<CentreOption[]> {
  const res = await fetch(`${FUNCTIONS_BASE}/listCentres`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load centres');
  return data.centres;
}

/** All ACTIVE / ON_HOLD students at a centre, for client-side name autocomplete. */
export async function searchStudentsByCentre(centreCode: string): Promise<StudentSearchResult[]> {
  const res = await fetch(
    `${FUNCTIONS_BASE}/searchStudents?centreCode=${encodeURIComponent(centreCode)}`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load students');
  return data.students;
}

/** Register a new student from the public page when their name isn't found. */
export async function registerStudent(input: {
  centreCode: string;
  name: string;
  phone: string;
  guardianName: string;
}): Promise<RegisterStudentResult> {
  const res = await fetch(`${FUNCTIONS_BASE}/registerStudent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
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
  studentId?: string;
  phone?: string;
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
