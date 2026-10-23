import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from '../admin.js';

const REGION = 'asia-south1';

export const onFeedbackCreated = onDocumentCreated(
  {
    document: 'parentFeedback/{feedbackId}',
    region: REGION,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    if (!data.autoEscalated) return;

    const centreId = data.centreId as string;
    const studentId = data.studentId as string;
    const parentName = data.parentName as string;

    let studentName = studentId;
    const studentDoc = await db.doc(`students/${studentId}`).get();
    if (studentDoc.exists) studentName = studentDoc.data()!.name ?? studentId;

    let centreName = centreId;
    const centreDoc = await db.doc(`centres/${centreId}`).get();
    if (centreDoc.exists) centreName = centreDoc.data()!.name ?? centreId;

    const recipientUsers = await db.collection('users')
      .where('role', 'in', ['SUPER_ADMIN', 'CENTRE_MANAGER'])
      .get();

    const batch = db.batch();
    for (const userDoc of recipientUsers.docs) {
      const role = userDoc.data().role;
      if (role === 'CENTRE_MANAGER') {
        const allAccess = userDoc.data().allCentreAccess === true;
        const centreIds = userDoc.data().centreIds as string[] | undefined;
        if (!allAccess && (!centreIds || !centreIds.includes(centreId))) continue;
      }

      const notifRef = db.collection(`notifications/${userDoc.id}/messages`).doc();
      batch.set(notifRef, {
        userId: userDoc.id,
        type: 'FEEDBACK_ESCALATED',
        title: `Low feedback from ${parentName}`,
        body: `${parentName} gave a low rating for ${studentName} at ${centreName}. Overall satisfaction: ${data.overallSatisfaction}/5, NPS: ${data.npsScore}/10.`,
        linkPath: '/admin/parent-feedback',
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
    console.log(`Escalated feedback notification sent for ${parentName} at ${centreName}`);
  },
);
