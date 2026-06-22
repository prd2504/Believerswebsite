/**
 * Consolidated attendance email digest.
 *
 * Trigger: onDocumentWritten on attendance/{batchId}/sessions/{sessionId}
 *
 * Fires when a session doc is created or updated. We only proceed when
 * `endedAt` is freshly set (the webapp sets it after saving all records).
 *
 * Consolidates ALL batches for the same centre + date into ONE email,
 * using an `emailDigests/{centreId}_{date}` doc for deduplication.
 * A Firestore transaction ensures exactly one function instance claims
 * the digest; the winner waits for all batch saves to settle,
 * then fetches every session + record for the centre and sends a single
 * email to the admin team.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import nodemailer from 'nodemailer';
import { db } from '../admin.js';

const REGION = 'asia-south1';
const CONSOLIDATION_WAIT_MS = 45_000;
const DEDUP_WINDOW_MS = 120_000;

const ATTENDANCE_TO = 'hello@bbashuttle.com';
const ATTENDANCE_CC = [
  'arifriyaaa00@gmail.com',
  'palkardarshak10@gmail.com',
  'manas7398.mg@gmail.com',
];

export const onAttendanceDigest = onDocumentWritten(
  {
    document: 'attendance/{batchId}/sessions/{sessionId}',
    region: REGION,
    timeoutSeconds: 180,
  },
  async (event) => {
    if (!event.data) return;

    const afterSnap = event.data.after;
    if (!afterSnap.exists) return;

    const after = afterSnap.data()!;
    if (!after.endedAt) return;

    const beforeSnap = event.data.before;
    if (beforeSnap.exists) {
      const before = beforeSnap.data()!;
      if (before.endedAt === after.endedAt) return;
    }

    const centreId = after.centreId as string;
    const sessionDate = (after.sessionDate as string) ?? event.params.sessionId;

    if (!centreId) {
      console.warn(`Session ${event.params.batchId}/${event.params.sessionId} missing centreId`);
      return;
    }

    // ── Centre-level dedup via transaction ──
    const digestRef = db.doc(`emailDigests/${centreId}_${sessionDate}`);
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(digestRef);
      if (snap.exists) {
        const data = snap.data()!;
        const sentAt = data.sentAt as string | undefined;
        const claimedAt = data.claimedAt as string | undefined;

        if (sentAt && Date.now() - new Date(sentAt).getTime() < DEDUP_WINDOW_MS) {
          return false;
        }
        if (claimedAt && !sentAt && Date.now() - new Date(claimedAt).getTime() < CONSOLIDATION_WAIT_MS + 30_000) {
          return false;
        }
      }
      tx.set(digestRef, { centreId, sessionDate, claimedAt: new Date().toISOString(), sentAt: null });
      return true;
    });

    if (!claimed) return;

    await new Promise((r) => setTimeout(r, CONSOLIDATION_WAIT_MS));

    // ── Gather data ──
    const batchesSnap = await db.collection('batches').where('centreId', '==', centreId).get();
    if (batchesSnap.empty) return;

    type RawRecord = {
      id: string;
      studentId: string | null;
      attendeeType: string;
      status: string;
      note?: string;
      walkInName?: string;
    };

    const batchSessions: Array<{
      batchName: string;
      startTime: string;
      endTime: string;
      coachIds: string[];
      records: RawRecord[];
    }> = [];

    const allStudentIds = new Set<string>();
    const allCoachIds = new Set<string>();

    for (const batchDoc of batchesSnap.docs) {
      const sesSnap = await db.doc(`attendance/${batchDoc.id}/sessions/${sessionDate}`).get();
      if (!sesSnap.exists) continue;

      const sesData = sesSnap.data()!;
      const recordsSnap = await db
        .collection(`attendance/${batchDoc.id}/sessions/${sessionDate}/records`)
        .get();
      if (recordsSnap.empty) continue;

      const batchData = batchDoc.data();
      const records = recordsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as RawRecord[];
      records.forEach((r) => {
        if (r.studentId) allStudentIds.add(r.studentId);
      });
      ((sesData.coachIds as string[]) ?? []).forEach((id) => allCoachIds.add(id));

      batchSessions.push({
        batchName: batchData.name ?? batchDoc.id,
        startTime: batchData.startTime ?? '',
        endTime: batchData.endTime ?? '',
        coachIds: sesData.coachIds ?? [],
        records,
      });
    }

    if (batchSessions.length === 0) return;

    batchSessions.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.batchName.localeCompare(b.batchName));

    // Fetch student names in chunks of 30
    const studentNames = new Map<string, string>();
    const studentIdArr = Array.from(allStudentIds);
    for (let i = 0; i < studentIdArr.length; i += 30) {
      const chunk = studentIdArr.slice(i, i + 30);
      const snap = await db.collection('students').where('__name__', 'in', chunk).get();
      snap.docs.forEach((d) => studentNames.set(d.id, d.data().name ?? d.id));
    }

    // Fetch coach names
    const coachNames = new Map<string, string>();
    for (const coachId of allCoachIds) {
      const coachDoc = await db.doc(`users/${coachId}`).get();
      if (coachDoc.exists) coachNames.set(coachId, coachDoc.data()!.name ?? coachId);
    }

    // Fetch centre name
    let centreName = centreId;
    const centreDoc = await db.doc(`centres/${centreId}`).get();
    if (centreDoc.exists) centreName = centreDoc.data()!.name ?? centreId;

    // ── Build email ──
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalRecords = 0;

    const emoji = (s: string) =>
      s === 'PRESENT' ? '✅' : s === 'ABSENT' ? '❌' : s === 'LATE' ? '⏰' : '🔵';

    function formatTime12(t: string): string {
      if (!t) return '';
      const [h, m] = t.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    const sectionsHtml = batchSessions
      .map((bs) => {
        const present = bs.records.filter(
          (r) => r.status === 'PRESENT' || r.status === 'LATE',
        ).length;
        const absent = bs.records.filter((r) => r.status === 'ABSENT').length;
        totalPresent += present;
        totalAbsent += absent;
        totalRecords += bs.records.length;

        const coach =
          bs.coachIds.map((id) => coachNames.get(id) ?? id).join(', ') || 'Unknown';

        const timeLabel = bs.startTime && bs.endTime
          ? `${formatTime12(bs.startTime)} – ${formatTime12(bs.endTime)}`
          : '';

        const rows = bs.records
          .sort((a, b) => {
            const nA = a.studentId
              ? (studentNames.get(a.studentId) ?? '')
              : (a.walkInName ?? '');
            const nB = b.studentId
              ? (studentNames.get(b.studentId) ?? '')
              : (b.walkInName ?? '');
            return nA.localeCompare(nB);
          })
          .map((r, i) => {
            const name = r.studentId
              ? (studentNames.get(r.studentId) ?? r.studentId)
              : (r.walkInName ?? 'Walk-in');
            return `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;color:#666">${i + 1}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${name}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${emoji(r.status)} ${r.status}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;color:#999">${r.note ?? '—'}</td>
        </tr>`;
          })
          .join('\n');

        return `
      <div style="margin-bottom:24px">
        <div style="background:#f9fafb;padding:12px 16px;border-radius:8px 8px 0 0;border:1px solid #e5e5e5;border-bottom:none">
          <h3 style="margin:0;font-size:15px;color:#1a1a1a">${bs.batchName}${timeLabel ? ` <span style="font-weight:400;font-size:13px;color:#666">(${timeLabel})</span>` : ''}</h3>
          <p style="margin:4px 0 0;font-size:12px;color:#666">
            Coach: ${coach} &middot;
            <span style="color:#16a34a;font-weight:600">${present}P</span> /
            <span style="color:#dc2626;font-weight:600">${absent}A</span> /
            ${bs.records.length} total
          </p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e5e5e5;border-top:none">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e5e5e5;width:30px">#</th>
              <th style="padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e5e5e5">Student</th>
              <th style="padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e5e5e5">Status</th>
              <th style="padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e5e5e5">Note</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
      })
      .join('\n');

    const subject = `📋 ${centreName} — Attendance ${sessionDate} (${totalPresent}P / ${totalAbsent}A across ${batchSessions.length} batch${batchSessions.length !== 1 ? 'es' : ''})`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#E8593C;color:white;padding:16px 24px;border-radius:12px 12px 0 0">
    <h2 style="margin:0;font-size:18px">BBA Sports Academy</h2>
    <p style="margin:4px 0 0;font-size:13px;opacity:0.9">Attendance Digest — ${centreName}</p>
  </div>
  <div style="border:1px solid #e5e5e5;border-top:0;padding:24px;border-radius:0 0 12px 12px">
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr>
        <td style="padding:4px 0;color:#666;font-size:13px"><strong>Centre:</strong></td>
        <td style="padding:4px 0;font-size:13px">${centreName}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#666;font-size:13px"><strong>Date:</strong></td>
        <td style="padding:4px 0;font-size:13px">${sessionDate}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#666;font-size:13px"><strong>Summary:</strong></td>
        <td style="padding:4px 0;font-size:13px">
          <span style="color:#16a34a;font-weight:600">${totalPresent} Present</span> &middot;
          <span style="color:#dc2626;font-weight:600">${totalAbsent} Absent</span> &middot;
          ${totalRecords} Total across ${batchSessions.length} batch${batchSessions.length !== 1 ? 'es' : ''}
        </td>
      </tr>
    </table>

    ${sectionsHtml}

    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center">
      This is an automated email from BBA Sports. Do not reply.
    </p>
  </div>
</body>
</html>`;

    await digestRef.update({ sentAt: new Date().toISOString() });

    // ── Send email via SMTP ──
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const emailFrom = process.env.EMAIL_FROM ?? 'BBA Sports <noreply@bbasports.in>';

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.log('SMTP not configured — email logged to console.');
      console.log(`TO: ${ATTENDANCE_TO}, CC: ${ATTENDANCE_CC.join(', ')}`);
      console.log(`SUBJECT: ${subject}`);
      console.log(`BATCHES: ${batchSessions.length}, RECORDS: ${totalRecords}`);
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort ?? '587'),
        secure: Number(smtpPort ?? '587') === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: emailFrom,
        to: ATTENDANCE_TO,
        cc: ATTENDANCE_CC.join(','),
        subject,
        html,
      });

      console.log(
        `Attendance digest sent for ${centreName} on ${sessionDate} — ${batchSessions.length} batches, ${totalRecords} records`,
      );
    } catch (err) {
      console.error('Failed to send attendance email:', err);
      await digestRef.update({ sentAt: null });
    }
  },
);
