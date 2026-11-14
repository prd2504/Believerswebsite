/**
 * FCM (Firebase Cloud Messaging) push sender.
 */

import { logger } from 'firebase-functions';
import { getMessaging } from 'firebase-admin/messaging';
import './../admin.js'; // ensure Admin initialised

export interface PushPayload {
  title: string;
  body: string;
  linkPath?: string;
}

export async function sendPushToToken(token: string, payload: PushPayload): Promise<void> {
  try {
    await getMessaging().send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.linkPath ? { linkPath: payload.linkPath } : undefined,
    });
  } catch (err) {
    logger.error('[push] send failed', { err, token });
    throw err;
  }
}
