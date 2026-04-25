/**
 * Firestore trigger — fans out a broadcast to every matching user's notification inbox.
 * Fires when a new document appears in /broadcasts/{broadcastId}.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { db, FieldValue } from '../admin.js';

export const onBroadcastCreated = onDocumentCreated(
  { document: 'broadcasts/{broadcastId}', region: 'asia-south1' },
  async (event) => {
    const broadcastId = event.params.broadcastId;
    const data = event.data?.data();
    if (!data) return;

    const { title, body, targetCentreIds, targetRoles } = data as {
      title: string;
      body: string;
      targetCentreIds: string[] | 'ALL';
      targetRoles: string[] | null;
    };

    logger.info('[broadcast] fan-out start', { broadcastId, targetCentreIds });

    // Query matching users
    let usersQuery = db.collection('users').where('disabled', '==', false);

    // Role filter
    const roles = targetRoles ?? ['STUDENT', 'PARENT'];
    if (roles.length === 1) {
      usersQuery = usersQuery.where('role', '==', roles[0]);
    }

    const usersSnap = await usersQuery.get();

    let fanoutCount = 0;
    const batch = db.batch();

    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data();

      // Skip if role doesn't match
      if (!roles.includes(userData.role as string)) continue;

      // Centre filter
      if (targetCentreIds !== 'ALL' && Array.isArray(targetCentreIds)) {
        const userCentreIds: string[] = Array.isArray(userData.centreIds) ? userData.centreIds : [];
        if (!userCentreIds.some((id) => (targetCentreIds as string[]).includes(id))) continue;
      }

      const notifRef = db
        .collection('notifications')
        .doc(userDoc.id)
        .collection('messages')
        .doc();

      batch.set(notifRef, {
        userId: userDoc.id,
        type: 'BROADCAST',
        title,
        body,
        linkPath: null,
        deliveredVia: ['IN_APP'],
        read: false,
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: data.createdBy ?? null,
        updatedBy: data.createdBy ?? null,
      });

      fanoutCount++;

      // Firestore batches max 500 writes — commit and start a new batch
      if (fanoutCount % 400 === 0) {
        await batch.commit();
      }
    }

    await batch.commit();

    // Mark broadcast as complete
    await db.collection('broadcasts').doc(broadcastId).update({
      fanoutComplete: true,
      fanoutCount,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info('[broadcast] fan-out done', { broadcastId, fanoutCount });
  },
);
