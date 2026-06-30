import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../admin.js';
import { config } from '../config.js';
import { submitFeePaymentSchema } from './validation.js';
import { checkRateLimit } from './rateLimiter.js';
import { assignExternalStudentId, generateExternalInvoiceNo } from './invoiceCounter.js';
import { syncPublicFeePayment } from './sheetsSync.js';
import { sendMail } from './mailer.js';
import { buildWelcomeHtml } from './welcomeEmailTemplate.js';

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export const submitFeePayment = onRequest(
  {
    region: 'asia-south1',
    cors: true,
    timeoutSeconds: 60,
  },
  async (req, res): Promise<void> => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    // --- Parse & validate input ---
    const parsed = submitFeePaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const input = parsed.data;

    // --- Auth mode ---
    const apiKey = req.header('x-api-key');
    const isSheets = !!apiKey;

    if (isSheets) {
      if (!config.sheets.apiKey || apiKey !== config.sheets.apiKey) {
        res.status(401).json({ ok: false, error: 'Invalid API key' });
        return;
      }
    } else {
      const rateKey = input.phone ?? input.studentName ?? 'anon';
      if (!checkRateLimit(`fee:${rateKey}`, 5, 10 * 60 * 1000)) {
        res.status(429).json({ ok: false, error: 'Too many requests. Try again in a few minutes.' });
        return;
      }
    }

    try {
      // --- Look up centre by centreCode ---
      const centreSnap = await db.collection('centres')
        .where('centreCode', '==', input.centreCode)
        .where('active', '==', true)
        .limit(1)
        .get();

      if (centreSnap.empty) {
        res.status(404).json({ ok: false, error: `Centre with code "${input.centreCode}" not found` });
        return;
      }

      const centreDoc = centreSnap.docs[0];
      const centreId = centreDoc.id;
      const centreData = centreDoc.data();
      const gstRate = centreData.gstRatePercent ?? 0;

      // --- Look up student ---
      const studentsSnap = await db.collection('students')
        .where('primaryCentreId', '==', centreId)
        .get();

      const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{
        id: string;
        name: string;
        phone: string | null;
        email: string | null;
        externalStudentId: string | null;
        batchIds: string[];
      }>;

      let student: typeof students[number] | undefined;

      if (input.studentId) {
        student = students.find((s) => s.id === input.studentId);
      }

      if (!student && input.externalStudentId) {
        student = students.find((s) => s.externalStudentId === input.externalStudentId);
      }

      if (!student && input.phone) {
        const normPhone = normalizePhone(input.phone);
        student = students.find((s) => s.phone && normalizePhone(s.phone) === normPhone);
      }

      if (!student && input.studentName) {
        const normName = normalize(input.studentName);
        student = students.find((s) => normalize(s.name) === normName);
        if (!student) {
          student = students.find((s) =>
            normalize(s.name).includes(normName) || normName.includes(normalize(s.name)),
          );
        }
      }

      if (!student) {
        // SHEETS_FORM only: externalStudentId is authoritative — create the Firestore doc
        if (isSheets && input.externalStudentId && input.studentName) {
          const nowStr = new Date().toISOString();
          const today  = nowStr.slice(0, 10);
          const newStudentData = {
            name:              input.studentName,
            dateOfBirth:       '2010-01-01',
            gender:            'UNDISCLOSED',
            photoPath:         null,
            guardianName:      null,
            guardianUserId:    null,
            phone:             input.phone ?? null,
            email:             input.email ?? null,
            address:           '',
            city:              centreData.city    ?? '',
            pincode:           centreData.pincode ?? '',
            bloodGroup:        'UNKNOWN',
            emergencyContact:  { name: input.studentName, relationship: 'self', phone: input.phone ?? null },
            primaryCentreId:   centreId,
            externalStudentId: input.externalStudentId,
            batchIds:          [],
            level:             'BEGINNER',
            status:            'ACTIVE',
            statusHistory:     [],
            joinedDate:        today,
            medicalNotes:      null,
            createdAt:         nowStr,
            updatedAt:         nowStr,
            createdBy:         'SHEETS_FORM',
            updatedBy:         'SHEETS_FORM',
          };
          const newRef = await db.collection('students').add(newStudentData);
          logger.info('[submitFeePayment] auto-created student from Sheets', {
            studentId: newRef.id,
            externalStudentId: input.externalStudentId,
            centreCode: input.centreCode,
          });
          student = {
            id:                newRef.id,
            name:              input.studentName,
            phone:             input.phone ?? null,
            email:             input.email ?? null,
            externalStudentId: input.externalStudentId,
            batchIds:          [],
          };
        } else {
          res.status(404).json({
            ok: false,
            error: 'Student not found',
            hint: 'Check the name, phone, or external ID',
          });
          return;
        }
      }

      // --- Auto-assign externalStudentId if missing ---
      let externalStudentId = student.externalStudentId;
      if (!externalStudentId) {
        externalStudentId = await assignExternalStudentId(centreId, input.centreCode, student.id);
      }

      // --- Persist payer email onto the student so the invoice trigger has a recipient ---
      // Only fill when the student has no email yet — never overwrite an existing one.
      if (input.email && !student.email) {
        await db.collection('students').doc(student.id).update({
          email: input.email,
          updatedAt: new Date().toISOString(),
        });
        student.email = input.email;
      }

      // --- Look up active enrollment for batchId ---
      const enrollSnap = await db.collection('enrollments')
        .where('studentId', '==', student.id)
        .where('status', '==', 'ACTIVE')
        .limit(1)
        .get();

      let batchId: string;
      if (!enrollSnap.empty) {
        batchId = enrollSnap.docs[0].data().batchId;
      } else {
        batchId = student.batchIds?.[0] ?? '';
      }

      // --- Duplicate check ---
      const dupSnap = await db.collection('payments')
        .where('studentId', '==', student.id)
        .where('month', '==', input.month)
        .where('batchId', '==', batchId)
        .limit(1)
        .get();

      if (!dupSnap.empty) {
        const existing = dupSnap.docs[0];
        res.status(409).json({
          ok: false,
          error: `Payment already exists for ${student.name} for ${input.month}`,
          existingPaymentId: existing.id,
        });
        return;
      }

      // --- Compute amounts (amountRupees is the total inclusive of GST) ---
      const totalPaise = rupeesToPaise(input.amountRupees);
      let basePaise: number;
      let gstPaise: number;
      if (gstRate > 0) {
        basePaise = Math.round((totalPaise * 100) / (100 + gstRate));
        gstPaise = totalPaise - basePaise;
      } else {
        basePaise = totalPaise;
        gstPaise = 0;
      }

      // --- Generate external invoice number ---
      const externalInvoiceNo = await generateExternalInvoiceNo(centreId, input.centreCode);

      // --- Create payment doc ---
      const now = new Date().toISOString();
      const paymentSource = isSheets ? 'SHEETS_FORM' : 'PUBLIC_FEES_PAGE';

      const paymentData = {
        studentId: student.id,
        batchId,
        centreId,
        month: input.month,
        baseAmountPaise: basePaise,
        gstAmountPaise: gstPaise,
        totalAmountPaise: totalPaise,
        gstRatePercentSnapshot: gstRate,
        status: 'PAID',
        method: input.method,
        dueDate: null,
        paidAt: now,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        razorpaySignature: null,
        notes: input.notes ?? null,
        receiptNumber: null,
        receiptPdfPath: null,
        externalInvoiceNo,
        screenshotUrl: input.screenshotUrl ?? null,
        coachName: input.coachName ?? null,
        paymentSource,
        createdAt: now,
        updatedAt: now,
        createdBy: paymentSource,
        updatedBy: paymentSource,
      };

      const paymentRef = await db.collection('payments').add(paymentData);

      logger.info('[submitFeePayment] created', {
        paymentId: paymentRef.id,
        studentId: student.id,
        externalInvoiceNo,
        source: paymentSource,
      });

      // --- Apps Script parity for PUBLIC_FEES_PAGE (SHEETS_FORM untouched) ---
      if (paymentSource === 'PUBLIC_FEES_PAGE') {
        try {
          let batchName = '';
          if (batchId) {
            const batchDoc = await db.collection('batches').doc(batchId).get();
            if (batchDoc.exists) batchName = (batchDoc.data()!.name as string) ?? '';
          }
          // Fresh centre counters (post-increment) to mirror into Centre_Config.
          const freshCentreSnap = await db.collection('centres').doc(centreId).get();
          const lastInvoiceNo = (freshCentreSnap.data()?.lastInvoiceNo as number) ?? null;
          const lastStudentNo = (freshCentreSnap.data()?.lastStudentNo as number) ?? null;
          const { isNewStudent } = await syncPublicFeePayment({
            externalInvoiceNo,
            nowIso: now,
            externalStudentId: externalStudentId ?? null,
            studentName: student.name,
            phone: student.phone ?? input.phone ?? null,
            email: student.email ?? input.email ?? null,
            centreName: (centreData.name as string) ?? input.centreCode,
            centreCode: input.centreCode,
            month: input.month,
            batchName,
            amountRupees: input.amountRupees,
            method: input.method,
            coachName: input.coachName ?? null,
            screenshotUrl: input.screenshotUrl ?? null,
            lastInvoiceNo,
            lastStudentNo,
          });
          logger.info('[submitFeePayment] Sheets sync complete', { externalInvoiceNo, isNewStudent });

          // Welcome email — new students only (best-effort; invoice email is sent by onFeePaymentCreated)
          if (isNewStudent) {
            const welcomeTo = student.email ?? input.email ?? null;
            if (welcomeTo) {
              try {
                await sendMail({
                  to: welcomeTo,
                  subject: 'Welcome to BBA Sports! 🏸',
                  html: buildWelcomeHtml({
                    studentName: student.name,
                    externalStudentId: externalStudentId ?? null,
                    centreName: (centreData.name as string) ?? input.centreCode,
                    batchName,
                  }),
                });
                logger.info('[submitFeePayment] welcome email sent', { externalInvoiceNo });
              } catch (welErr: any) {
                logger.warn('[submitFeePayment] welcome email failed — non-fatal', { error: welErr?.message });
              }
            }
          }
        } catch (sheetsErr: any) {
          logger.warn('[submitFeePayment] Sheets sync failed — non-fatal', {
            error: sheetsErr?.message,
            externalInvoiceNo,
          });
        }
      }

      res.status(201).json({
        ok: true,
        paymentId: paymentRef.id,
        externalInvoiceNo,
        externalStudentId,
        studentName: student.name,
      });
    } catch (err) {
      logger.error('[submitFeePayment] error', { err });
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  },
);
