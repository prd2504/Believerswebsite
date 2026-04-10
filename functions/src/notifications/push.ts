/**
 * FCM (Firebase Cloud Messaging) push sender. Step 1 scaffold: single send function
 * against the admin SDK. Per-user FCM token storage will be added in Step 10
 * (notifications), at which point this module gains a batch sender.
 */

import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import './../admin.js'; // ensure Admin initialised

export interface PushPayload {
  title: string;
  body: string;
  linkPath?: string;
}

/**
 * Send a push notification to a single device token.
 */
export async function sendPushToToken(token: string, payload: PushPayload): Promise<void> {
  try {
    await admin.messaging().send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.linkPath ? { linkPath: payload.linkPath } : undefined,
    });
  } catch (err) {
    logger.error('[push] send failed', { err, token });
    throw err;
  }
}
