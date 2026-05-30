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
    participantName: data.participantName ?? '',
    participantPhone: data.participantPhone ?? '',
    participantEmail: data.participantEmail ?? null,
    planType: data.planType ?? 'THREE_DAY',
    timeSlot: data.timeSlot ?? '',
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
    updatedAt: toIso(data.updatedAt) ?? new Date().toISOString(),
    updatedBy: data.updatedBy ?? null,
  };
}

// ── Real-time subscriptions ───────────────────────────────────────────────────

export function subscribeToBookings(
  centreId: string,
  month: string,
  callback: (bookings: SlotBookingDocument[]) => void,
): () => void {
  const q = query(
    collection(db, COL),
    where('centreId', '==', centreId),
    where('month', '==', month),
    where('status', 'in', [
      SlotBookingStatus.PENDING_PAYMENT,
      SlotBookingStatus.PENDING_VERIFICATION,
      SlotBookingStatus.CONFIRMED,
    ]),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => fromFirestore(d.id, d.data())));
  });
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
  amountPaise: number;
}

export async function createBooking(input: CreateBookingInput): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    centreId: input.centreId,
    month: input.month,
    participantName: input.participantName,
    participantPhone: input.participantPhone,
    participantEmail: input.participantEmail || null,
    planType: input.planType,
    timeSlot: input.timeSlot,
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
