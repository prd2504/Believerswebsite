import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
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
  type SlotBookingDocument,
  type SlotPlanType,
} from '@bba/shared';

const COL = COLLECTIONS.slotBookings;

function fromFirestore(id: string, data: DocumentData): SlotBookingDocument {
  const toIso = (ts: unknown): string => {
    if (!ts) return new Date().toISOString();
    if (typeof ts === 'string') return ts;
    if (ts && typeof ts === 'object' && 'toDate' in ts) {
      return (ts as Timestamp).toDate().toISOString();
    }
    return new Date().toISOString();
  };

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
    verifiedAt: toIso(data.verifiedAt) === new Date().toISOString() && !data.verifiedAt ? null : (data.verifiedAt ? toIso(data.verifiedAt) : null),
    rejectionReason: data.rejectionReason ?? null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

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
      SlotBookingStatus.PENDING_VERIFICATION,
      SlotBookingStatus.CONFIRMED,
    ]),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    const bookings = snap.docs.map((d) => fromFirestore(d.id, d.data()));
    callback(bookings);
  });
}

export interface CreateBookingInput {
  centreId: string;
  month: string;
  participantName: string;
  participantPhone: string;
  participantEmail?: string;
  planType: SlotPlanType;
  timeSlot: string;
  amountPaise: number;
  upiTransactionId?: string;
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
    status: input.upiTransactionId
      ? SlotBookingStatus.PENDING_VERIFICATION
      : SlotBookingStatus.PENDING_PAYMENT,
    upiTransactionId: input.upiTransactionId || null,
    verifiedBy: null,
    verifiedAt: null,
    rejectionReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

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

export async function verifyBooking(
  bookingId: string,
  adminUid: string,
): Promise<void> {
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

export async function getBookingById(
  bookingId: string,
): Promise<SlotBookingDocument | null> {
  const snap = await getDoc(doc(db, COL, bookingId));
  if (!snap.exists()) return null;
  return fromFirestore(snap.id, snap.data());
}
