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
  /** True when an existing matching student was reused rather than created. */
  reused?: boolean;
}

export interface ExistingPlayer {
  studentId: string;
  name: string;
  maskedPhone: string;
}

/** Discriminated result: either a student to use, or a set of players already on that phone. */
export type RegisterOutcome =
  | { kind: 'student'; student: RegisterStudentResult }
  | { kind: 'phoneHasPlayers'; existingPlayers: ExistingPlayer[] };

/** Coach/staff names at a centre — for the "which coach did you pay cash to?" picker. */
export async function fetchCoaches(centreCode: string): Promise<string[]> {
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/listCoaches?centreCode=${encodeURIComponent(centreCode)}`);
    const data = await parseJsonResponse(res, 'Failed to load coaches');
    return (data.coaches ?? []).map((c: { name: string }) => c.name);
  } catch {
    // Non-critical — a failed coach list must never block a cash payment.
    return [];
  }
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

/**
 * Register a new student from the public page when their name isn't found.
 * Returns a discriminated outcome: either a usable student (created or an
 * existing exact match that was reused), or — when the phone already belongs to
 * other player(s) — the list of those players so the parent can pick themselves.
 * Pass `confirmNew: true` to create anyway (a genuine new sibling on that phone).
 */
export async function registerStudent(input: {
  centreCode: string;
  name: string;
  phone: string;
  email?: string;
  confirmNew?: boolean;
}): Promise<RegisterOutcome> {
  const res = await fetch(`${FUNCTIONS_BASE}/registerStudent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (res.status === 409 && data?.code === 'PHONE_HAS_PLAYERS') {
    return { kind: 'phoneHasPlayers', existingPlayers: data.existingPlayers ?? [] };
  }
  if (!res.ok) throw new Error(data?.error || `Registration failed (HTTP ${res.status})`);
  return { kind: 'student', student: data };
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
  /** For cash payments — the coach who received it. Backend writes it into the
   * payment note as "Paid to <coach>". */
  coachName?: string;
  /** Days/week selected on this payment — lets the backend auto-enrol a student
   * who has no batch link yet (e.g. just self-registered). Omit for Ruia, which
   * tracks attendance via slotBookings instead of batch enrollments. */
  daysPerWeek?: number;
}): Promise<FeeSubmissionResult> {
  const res = await fetch(`${FUNCTIONS_BASE}/submitFeePayment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const data = await parseJsonResponse(res, 'Submission failed');
  return data;
}
