import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { registerStudentSchema } from './validation.js';
import { checkRateLimit } from './rateLimiter.js';

/**
 * Lets a parent register a new student from the public /fees page when their
 * name isn't found in the autocomplete. Creates a minimal student doc with
 * placeholder values for required fields; an admin completes the profile later.
 *
 *   POST /registerStudent
 *   Body: { centreCode, name, phone, email? }
 */

function maskPhone(local: string): string {
  return `${local.slice(0, 2)}****${local.slice(-4)}`;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
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

      // --- Duplicate check: same name + phone at this centre ---
      const existingSnap = await db
        .collection('students')
        .where('primaryCentreId', '==', centreId)
        .where('phone', '==', input.phone)
        .get();

      const dup = existingSnap.docs.find((d) => normalize(d.data().name ?? '') === normalize(input.name));
      if (dup) {
        res.status(409).json({
          ok: false,
          error: 'A student with this name and phone already exists at this centre',
          studentId: dup.id,
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
        phone: input.phone,
        email: input.email ?? null,
        address: '',
        city: centreData.city ?? '',
        pincode: centreData.pincode ?? '',
        bloodGroup: 'UNKNOWN',
        emergencyContact: {
          name: input.name,
          relationship: 'self',
          phone: input.phone,
        },
        primaryCentreId: centreId,
        externalStudentId: null,
        batchIds: [],
        level: 'BEGINNER',
        status: 'ACTIVE',
        statusHistory: [],
        joinedDate: today,
        medicalNotes: null,
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
        maskedPhone: maskPhone(input.phone),
      });
    } catch (err) {
      logger.error('[registerStudent] error', { err });
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  },
);
