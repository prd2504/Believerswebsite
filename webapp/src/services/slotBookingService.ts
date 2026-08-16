import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  COLLECTIONS,
  SlotBookingStatus,
  DEFAULT_SLOT_CONFIG,
  type SlotBookingDocument,
  type SlotBookingConfig,
  type SlotPlanType,
} from '@bba/shared';

const COL = COLLECTIONS.slotBookings;
const CONFIG_COL = COLLECTIONS.slotBookingConfig;

function toIso(ts: unknown): string | null {
  if (!ts) return null;
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts) {
    return (ts as Timestamp).toDate().toISOString();
  }
  return null;
}

function fromFirestore(id: string, data: DocumentData): SlotBookingDocument {
  return {
    id,
    centreId: data.centreId ?? '',
    month: data.month ?? '',
    // Legacy bookings predate quarterly and have no coversMonths. Falling back
    // to [month] keeps them on exactly the roster they were always on.
    coversMonths: Array.isArray(data.coversMonths) && data.coversMonths.length > 0
      ? data.coversMonths
      : (data.month ? [data.month] : []),
    participantName: data.participantName ?? '',
    participantPhone: data.participantPhone ?? '',
    participantEmail: data.participantEmail ?? null,
    planType: data.planType ?? 'THREE_DAY',
    timeSlot: data.timeSlot ?? '',
    // Bookings taken before day-capture existed have no selectedDays — treat
    // as empty rather than guessing, so the roster shows them as unassigned.
    selectedDays: Array.isArray(data.selectedDays) ? data.selectedDays : [],
    amountPaise: data.amountPaise ?? 0,
    status: data.status ?? SlotBookingStatus.PENDING_PAYMENT,
    upiTransactionId: data.upiTransactionId ?? null,
    verifiedBy: data.verifiedBy ?? null,
    verifiedAt: toIso(data.verifiedAt),
    rejectionReason: data.rejectionReason ?? null,
    createdAt: toIso(data.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(data.updatedAt) ?? new Date().toISOString(),
  };
}

function configFromFirestore(id: string, data: DocumentData): SlotBookingConfig {
  return {
    centreId: id,
    weekdayCapacity: data.weekdayCapacity ?? DEFAULT_SLOT_CONFIG.weekdayCapacity,
    saturdayCapacity: data.saturdayCapacity ?? DEFAULT_SLOT_CONFIG.saturdayCapacity,
    isOpen: data.isOpen ?? DEFAULT_SLOT_CONFIG.isOpen,
    closedSlots: Array.isArray(data.closedSlots) ? data.closedSlots : [],
    // Accepts either a Firestore Timestamp or a plain ISO string, so the field
    // can be set by hand in the console without breaking the page. Absent or
    // unparseable → null → no scheduled gate (fails open, never locks out).
    openAt: toIso(data.openAt) ?? (typeof data.openAt === 'string' ? data.openAt : null),
    openAtByMonth: (data.openAtByMonth && typeof data.openAtByMonth === 'object')
      ? data.openAtByMonth
      : null,
    autoOpenEnabled: data.autoOpenEnabled ?? null,
    autoOpenDayOfMonth: data.autoOpenDayOfMonth ?? null,
    autoOpenTime: data.autoOpenTime ?? null,
    updatedAt: toIso(data.updatedAt) ?? new Date().toISOString(),
    updatedBy: data.updatedBy ?? null,
  };
}

// ── Real-time subscriptions ───────────────────────────────────────────────────

const ROSTER_STATUSES = [
  SlotBookingStatus.PENDING_PAYMENT,
  SlotBookingStatus.PENDING_VERIFICATION,
  SlotBookingStatus.CONFIRMED,
];

/**
 * Live bookings for one month.
 *
 * Runs TWO listeners and merges them, rather than a single query:
 *
 *   month == X              → finds bookings written before coversMonths
 *                             existed, which have no such field at all
 *   coversMonths contains X → finds every booking that covers X, including a
 *                             quarterly one filed under an earlier month
 *
 * A single array-contains query would be cleaner, but it would silently drop
 * every pre-existing booking off every roster the instant it deployed, unless
 * a backfill had already been run — and correctness here cannot depend on two
 * operations happening in the right order. New bookings match both queries and
 * are de-duplicated by id, so the merge costs a little and can never lose
 * anyone. Once all live bookings carry coversMonths this can collapse to the
 * single query.
 */
export function subscribeToBookings(
  centreId: string,
  month: string,
  callback: (bookings: SlotBookingDocument[]) => void,
): () => void {
  let byMonth: SlotBookingDocument[] | null = null;
  let byCoverage: SlotBookingDocument[] | null = null;

  const emit = () => {
    // Wait for both before the first emit, so the roster doesn't visibly
    // flicker from a half-populated list on load.
    if (byMonth === null || byCoverage === null) return;
    const merged = new Map<string, SlotBookingDocument>();
    [...byMonth, ...byCoverage].forEach((b) => merged.set(b.id, b));
    callback(
      Array.from(merged.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  };

  const unsubMonth = onSnapshot(
    query(
      collection(db, COL),
      where('centreId', '==', centreId),
      where('month', '==', month),
      where('status', 'in', ROSTER_STATUSES),
    ),
    (snap) => {
      byMonth = snap.docs.map((d) => fromFirestore(d.id, d.data()));
      emit();
    },
  );

  const unsubCoverage = onSnapshot(
    query(
      collection(db, COL),
      where('centreId', '==', centreId),
      where('coversMonths', 'array-contains', month),
      where('status', 'in', ROSTER_STATUSES),
    ),
    (snap) => {
      byCoverage = snap.docs.map((d) => fromFirestore(d.id, d.data()));
      emit();
    },
  );

  return () => { unsubMonth(); unsubCoverage(); };
}

export function subscribeToConfig(
  centreId: string,
  callback: (config: SlotBookingConfig) => void,
): () => void {
  return onSnapshot(doc(db, CONFIG_COL, centreId), (snap) => {
    if (snap.exists()) {
      callback(configFromFirestore(snap.id, snap.data()));
    } else {
      callback({
        centreId,
        ...DEFAULT_SLOT_CONFIG,
        updatedAt: new Date().toISOString(),
        updatedBy: null,
      });
    }
  });
}

// ── Booking creation ──────────────────────────────────────────────────────────

export interface CreateBookingInput {
  centreId: string;
  month: string;
  participantName: string;
  participantPhone: string;
  participantEmail?: string;
  planType: SlotPlanType;
  timeSlot: string;
  /** Weekdays the participant will attend (0=Sun … 6=Sat) — drives the roster. */
  selectedDays: number[];
  /** Months this booking covers. Omit for monthly; defaults to [month]. */
  coversMonths?: string[];
  amountPaise: number;
}

export async function createBooking(input: CreateBookingInput): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    centreId: input.centreId,
    month: input.month,
    coversMonths: input.coversMonths && input.coversMonths.length > 0
      ? input.coversMonths
      : [input.month],
    participantName: input.participantName,
    participantPhone: input.participantPhone,
    participantEmail: input.participantEmail || null,
    planType: input.planType,
    timeSlot: input.timeSlot,
    selectedDays: input.selectedDays ?? [],
    amountPaise: input.amountPaise,
    status: SlotBookingStatus.PENDING_PAYMENT,
    upiTransactionId: null,
    verifiedBy: null,
    verifiedAt: null,
    rejectionReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ── Admin operations ──────────────────────────────────────────────────────────

export async function getBookingsForMonth(
  centreId: string,
  month: string,
): Promise<SlotBookingDocument[]> {
  const q = query(
    collection(db, COL),
    where('centreId', '==', centreId),
    where('month', '==', month),
    orderBy('createdAt', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

export async function verifyBooking(bookingId: string, adminUid: string): Promise<void> {
  await updateDoc(doc(db, COL, bookingId), {
    status: SlotBookingStatus.CONFIRMED,
    verifiedBy: adminUid,
    verifiedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function rejectBooking(
  bookingId: string,
  adminUid: string,
  reason: string,
): Promise<void> {
  await updateDoc(doc(db, COL, bookingId), {
    status: SlotBookingStatus.REJECTED,
    rejectionReason: reason,
    verifiedBy: adminUid,
    verifiedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Change which weekdays a booking attends — the roster edit surface for
 * "shift this student to a different day" / "add them to Wednesday too" /
 * "they're not coming Tuesdays anymore". Deliberately separate from
 * verify/reject: this never touches status, amount or payment, only
 * attendance days, so a manager can freely adjust a roster without any risk
 * of it reading as a payment action.
 */
export async function updateBookingSelectedDays(
  bookingId: string,
  selectedDays: number[],
  adminUid: string,
): Promise<void> {
  await updateDoc(doc(db, COL, bookingId), {
    selectedDays,
    updatedAt: serverTimestamp(),
    updatedBy: adminUid,
  });
}

export async function deleteBooking(bookingId: string): Promise<void> {
  await deleteDoc(doc(db, COL, bookingId));
}

export async function checkDuplicatePhone(
  phone: string,
  centreId: string,
  month: string,
  planType: SlotPlanType,
): Promise<boolean> {
  const q = query(
    collection(db, COL),
    where('participantPhone', '==', phone),
    where('centreId', '==', centreId),
    where('month', '==', month),
    where('planType', '==', planType),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

// ── Config management (admin) ─────────────────────────────────────────────────

export async function updateBookingConfig(
  centreId: string,
  patch: Partial<Pick<SlotBookingConfig, 'weekdayCapacity' | 'saturdayCapacity' | 'isOpen' | 'closedSlots'>>,
  adminUid: string,
): Promise<void> {
  await setDoc(
    doc(db, CONFIG_COL, centreId),
    {
      centreId,
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    },
    { merge: true },
  );
}
