/**
 * Cloud Function trigger: sends an email digest to the super admin whenever a
 * coach saves attendance for a session.
 *
 * Trigger: Firestore onCreate on /attendance/{batchId}/sessions/{sessionId}/records/{recordId}
 * (fires once per record; we debounce by checking if the email was already sent for this session)
 *
 * Email contains a formatted attendance summary table for the entire session.
 *
 * Requires env vars in functions/.env:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *   ADMIN_EMAIL — the recipient address for attendance digests
 *   EMAIL_FROM — sender address (e.g. "BBA Sports <noreply@bbasports.in>")
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from '../admin.js';

const REGION = 'asia-south1';

export const onAttendanceRecordCreated = onDocumentCreated(
  {
    document: 'attendance/{batchId}/sessions/{sessionId}/records/{recordId}',
    region: REGION,
  },
  async (event) => {
    const { batchId, sessionId } = event.params;
    const snap = event.data;
    if (!snap) return;

    // ── Debounce: only send email once per session ──
    // We check a flag on the session document
    const sessionRef = db.doc(`attendance/${batchId}/sessions/${sessionId}`);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) return;

    const sessionData = sessionSnap.data()!;
    if (sessionData.emailSent) return;

    // Mark early to avoid duplicate sends from concurrent record writes
    await sessionRef.update({ emailSent: true });

    // ── Gather data ──
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      console.log('ADMIN_EMAIL not configured, skipping attendance email.');
      return;
    }

    // Wait briefly for all records to settle (batch write completes quickly)
    await new Promise((r) => setTimeout(r, 3000));

    // Fetch all records for this session
    const recordsSnap = await db
      .collection(`attendance/${batchId}/sessions/${sessionId}/records`)
      .get();

    const records = recordsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Array<{
      id: string;
      studentId: string | null;
      attendeeType: string;
      status: string;
      note?: string;
      walkInName?: string;
    }>;

    // Fetch batch name
    const batchSnap = await db.collection('batches').where('__name__', '==', batchId).limit(1).get();
    let batchName = batchId;
    if (!batchSnap.empty) {
      batchName = batchSnap.docs[0].data().name ?? batchId;
    } else {
      // Try direct get
      const bDoc = await db.doc(`batches/${batchId}`).get();
      if (bDoc.exists) batchName = bDoc.data()!.name ?? batchId;
    }

    // Fetch student names
    const studentIds = records
      .filter((r) => r.studentId)
      .map((r) => r.studentId!);
    const studentNames = new Map<string, string>();
    if (studentIds.length > 0) {
      // Firestore `in` query supports max 30 items
      const chunks = [];
      for (let i = 0; i < studentIds.length; i += 30) {
        chunks.push(studentIds.slice(i, i + 30));
      }
      for (const chunk of chunks) {
        const sSnap = await db.collection('students').where('__name__', 'in', chunk).get();
        sSnap.docs.forEach((d) => studentNames.set(d.id, d.data().name ?? d.id));
      }
    }

    const sessionDate = sessionData.sessionDate ?? 'Unknown date';
    const coachId = sessionData.coachIds?.[0] ?? 'Unknown coach';

    // Fetch coach name
    let coachName = coachId;
    if (coachId !== 'Unknown coach') {
      const coachDoc = await db.doc(`users/${coachId}`).get();
      if (coachDoc.exists) coachName = coachDoc.data()!.name ?? coachId;
    }

    // ── Build email ──
    const presentCount = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const absentCount = records.filter((r) => r.status === 'ABSENT').length;

    const tableRows = records
      .sort((a, b) => {
        const nameA = a.studentId ? (studentNames.get(a.studentId) ?? '') : (a.walkInName ?? '');
        const nameB = b.studentId ? (studentNames.get(b.studentId) ?? '') : (b.walkInName ?? '');
        return nameA.localeCompare(nameB);
      })
      .map((r) => {
        const name = r.studentId
          ? (studentNames.get(r.studentId) ?? r.studentId)
          : (r.walkInName ?? 'Walk-in');
        const statusEmoji = r.status === 'PRESENT' ? '✅' :
                           r.status === 'ABSENT' ? '❌' :
                           r.status === 'LATE' ? '⏰' : '🔵';
        return `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${name}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${r.attendeeType}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${statusEmoji} ${r.status}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${r.note ?? '—'}</td>
        </tr>`;
      })
      .join('\n');

    const subject = `📋 Attendance: ${batchName} — ${sessionDate} (${presentCount}P / ${absentCount}A)`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#E8593C;color:white;padding:16px 24px;border-radius:12px 12px 0 0">
    <h2 style="margin:0;font-size:18px">Believers Badminton Academy</h2>
    <p style="margin:4px 0 0;font-size:13px;opacity:0.9">Attendance Update</p>
  </div>
  <div style="border:1px solid #e5e5e5;border-top:0;padding:24px;border-radius:0 0 12px 12px">
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr>
        <td style="padding:4px 0;color:#666;font-size:13px"><strong>Batch:</strong></td>
        <td style="padding:4px 0;font-size:13px">${batchName}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#666;font-size:13px"><strong>Date:</strong></td>
        <td style="padding:4px 0;font-size:13px">${sessionDate}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#666;font-size:13px"><strong>Coach:</strong></td>
        <td style="padding:4px 0;font-size:13px">${coachName}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#666;font-size:13px"><strong>Summary:</strong></td>
        <td style="padding:4px 0;font-size:13px">
          <span style="color:#16a34a;font-weight:600">${presentCount} Present</span> ·
          <span style="color:#dc2626;font-weight:600">${absentCount} Absent</span> ·
          ${records.length} Total
        </td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e5e5e5;border-radius:8px">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e5e5e5">Student</th>
          <th style="padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e5e5e5">Type</th>
          <th style="padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e5e5e5">Status</th>
          <th style="padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e5e5e5">Note</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>

    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center">
      This is an automated email from BBA Sports. Do not reply.
    </p>
  </div>
</body>
</html>`;

    // ── Send email via SMTP ──
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const emailFrom = process.env.EMAIL_FROM ?? 'BBA Sports <noreply@bbasports.in>';

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.log('SMTP not configured, logging email to console instead.');
      console.log(`TO: ${adminEmail}`);
      console.log(`SUBJECT: ${subject}`);
      console.log(`RECORDS: ${records.length}`);
      return;
    }

    // Dynamic import to avoid breaking deploys if nodemailer isn't installed
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort ?? '587'),
        secure: Number(smtpPort ?? '587') === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: emailFrom,
        to: adminEmail,
        subject,
        html,
      });

      console.log(`Attendance email sent to ${adminEmail} for session ${sessionId}`);
    } catch (err) {
      console.error('Failed to send attendance email:', err);
      // Don't throw — we don't want to retry the function for email failures
    }
  },
);
