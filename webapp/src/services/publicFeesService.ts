const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL
  || `https://${import.meta.env.VITE_FUNCTIONS_REGION || 'asia-south1'}-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

/**
 * Parse a fetch Response as JSON, but degrade gracefully when the server
 * returns a non-JSON body (e.g. a plain-text "Internal Server Error" 500 page).
 * Throws a readable error instead of "Unexpected token 'I'…".
 */
async function parseJsonResponse(res: Response, fallbackMsg: string): Promise<any> {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    if (!res.ok) {
      throw new Error(
        `${fallbackMsg} (HTTP ${res.status}). The server returned: ${text.slice(0, 120)}`,
      );
    }
    throw new Error(`${fallbackMsg}: unexpected response from server.`);
  }
  if (!res.ok) throw new Error(data?.error || `${fallbackMsg} (HTTP ${res.status})`);
  return data;
}

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
  /** Available frequency plans from the student's batch (empty for new registrations). */
  frequencyPlans: Array<{ daysPerWeek: number; monthlyFeePaise: number }>;
}

export interface RegisterStudentResult {
  studentId: string;
  name: string;
  maskedPhone: string;
}

/** Active centres for the /fees page — plain HTTP GET (faster cold load than the Firestore SDK). */
export async function fetchActiveCentres(): Promise<CentreOption[]> {
  const res = await fetch(`${FUNCTIONS_BASE}/listCentres`);
  const data = await parseJsonResponse(res, 'Failed to load centres');
  return data.centres;
}

/** All ACTIVE / ON_HOLD students at a centre, for client-side name autocomplete. */
export async function searchStudentsByCentre(centreCode: string): Promise<StudentSearchResult[]> {
  const res = await fetch(
    `${FUNCTIONS_BASE}/searchStudents?centreCode=${encodeURIComponent(centreCode)}`,
  );
  const data = await parseJsonResponse(res, 'Failed to load students');
  return data.students;
}

/** Register a new student from the public page when their name isn't found. */
export async function registerStudent(input: {
  centreCode: string;
  name: string;
  phone: string;
  email?: string;
}): Promise<RegisterStudentResult> {
  const res = await fetch(`${FUNCTIONS_BASE}/registerStudent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await parseJsonResponse(res, 'Registration failed');
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

  const data = await parseJsonResponse(res, 'Lookup failed');
  return data.students;
}

export async function submitFeePayment(input: {
  centreCode: string;
  studentId?: string;
  phone?: string;
  externalStudentId?: string;
  email?: string;
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

  const data = await parseJsonResponse(res, 'Submission failed');
  return data;
}
