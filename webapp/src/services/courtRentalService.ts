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
  addOnsTotalPaise,
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
    // Bookings taken before add-ons existed have neither field; court time was
    // the whole amount, so reading them that way keeps past totals correct.
    courtPaise: d.courtPaise ?? d.amountPaise ?? 0,
    addOns: (d.addOns && typeof d.addOns === 'object') ? d.addOns : {},
    addOnsPaise: d.addOnsPaise ?? 0,
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
    nextMonthOpensOnDay: d.nextMonthOpensOnDay ?? DEFAULT_COURT_CONFIG.nextMonthOpensOnDay,
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
  /** Add-on quantities by key, e.g. { SHUTTLE: 2 }. */
  addOns?: Record<string, number>;
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
  const addOns = input.addOns ?? {};
  const addOnsPaise = addOnsTotalPaise(addOns);
  const courtPaise = rate * hours;
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
        // Money and add-ons ride on the FIRST lock document only, so a
        // two-hour booking isn't counted as two full-price bookings.
        courtPaise: i === 0 ? courtPaise : 0,
        addOns: i === 0 ? addOns : {},
        addOnsPaise: i === 0 ? addOnsPaise : 0,
        amountPaise: i === 0 ? courtPaise + addOnsPaise : 0,
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

// ── Monthly plans ────────────────────────────────────────────────────────────

/**
 * A recurring weekly hour, sold for a month at the discounted rate.
 *
 * Materialised into real bookings rather than being a separate kind of
 * reservation, so the availability grid, double-booking guard and revenue all
 * work unchanged — a plan booking occupies an hour exactly like any other.
 *
 * The slot is HELD for the plan holder. A missed week is not credited: the
 * hour was reserved for them and could not be resold, which is what they are
 * paying the lower rate for.
 */
export interface CourtRentalPlan {
  id: string;
  centreId: string;
  bookerName: string;
  bookerPhone: string;
  bookerEmail?: string | null;
  /** 0=Sun … 6=Sat. */
  weekday: number;
  startHour: string;
  hours: number;
  /** YYYY-MM this plan covers. */
  yearMonth: string;
  hourlyRatePaise: number;
  active: boolean;
  /** Dates actually claimed, and any that were already taken — recorded on the
   *  plan so the reason a customer got four Saturdays instead of five survives
   *  the phone call that follows. */
  bookedDates?: string[];
  clashDates?: string[];
  createdAt: string;
  createdBy: string | null;
}

const PLANS = COLLECTIONS.courtRentalPlans;

/** Every date in a month falling on the given weekday. */
export function datesForWeekday(yearMonth: string, weekday: number): string[] {
  const [y, m] = yearMonth.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    if (new Date(y, m - 1, d).getDay() === weekday) {
      out.push(`${yearMonth}-${String(d).padStart(2, '0')}`);
    }
  }
  return out;
}

export async function getCourtPlans(centreId: string, yearMonth: string): Promise<CourtRentalPlan[]> {
  const snap = await getDocs(query(
    collection(db, PLANS),
    where('centreId', '==', centreId),
    where('yearMonth', '==', yearMonth),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CourtRentalPlan);
}

export interface PlanResult {
  planId: string;
  booked: string[];
  clashes: string[];
  totalPaise: number;
}

/**
 * Create a plan and book every occurrence in the month.
 *
 * Clashes are reported rather than thrown: if one of five Saturdays is
 * already taken, the other four should still be booked and the operator told
 * which one needs sorting — failing the whole plan over one date would be
 * worse than a partial booking they can see.
 */
export async function createCourtPlan(
  input: {
    centreId: string;
    bookerName: string;
    bookerPhone: string;
    weekday: number;
    startHour: string;
    hours: number;
    yearMonth: string;
  },
  userId: string,
): Promise<PlanResult> {
  const cfg = await getCourtConfig(input.centreId);
  const rate = cfg.planHourlyRatePaise;
  const planId = `${input.centreId}_${input.yearMonth}_${input.weekday}_${input.startHour.replace(':', '')}`;

  await setDoc(doc(db, PLANS, planId), {
    centreId: input.centreId,
    bookerName: input.bookerName,
    bookerPhone: input.bookerPhone,
    weekday: input.weekday,
    startHour: input.startHour,
    hours: input.hours,
    yearMonth: input.yearMonth,
    hourlyRatePaise: rate,
    active: true,
    createdAt: serverTimestamp(),
    createdBy: userId,
  }, { merge: true });

  const booked: string[] = [];
  const clashes: string[] = [];

  for (const date of datesForWeekday(input.yearMonth, input.weekday)) {
    try {
      await createCourtBooking({
        centreId: input.centreId,
        date,
        startHour: input.startHour,
        hours: input.hours,
        bookerName: input.bookerName,
        bookerPhone: input.bookerPhone,
        source: 'MONTHLY_PLAN',
        hourlyRatePaise: rate,
        planId,
      });
      booked.push(date);
    } catch (err) {
      // Includes hours that are closed that week (e.g. Sunday 15:00) as well
      // as genuine double-bookings — both need a human decision.
      clashes.push(date);
    }
  }

  return { planId, booked, clashes, totalPaise: booked.length * rate * Math.max(1, input.hours) };
}

/** Cancel a plan and free every hour it still holds for the month. */
export async function cancelCourtPlan(planId: string, userId: string): Promise<number> {
  const snap = await getDocs(query(collection(db, BOOKINGS), where('planId', '==', planId)));
  let freed = 0;
  for (const d of snap.docs) {
    if (d.data().status === 'CANCELLED') continue;
    await updateDoc(d.ref, {
      status: 'CANCELLED',
      notes: 'Plan cancelled',
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    });
    freed++;
  }
  await updateDoc(doc(db, PLANS, planId), { active: false });
  return freed;
}

/**
 * Every court booking in a month, across all centres — feeds the P&L.
 *
 * Date strings sort lexically, so a plain >= / <= range over YYYY-MM-DD works
 * without needing a month field on the document.
 */
export async function getCourtBookingsForMonth(yearMonth: string): Promise<CourtBookingDocument[]> {
  const snap = await getDocs(query(
    collection(db, BOOKINGS),
    where('date', '>=', `${yearMonth}-01`),
    where('date', '<=', `${yearMonth}-31`),
  ));
  return snap.docs.map((d) => bookingFrom(d.id, d.data()));
}

// ── Public (unauthenticated) path ────────────────────────────────────────────
//
// Everything above talks to Firestore directly, which works for the admin grid
// because `courtBookings` is admin-read. The public booking page has no
// account, so it cannot read that collection at all — its availability query
// is denied, and a booking transaction fails on its own read before it ever
// writes. These three go through Cloud Functions instead, which run with the
// admin SDK and hand back occupancy with no names or phone numbers on it.

const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL
  || `https://${import.meta.env.VITE_FUNCTIONS_REGION || 'asia-south1'}-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

export interface PublicSlot {
  hour: string;
  endHour: string;
  state: string;
  ratePaise: number;
}

export interface PublicAvailability {
  /** The court's clock, not the device's — see istNow() in shared. */
  now: { date: string; time: string };
  /**
   * Last date currently on sale. Next month opens on the 25th of this one, so
   * before then this is the end of the current month.
   */
  horizon: string;
  isOpen: boolean;
  hourlyRatePaise: number;
  planHourlyRatePaise: number;
  /** 'YYYY-MM-DD' → slots. Dates with nothing sellable are absent. */
  days: Record<string, PublicSlot[]>;
}

export async function getPublicAvailability(
  centreId: string, from: string, to: string,
): Promise<PublicAvailability> {
  const res = await fetch(
    `${FUNCTIONS_BASE}/courtAvailability?centreId=${encodeURIComponent(centreId)}`
    + `&from=${from}&to=${to}`,
  );
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(body?.error ?? 'Could not load availability');
  return body as PublicAvailability;
}

export interface PublicBookingInput {
  centreId: string;
  date: string;
  startHour: string;
  hours: number;
  bookerName: string;
  bookerPhone: string;
  bookerEmail?: string;
  addOns?: Record<string, number>;
  screenshotUrl?: string | null;
}

export async function createCourtBookingPublic(input: PublicBookingInput): Promise<string> {
  const res = await fetch(`${FUNCTIONS_BASE}/createCourtBookingPublic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    // 409 is the whole family of "that hour isn't yours to take" — someone
    // else got there first, the hour elapsed while the form was open, or
    // bookings closed. All of them mean: reload availability and pick again.
    if (res.status === 409) throw new SlotUnavailableError(body?.error ?? 'That time is no longer available.');
    throw new Error(body?.error ?? 'Could not create the booking');
  }
  return body.bookingId as string;
}

export interface PublicPlanInput {
  centreId: string;
  weekday: number;
  startHour: string;
  hours: number;
  yearMonth: string;
  bookerName: string;
  bookerPhone: string;
  bookerEmail?: string;
  screenshotUrl?: string | null;
}

export async function createCourtPlanPublic(input: PublicPlanInput): Promise<PlanResult> {
  const res = await fetch(`${FUNCTIONS_BASE}/createCourtPlanPublic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    if (res.status === 409) throw new SlotUnavailableError(body?.error ?? 'That weekly slot is taken.');
    throw new Error(body?.error ?? 'Could not create the plan');
  }
  return { planId: body.planId, booked: body.booked, clashes: body.clashes, totalPaise: body.totalPaise };
}

/** Live monthly plans for a centre and month — drives the admin panel. */
export function subscribeToCourtPlans(
  centreId: string,
  yearMonth: string,
  cb: (plans: CourtRentalPlan[]) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, PLANS),
      where('centreId', '==', centreId),
      where('yearMonth', '==', yearMonth),
    ),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CourtRentalPlan)),
  );
}
