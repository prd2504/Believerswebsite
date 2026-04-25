/**
 * Callable Cloud Function — generate a monthly progress report for a student.
 *
 * Triggered by admin/coach from the webapp. Reads the student's scores for the
 * requested month, calls Claude, and writes the result to Firestore.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db, FieldValue } from '../admin.js';
import { generateProgressReport, type ProgressReportInput } from '../ai/progressReport.js';
import { UserRole } from '@bba/shared';

interface GenerateReportPayload {
  studentId: string;
  yearMonth: string; // YYYY-MM
}

export const generateProgressReportFn = onCall<GenerateReportPayload>(
  { region: 'asia-south1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const { studentId, yearMonth } = request.data;
    if (!studentId || !yearMonth) {
      throw new HttpsError('invalid-argument', 'studentId and yearMonth required.');
    }

    // Only admins, managers, and coaches may generate reports
    const userDoc = await db.collection('users').doc(uid).get();
    const role = userDoc.data()?.role as string | undefined;
    const allowedRoles: string[] = [UserRole.SUPER_ADMIN, UserRole.CENTRE_MANAGER, UserRole.COACH];
    if (!role || !allowedRoles.includes(role)) {
      throw new HttpsError('permission-denied', 'Insufficient role to generate reports.');
    }

    // Load student doc
    const studentDoc = await db.collection('students').doc(studentId).get();
    if (!studentDoc.exists) throw new HttpsError('not-found', 'Student not found.');
    const studentName = (studentDoc.data()?.name as string) ?? 'Student';

    // Load scores for the month
    const startDate = `${yearMonth}-01`;
    const endDate = `${yearMonth}-31`;

    const scoresSnap = await db
      .collection('progress')
      .doc(studentId)
      .collection('scores')
      .where('assessedOn', '>=', startDate)
      .where('assessedOn', '<=', endDate)
      .get();

    const allScores = scoresSnap.docs.map((d) => d.data());
    const sessionCount = allScores.length;

    // Compute average scores
    const sumMap: Record<string, number> = {};
    const countMap: Record<string, number> = {};
    const coachNotes: string[] = [];

    for (const s of allScores) {
      if (s.note) coachNotes.push(s.note as string);
      if (s.scores && typeof s.scores === 'object') {
        for (const [skill, val] of Object.entries(s.scores as Record<string, number>)) {
          sumMap[skill] = (sumMap[skill] ?? 0) + val;
          countMap[skill] = (countMap[skill] ?? 0) + 1;
        }
      }
    }

    const averageScores: Record<string, number> = {};
    for (const skill of Object.keys(sumMap)) {
      averageScores[skill] = Math.round((sumMap[skill] / countMap[skill]) * 10) / 10;
    }

    // Placeholder attendance (full attendance module integration in future step)
    const attendancePercent = 80;

    const input: ProgressReportInput = {
      studentName,
      yearMonth,
      attendancePercent,
      sessionCount,
      averageScores,
      coachNotes,
    };

    logger.info('[generateReport] generating for', { studentId, yearMonth, sessionCount });

    let result;
    try {
      result = await generateProgressReport(input);
    } catch (err) {
      logger.error('[generateReport] Claude call failed', err);
      throw new HttpsError('internal', `Report generation failed: ${(err as Error).message}`);
    }

    const reportRef = db.collection('progress').doc(studentId).collection('reports').doc();
    const reportData = {
      studentId,
      yearMonth,
      inputSnapshot: {
        attendancePercent,
        averageScores,
        sessionCount,
        coachNotes,
      },
      summaryText: result.summaryText,
      modelId: result.modelId,
      delivered: false,
      deliveredAt: null,
      pdfPath: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      updatedBy: uid,
    };

    await reportRef.set(reportData);
    logger.info('[generateReport] saved report', { reportId: reportRef.id });

    return { reportId: reportRef.id, summaryText: result.summaryText };
  },
);
