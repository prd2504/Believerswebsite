/**
 * Find student records that are the same person entered more than once.
 *
 * Surfaced by the booking linker, which refuses to attach a booking when three
 * records on one phone all carry the same name — that is not three people to
 * choose between, it is one person entered three times. Those four bookings
 * are only the ones that happened to collide with a booking; this reports the
 * whole picture.
 *
 * Duplicates are not cosmetic. A person split across three records has their
 * payments on one, their enrolment on another and their attendance on a third,
 * so every number about them is wrong: the fee reconciliation chases someone
 * who has paid, the batch roll counts them three times, and their attendance
 * percentage is computed from a third of their sessions.
 *
 * ── Read-only, deliberately ──
 * Merging is destructive and needs a person to choose which record survives.
 * This reports; it never writes. The report gives what that decision needs:
 * which record has the payments, which has the attendance, and which was
 * there first.
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

function normName(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

interface Member {
  id: string;
  name: string;
  externalStudentId: string | null;
  centreId: string;
  createdAt: string;
  payments: number;
  enrollments: number;
  attendance: number;
  bookings: number;
}

export const duplicateStudents = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 540 },
  async (req, res): Promise<void> => {
    if (!config.sheets.apiKey || req.header('x-api-key') !== config.sheets.apiKey) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }

    try {
      const [studentsSnap, paymentsSnap, enrollSnap, bookingsSnap] = await Promise.all([
        db.collection('students').get(),
        db.collection('payments').get(),
        db.collection('enrollments').get(),
        db.collection('slotBookings').get(),
      ]);

      // One collectionGroup sweep beats walking every batch's sessions.
      const recordsSnap = await db.collectionGroup('records').get();

      const count = (snap: FirebaseFirestore.QuerySnapshot, field = 'studentId') => {
        const m = new Map<string, number>();
        snap.docs.forEach((d) => {
          const id = d.data()[field];
          if (id) m.set(String(id), (m.get(String(id)) ?? 0) + 1);
        });
        return m;
      };
      const payCount = count(paymentsSnap);
      const enrolCount = count(enrollSnap);
      const attCount = count(recordsSnap);
      const bookCount = count(bookingsSnap);

      // Group on phone + normalised name together. Name alone would flag every
      // family that reuses a first name; phone alone would flag siblings, who
      // are genuinely different people sharing a household number.
      const groups = new Map<string, Member[]>();
      studentsSnap.docs.forEach((d) => {
        const s = d.data();
        const phone = normPhone(s.phone);
        const name = normName(s.name);
        if (!name) return;
        const key = `${phone || 'nophone'}|${name}`;
        const member: Member = {
          id: d.id,
          name: String(s.name ?? ''),
          externalStudentId: s.externalStudentId ?? null,
          centreId: String(s.primaryCentreId ?? ''),
          createdAt: String(s.createdAt ?? ''),
          payments: payCount.get(d.id) ?? 0,
          enrollments: enrolCount.get(d.id) ?? 0,
          attendance: attCount.get(d.id) ?? 0,
          bookings: bookCount.get(d.id) ?? 0,
        };
        groups.set(key, [...(groups.get(key) ?? []), member]);
      });

      const duplicates = Array.from(groups.entries())
        .filter(([, members]) => members.length > 1)
        .map(([key, members]) => {
          const [phone, name] = key.split('|');
          const sorted = [...members].sort((a, b) =>
            // Suggest keeping the record with the most history behind it, and
            // break a tie on age. It is a suggestion — the person deciding can
            // see the same numbers and disagree.
            (b.payments + b.attendance + b.enrollments) - (a.payments + a.attendance + a.enrollments)
            || String(a.createdAt).localeCompare(String(b.createdAt)),
          );
          return {
            name,
            phone: phone === 'nophone' ? null : phone,
            count: members.length,
            suggestedKeep: sorted[0].id,
            /** Records with no history at all — the safest to retire. */
            emptyRecords: sorted.filter(
              (m) => m.payments + m.attendance + m.enrollments + m.bookings === 0,
            ).length,
            members: sorted,
          };
        })
        .sort((a, b) => b.count - a.count);

      const affected = duplicates.reduce((t, g) => t + g.count, 0);
      logger.info('[duplicateStudents] done', { groups: duplicates.length, affected });

      res.status(200).json({
        ok: true,
        totalStudents: studentsSnap.size,
        duplicateGroups: duplicates.length,
        studentsAffected: affected,
        /** How many records would disappear if every group collapsed to one. */
        recordsRedundant: affected - duplicates.length,
        duplicates,
      });
    } catch (err: any) {
      logger.error('[duplicateStudents] failed', { err });
      res.status(500).json({ ok: false, error: err?.message ?? 'Internal error' });
    }
  },
);
