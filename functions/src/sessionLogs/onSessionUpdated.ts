import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../admin.js';

const REGION = 'asia-south1';
const LATE_THRESHOLD_MINUTES = 10;

export const onSessionLogUpdated = onDocumentUpdated(
  {
    document: 'attendance/{batchId}/sessions/{sessionId}',
    region: REGION,
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const hadPunchIn = !!before.punchInAt;
    const hasPunchIn = !!after.punchInAt;
    if (hadPunchIn || !hasPunchIn) return;

    const { batchId } = event.params;
    const batchDoc = await db.doc(`batches/${batchId}`).get();
    if (!batchDoc.exists) return;

    const batchData = batchDoc.data()!;
    const batchStartTime = batchData.startTime as string | undefined;
    if (!batchStartTime) return;

    const sessionDate = after.sessionDate as string;
    const [hours, minutes] = batchStartTime.split(':').map(Number);
    const scheduledStart = new Date(`${sessionDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+05:30`);

    const punchInTime = new Date(after.punchInAt as string);
    const diffMinutes = (punchInTime.getTime() - scheduledStart.getTime()) / 60000;

    if (diffMinutes > LATE_THRESHOLD_MINUTES) {
      await event.data!.after.ref.update({ latePunchIn: true });

      const coachId = after.coachIds?.[0];
      let coachName = coachId ?? 'Unknown';
      if (coachId) {
        const coachDoc = await db.doc(`users/${coachId}`).get();
        if (coachDoc.exists) coachName = coachDoc.data()!.name ?? coachId;
      }

      const adminUsers = await db.collection('users').where('role', '==', 'SUPER_ADMIN').get();
      const batch = db.batch();
      for (const adminDoc of adminUsers.docs) {
        const notifRef = db.collection(`notifications/${adminDoc.id}/messages`).doc();
        batch.set(notifRef, {
          userId: adminDoc.id,
          type: 'ABSENCE_ALERT',
          title: `Late punch-in: ${coachName}`,
          body: `${coachName} punched in ${Math.round(diffMinutes)} minutes late for ${batchData.name ?? batchId} on ${sessionDate}.`,
          linkPath: '/admin/session-logs',
          deliveredVia: ['IN_APP'],
          read: false,
          readAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: null,
          updatedBy: null,
        });
      }
      await batch.commit();
      console.log(`Late punch-in flagged for ${coachName} on ${sessionDate}`);
    }
  },
);
