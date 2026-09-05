/**
 * Attach a studentId to the slot bookings taken before the field existed.
 *
 * All 83 historical bookings carry only a participant name and a phone in
 * their private contact document. Without a student link none of them can
 * become an enrolment, so none of them reach a roster, a register, or the fee
 * reconciliation — which is the whole disconnect syncBookingEnrollments is
 * there to close.
 *
 * ── The matching is tiered, and it reports what it used ──
 * A wrong link is worse than no link: it credits one child's payment to
 * another and marks the wrong child present. So each booking is matched at the
 * strongest tier that resolves it UNIQUELY, and the tier is reported, so a
 * human can accept the exact matches at a glance and look only at the rest.
 *
 *   PHONE       the booking's phone matches exactly one student. Strongest —
 *               a phone is issued to a family, not typed from memory.
 *   PHONE_ALT   it matches exactly one student's EMERGENCY contact number.
 *               Weaker: that number may belong to a relative rather than the
 *               family, so it is reported separately rather than folded in.
 *   PHONE_NAME  the phone matches several students (siblings share a number)
 *               and the name picks one of them out.
 *   NAME        no phone match at all, but the name matches exactly one
 *               student in the whole database.
 *   PREFIX      "Devarsh" against "Devarsh Shah" — a booking taken with a
 *               short name. Only when exactly one student is compatible.
 *
 * Anything that stays ambiguous, or matches nothing, is listed and left alone.
 * NAME and PREFIX are off unless explicitly asked for, because a name typed
 * into a booking form is not an identifier.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { config } from '../config.js';

const REGION = 'asia-south1';

function normPhone(s: unknown): string {
  const d = String(s ?? '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d.slice(-10);
}

/** Lowercase, letters and single spaces only — so "Prashant hingad" meets "Prashant Hingad". */
function normName(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Tier = 'PHONE' | 'PHONE_ALT' | 'PHONE_NAME' | 'NAME' | 'PREFIX';

interface Match {
  bookingId: string;
  participantName: string;
  studentId: string;
  studentName: string;
  tier: Tier;
}

interface Problem {
  bookingId: string;
  participantName: string;
  reason: string;
  candidates?: string[];
}

export async function linkBookings(opts: {
  dryRun: boolean;
  allowNameMatch: boolean;
}): Promise<{
  total: number;
  alreadyLinked: number;
  matched: Match[];
  byTier: Record<string, number>;
  problems: Problem[];
  stillPublic: number;
}> {
  const [bookingsSnap, studentsSnap] = await Promise.all([
    db.collection('slotBookings').get(),
    db.collection('students').get(),
  ]);

  interface Stu { id: string; name: string; norm: string; phone: string; altPhone: string }
  const students: Stu[] = studentsSnap.docs.map((d) => {
    const s = d.data();
    return {
      id: d.id,
      name: String(s.name ?? ''),
      norm: normName(s.name),
      phone: normPhone(s.phone),
      altPhone: normPhone(s.emergencyContact?.phone),
    };
  });

  const byPhone = new Map<string, Stu[]>();
  const byAltPhone = new Map<string, Stu[]>();
  const byName = new Map<string, Stu[]>();
  students.forEach((s) => {
    if (s.phone.length === 10) byPhone.set(s.phone, [...(byPhone.get(s.phone) ?? []), s]);
    if (s.altPhone.length === 10) byAltPhone.set(s.altPhone, [...(byAltPhone.get(s.altPhone) ?? []), s]);
    if (s.norm) byName.set(s.norm, [...(byName.get(s.norm) ?? []), s]);
  });

  const matched: Match[] = [];
  const problems: Problem[] = [];
  const byTier: Record<string, number> = {};
  let alreadyLinked = 0;
  /** Bookings whose phone is still on the world-readable parent document. */
  let stillPublic = 0;

  for (const doc of bookingsSnap.docs) {
    const b = doc.data();
    if (b.studentId) { alreadyLinked++; continue; }

    const name = String(b.participantName ?? '');
    const norm = normName(name);

    // The phone lives in the private subcollection for bookings written by the
    // createSlotBooking function — which is why this has to run server-side
    // with the admin SDK.
    //
    // Older bookings still carry it on the PUBLIC document, because
    // backfillSlotBookingContacts has not been run. Reading only the private
    // copy found nothing for roughly sixty of them and reported "no usable
    // phone" over a phone number sitting in plain sight. Both are checked, and
    // the count of unmigrated ones is reported, because every one of them is
    // still a phone number the whole internet can read.
    const contact = await doc.ref.collection('private').doc('contact').get();
    const privatePhone = normPhone(contact.exists ? contact.data()?.participantPhone : '');
    const publicPhone = normPhone(b.participantPhone);
    if (publicPhone.length === 10) stillPublic++;
    const phone = privatePhone.length === 10 ? privatePhone : publicPhone;

    const phoneHits = phone.length === 10 ? (byPhone.get(phone) ?? []) : [];
    const altHits = phone.length === 10 && phoneHits.length === 0
      ? (byAltPhone.get(phone) ?? [])
      : [];
    let hit: Stu | undefined;
    let tier: Tier | undefined;

    if (phoneHits.length === 1) {
      hit = phoneHits[0];
      tier = 'PHONE';
    } else if (phoneHits.length === 0 && altHits.length === 1) {
      hit = altHits[0];
      tier = 'PHONE_ALT';
    } else if (phoneHits.length > 1) {
      const narrowed = phoneHits.filter((s) => s.norm === norm);
      if (narrowed.length === 1) { hit = narrowed[0]; tier = 'PHONE_NAME'; }
      else {
        problems.push({
          bookingId: doc.id, participantName: name,
          reason: `${phoneHits.length} students share that phone and the name matched ${narrowed.length}`,
          candidates: phoneHits.map((s) => `${s.name} (${s.id})`),
        });
        continue;
      }
    } else if (opts.allowNameMatch) {
      const exact = byName.get(norm) ?? [];
      if (exact.length === 1) { hit = exact[0]; tier = 'NAME'; }
      else if (exact.length > 1) {
        problems.push({
          bookingId: doc.id, participantName: name,
          reason: `${exact.length} students share that name — needs a person to choose`,
          candidates: exact.map((s) => `${s.name} (${s.id})`),
        });
        continue;
      } else {
        // "Devarsh" booked against a "Devarsh Shah" student record.
        const prefix = students.filter(
          (s) => s.norm && (s.norm.startsWith(`${norm} `) || norm.startsWith(`${s.norm} `)),
        );
        if (prefix.length === 1) { hit = prefix[0]; tier = 'PREFIX'; }
        else {
          problems.push({
            bookingId: doc.id, participantName: name,
            reason: prefix.length === 0 ? 'no student matched by phone or name' : `${prefix.length} possible name matches`,
            candidates: prefix.length ? prefix.map((s) => `${s.name} (${s.id})`) : undefined,
          });
          continue;
        }
      }
    } else {
      problems.push({
        bookingId: doc.id, participantName: name,
        reason: phone.length === 10
          ? 'phone matched no student (pass allowName=1 to try the name)'
          : 'no usable phone on the booking (pass allowName=1 to try the name)',
      });
      continue;
    }

    matched.push({
      bookingId: doc.id, participantName: name,
      studentId: hit!.id, studentName: hit!.name, tier: tier!,
    });
    byTier[tier!] = (byTier[tier!] ?? 0) + 1;

    if (!opts.dryRun) {
      await doc.ref.update({
        studentId: hit!.id,
        // Recorded so a surprising link can be traced back to how it was made.
        studentLinkedBy: `linkBookingsToStudents:${tier}`,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return { total: bookingsSnap.size, alreadyLinked, matched, byTier, problems, stillPublic };
}

export const linkBookingsToStudents = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 540 },
  async (req, res): Promise<void> => {
    if (!config.sheets.apiKey || req.header('x-api-key') !== config.sheets.apiKey) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }
    const dryRun = String(req.query.dryRun ?? '') === '1';
    const allowNameMatch = String(req.query.allowName ?? '') === '1';
    const verbose = String(req.query.verbose ?? '') === '1';

    try {
      const out = await linkBookings({ dryRun, allowNameMatch });
      logger.info('[linkBookings] done', {
        dryRun, allowNameMatch, matched: out.matched.length, problems: out.problems.length,
      });
      res.status(200).json({
        ok: true,
        dryRun,
        allowNameMatch,
        total: out.total,
        alreadyLinked: out.alreadyLinked,
        // Still exposing a phone number publicly — run backfillSlotBookingContacts.
        phonesStillPublic: out.stillPublic,
        matchedCount: out.matched.length,
        byTier: out.byTier,
        problemCount: out.problems.length,
        problems: out.problems,
        // The full mapping is long; ask for it when you want to eyeball every
        // row rather than only the ones that need a decision.
        ...(verbose ? { matched: out.matched } : {}),
      });
    } catch (err: any) {
      logger.error('[linkBookings] failed', { err });
      res.status(500).json({ ok: false, error: err?.message ?? 'Internal error' });
    }
  },
);
