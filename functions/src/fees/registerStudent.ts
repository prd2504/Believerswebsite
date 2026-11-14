import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { registerStudentSchema } from './validation.js';
import { checkRateLimit } from './rateLimiter.js';
import { canonicalPhone, normalizeName } from './phone.js';

/**
 * Lets a parent register a new student from the public /fees page when their
 * name isn't found in the autocomplete. Creates a minimal student doc with
 * placeholder values for required fields; an admin completes the profile later.
 *
 *   POST /registerStudent
 *   Body: { centreCode, name, phone, email?, confirmNew? }
 *
 * Identity guard (the reason duplicate students used to appear): a returning
 * parent whose stored name spelling or phone format differs slightly would
 * fail the old exact-match dedup and mint a brand-new student — and therefore a
 * new external student number that tracked the invoice counter. Now:
 *   • same canonical phone + same name  → REUSE that student (never duplicate)
 *   • same canonical phone, other name  → 409 with the existing player(s) so the
 *                                          parent can pick themselves, or resend
 *                                          with confirmNew:true for a real sibling
 *   • no phone match                    → create as before
 */

function maskLocal(local: string): string {
  const d = canonicalPhone(local);
  return d.length >= 6 ? `${d.slice(0, 2)}****${d.slice(-4)}` : '—';
}

export const registerStudent = onRequest(
  {
    region: 'asia-south1',
    cors: true,
    timeoutSeconds: 30,
  },
  async (req, res): Promise<void> => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const parsed = registerStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const input = parsed.data;

    if (!checkRateLimit(`register:${input.phone}`, 3, 60 * 60 * 1000)) {
      res.status(429).json({ ok: false, error: 'Too many registrations. Try again later.' });
      return;
    }

    try {
      const centreSnap = await db
        .collection('centres')
        .where('centreCode', '==', input.centreCode)
        .where('active', '==', true)
        .limit(1)
        .get();

      if (centreSnap.empty) {
        res.status(404).json({ ok: false, error: `Centre "${input.centreCode}" not found` });
        return;
      }

      const centreDoc = centreSnap.docs[0];
      const centreId = centreDoc.id;
      const centreData = centreDoc.data();

      // --- Identity resolution across the whole centre (phones may be stored in
      // mixed formats, so match on the canonical form in memory rather than a
      // format-sensitive `where phone ==` query). ---
      const centreStudentsSnap = await db
        .collection('students')
        .where('primaryCentreId', '==', centreId)
        .get();

      const inputPhone = canonicalPhone(input.phone);
      const inputName = normalizeName(input.name);
      const samePhone = centreStudentsSnap.docs.filter(
        (d) => canonicalPhone(d.data().phone) === inputPhone,
      );

      // Same person (phone + name) → reuse the existing record. This is the fix
      // that stops re-registration from creating a duplicate + a stray ID.
      const samePerson = samePhone.find((d) => normalizeName(d.data().name ?? '') === inputName);
      if (samePerson) {
        logger.info('[registerStudent] reused existing student', { studentId: samePerson.id });
        res.status(200).json({
          ok: true,
          reused: true,
          studentId: samePerson.id,
          name: samePerson.data().name,
          maskedPhone: maskLocal(input.phone),
        });
        return;
      }

      // Phone belongs to a different name already (usually a sibling on the same
      // parent number). Don't silently create — surface them so the parent can
      // pick themselves, or explicitly confirm this is a new player.
      if (samePhone.length > 0 && !input.confirmNew) {
        res.status(409).json({
          ok: false,
          code: 'PHONE_HAS_PLAYERS',
          error: 'This phone number is already registered to another player.',
          existingPlayers: samePhone.map((d) => ({
            studentId: d.id,
            name: d.data().name,
            maskedPhone: maskLocal(d.data().phone),
          })),
        });
        return;
      }

      const now = new Date().toISOString();
      const today = now.slice(0, 10);

      const studentData = {
        name: input.name,
        dateOfBirth: '2010-01-01', // placeholder — admin to correct
        gender: 'UNDISCLOSED',
        photoPath: null,
        guardianName: null,
        guardianUserId: null,
        // Store the canonical 10-digit form so future matching is exact.
        phone: inputPhone,
        email: input.email ?? null,
        address: '',
        city: centreData.city ?? '',
        pincode: centreData.pincode ?? '',
        bloodGroup: 'UNKNOWN',
        emergencyContact: {
          name: input.name,
          relationship: 'self',
          phone: inputPhone,
        },
        primaryCentreId: centreId,
        externalStudentId: null,
        batchIds: [],
        level: 'BEGINNER',
        status: 'ACTIVE',
        statusHistory: [],
        joinedDate: today,
        medicalNotes: null,
        // Self-registered via the public /fees page → gets a welcome email on
        // first payment. Cleared by onFeePaymentCreated once sent.
        welcomeEmailPending: true,
        createdAt: now,
        updatedAt: now,
        createdBy: 'PUBLIC_FEES_PAGE',
        updatedBy: 'PUBLIC_FEES_PAGE',
      };

      const ref = await db.collection('students').add(studentData);

      logger.info('[registerStudent] created', { studentId: ref.id, centreCode: input.centreCode });

      res.status(201).json({
        ok: true,
        studentId: ref.id,
        name: input.name,
        maskedPhone: maskLocal(input.phone),
      });
    } catch (err) {
      logger.error('[registerStudent] error', { err });
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  },
);
