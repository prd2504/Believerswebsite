/**
 * Court hour bookings — read/write layer.
 *
 * Kept entirely apart from paymentService and studentService: this is facility
 * income, and mixing it into student payments would blend the coaching margin,
 * put non-students on the roster, and consume invoice numbers meant for fees.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  COLLECTIONS,
  DEFAULT_COURT_CONFIG,
  buildDayAvailability,
  canBook,
  bookingHours,
  type CourtBookingDocument,
  type CourtRentalConfig,
  type CourtBookingSource,
} from '@bba/shared';

const BOOKINGS = COLLECTIONS.courtBookings;
const CONFIG = COLLECTIONS.courtRentalConfig;

function toIso(ts: unknown): string | null {
  if (!ts) return null;
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts) return (ts as Timestamp).toDate().toISOString();
  return null;
}

function bookingFrom(id: string, d: DocumentData): CourtBookingDocument {
  return {
    id,
    centreId: d.centreId ?? '',
    date: d.date ?? '',
    startHour: d.startHour ?? '',
    hours: d.hours ?? 1,
    bookerName: d.bookerName ?? '',
    bookerPhone: d.bookerPhone ?? '',
    bookerEmail: d.bookerEmail ?? null,
    hourlyRatePaise: d.hourlyRatePaise ?? 0,
    amountPaise: d.amountPaise ?? 0,
    status: d.status ?? 'HELD',
    source: d.source ?? 'ONLINE',
    planId: d.planId ?? null,
    screenshotUrl: d.screenshotUrl ?? null,
    notes: d.notes ?? null,
    verifiedBy: d.verifiedBy ?? null,
    verifiedAt: toIso(d.verifiedAt),
    createdAt: toIso(d.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(d.updatedAt) ?? new Date().toISOString(),
    createdBy: d.createdBy ?? null,
    updatedBy: d.updatedBy ?? null,
  };
}

function configFrom(id: string, d: DocumentData): CourtRentalConfig {
  return {
    centreId: id,
    isOpen: d.isOpen ?? DEFAULT_COURT_CONFIG.isOpen,
    hourlyRatePaise: d.hourlyRatePaise ?? DEFAULT_COURT_CONFIG.hourlyRatePaise,
    planHourlyRatePaise: d.planHourlyRatePaise ?? DEFAULT_COURT_CONFIG.planHourlyRatePaise,
    windows: d.windows ?? DEFAULT_COURT_CONFIG.windows,
    coachingWindows: d.coachingWindows ?? DEFAULT_COURT_CONFIG.coachingWindows,
    dateOverrides: d.dateOverrides ?? {},
    updatedAt: toIso(d.updatedAt) ?? new Date().toISOString(),
    updatedBy: d.updatedBy ?? null,
  };
}

// ── Config ───────────────────────────────────────────────────────────────────

export function subscribeToCourtConfig(
  centreId: string,
  cb: (cfg: CourtRentalConfig) => void,
): () => void {
  return onSnapshot(doc(db, CONFIG, centreId), (snap) => {
    cb(snap.exists()
      ? configFrom(snap.id, snap.data())
      : { centreId, ...DEFAULT_COURT_CONFIG, updatedAt: new Date().toISOString(), updatedBy: null });
  });
}

export async function getCourtConfig(centreId: string): Promise<CourtRentalConfig> {
  const snap = await getDoc(doc(db, CONFIG, centreId));
  return snap.exists()
    ? configFrom(snap.id, snap.data())
    : { centreId, ...DEFAULT_COURT_CONFIG, updatedAt: new Date().toISOString(), updatedBy: null };
}

/**
 * Open or close a single hour on a single date.
 *
 * Writes a date override rather than editing the weekly windows, so opening
 * Sunday 15:00 for one weekend can't silently open it every week.
 */
export async function setHourOverride(
  centreId: string,
  date: string,
  hour: string,
  open: boolean,
  userId: string,
): Promise<void> {
  const ref = doc(db, CONFIG, centreId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cfg = snap.exists() ? configFrom(snap.id, snap.data()) : { ...DEFAULT_COURT_CONFIG, centreId } as CourtRentalConfig;
    const forDate = { ...(cfg.dateOverrides?.[date] ?? {}), [hour]: open };
    tx.set(ref, {
      centreId,
      ...(snap.exists() ? {} : DEFAULT_COURT_CONFIG),
      dateOverrides: { ...(cfg.dateOverrides ?? {}), [date]: forDate },
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    }, { merge: true });
  });
}

// ── Bookings ─────────────────────────────────────────────────────────────────

/** Live bookings for a date range — drives the admin grid. */
export function subscribeToBookingsInRange(
  centreId: string,
  fromDate: string,
  toDate: string,
  cb: (rows: CourtBookingDocument[]) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, BOOKINGS),
      where('centreId', '==', centreId),
      where('date', '>=', fromDate),
      where('date', '<=', toDate),
    ),
    (snap) => cb(snap.docs.map((d) => bookingFrom(d.id, d.data()))),
  );
}

export async function getBookingsForDate(centreId: string, date: string): Promise<CourtBookingDocument[]> {
  const snap = await getDocs(query(
    collection(db, BOOKINGS),
    where('centreId', '==', centreId),
    where('date', '==', date),
  ));
  return snap.docs.map((d) => bookingFrom(d.id, d.data()));
}

export interface CreateCourtBookingInput {
  centreId: string;
  date: string;
  startHour: string;
  hours: number;
  bookerName: string;
  bookerPhone: string;
  bookerEmail?: string;
  source: CourtBookingSource;
  hourlyRatePaise?: number;
  planId?: string | null;
  screenshotUrl?: string | null;
  notes?: string | null;
}

export class SlotUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlotUnavailableError';
  }
}

/**
 * Book hours, rejecting a clash atomically.
 *
 * The deterministic document id `{centreId}_{date}_{hour}` is what makes this
 * safe: two people paying for the same hour within a second of each other both
 * try to create the SAME document, and Firestore lets exactly one win. A
 * read-then-write check would let both pass the read before either wrote.
 *
 * A multi-hour booking claims one lock doc per hour, all in the one
 * transaction, so a partial overlap fails cleanly rather than half-booking.
 */
export async function createCourtBooking(input: CreateCourtBookingInput): Promise<string> {
  const cfg = await getCourtConfig(input.centreId);
  if (!cfg.isOpen) throw new SlotUnavailableError('Court booking is currently closed.');

  const dayBookings = await getBookingsForDate(input.centreId, input.date);
  const slots = buildDayAvailability(cfg, input.date, dayBookings);
  if (!canBook(slots, input.startHour, input.hours)) {
    throw new SlotUnavailableError('That time is no longer available. Please pick another slot.');
  }

  const rate = input.hourlyRatePaise ?? cfg.hourlyRatePaise;
  const hours = Math.max(1, input.hours);
  const bookingId = `${input.centreId}_${input.date}_${input.startHour.replace(':', '')}`;

  await runTransaction(db, async (tx) => {
    // Claim every hour first — all reads must precede all writes in a
    // Firestore transaction.
    const locks = bookingHours(input.startHour, hours)
      .map((h) => doc(db, BOOKINGS, `${input.centreId}_${input.date}_${h.replace(':', '')}`));
    const snaps = await Promise.all(locks.map((ref) => tx.get(ref)));

    snaps.forEach((s) => {
      const existing = s.exists() ? s.data() : null;
      if (existing && existing.status !== 'CANCELLED') {
        throw new SlotUnavailableError('Someone just booked that time. Please pick another slot.');
      }
    });

    const now = serverTimestamp();
    locks.forEach((ref, i) => {
      tx.set(ref, {
        centreId: input.centreId,
        date: input.date,
        startHour: bookingHours(input.startHour, hours)[i],
        // Each hour is its own lock document; only the first carries the money
        // so a two-hour booking isn't counted as two full-price bookings.
        hours: 1,
        bookerName: input.bookerName,
        bookerPhone: input.bookerPhone,
        bookerEmail: input.bookerEmail ?? null,
        hourlyRatePaise: rate,
        amountPaise: i === 0 ? rate * hours : 0,
        status: 'HELD',
        source: input.source,
        planId: input.planId ?? null,
        screenshotUrl: input.screenshotUrl ?? null,
        notes: i === 0 ? (input.notes ?? null) : `Part of ${bookingId}`,
        verifiedBy: null,
        verifiedAt: null,
        createdAt: now,
        updatedAt: now,
        createdBy: input.source,
        updatedBy: input.source,
      });
    });
  });

  return bookingId;
}

export async function confirmCourtBooking(bookingId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, BOOKINGS, bookingId), {
    status: 'CONFIRMED',
    verifiedBy: userId,
    verifiedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/** Cancel — frees the hour for resale. */
export async function cancelCourtBooking(bookingId: string, userId: string, reason?: string): Promise<void> {
  await updateDoc(doc(db, BOOKINGS, bookingId), {
    status: 'CANCELLED',
    notes: reason ?? null,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

export async function deleteCourtBooking(bookingId: string): Promise<void> {
  await deleteDoc(doc(db, BOOKINGS, bookingId));
}

/** Confirmed rental income for a month — feeds the P&L as its own line. */
export async function getRentalRevenuePaise(centreId: string, yearMonth: string): Promise<number> {
  const snap = await getDocs(query(
    collection(db, BOOKINGS),
    where('centreId', '==', centreId),
    where('date', '>=', `${yearMonth}-01`),
    where('date', '<=', `${yearMonth}-31`),
  ));
  return snap.docs
    .map((d) => d.data())
    .filter((b) => b.status === 'CONFIRMED')
    .reduce((t, b) => t + (b.amountPaise ?? 0), 0);
}

export async function setCourtConfig(
  centreId: string,
  patch: Partial<Pick<CourtRentalConfig, 'isOpen' | 'hourlyRatePaise' | 'planHourlyRatePaise' | 'windows' | 'coachingWindows'>>,
  userId: string,
): Promise<void> {
  await setDoc(doc(db, CONFIG, centreId), {
    centreId,
    ...patch,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  }, { merge: true });
}
