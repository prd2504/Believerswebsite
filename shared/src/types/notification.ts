/**
 * In-app notifications. Stored per-user at /notifications/{userId}/messages/{notificationId}.
 * Keeping them partitioned by user means security rules are trivial (user can only read
 * their own notifications subcollection).
 */

import type { BaseDocument } from './common.js';

export const NotificationType = {
  FEE_DUE: 'FEE_DUE',
  FEE_OVERDUE: 'FEE_OVERDUE',
  ABSENCE_ALERT: 'ABSENCE_ALERT',
  PROGRESS_REPORT_READY: 'PROGRESS_REPORT_READY',
  SCHEDULE_CHANGE: 'SCHEDULE_CHANGE',
  TOURNAMENT_ANNOUNCEMENT: 'TOURNAMENT_ANNOUNCEMENT',
  TOURNAMENT_REGISTRATION: 'TOURNAMENT_REGISTRATION',
  BROADCAST: 'BROADCAST',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationChannel = {
  IN_APP: 'IN_APP',
  WHATSAPP: 'WHATSAPP',
  PUSH: 'PUSH',
  EMAIL: 'EMAIL',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

/** An in-app notification row. One row per delivered notification. */
export interface NotificationDocument extends BaseDocument {
  id: string;

  /** Owner of the notification (the user who receives it). */
  userId: string;

  type: NotificationType;
  /** Short title shown in the bell dropdown. */
  title: string;
  /** Longer body text, may include markdown. */
  body: string;

  /** Optional deep link — the path to navigate to when the notification is clicked. */
  linkPath: string | null;

  /** Channels this notification was dispatched on — informational only. */
  deliveredVia: NotificationChannel[];

  /** Whether the user has opened it. */
  read: boolean;
  readAt: string | null;
}

/**
 * An admin broadcast message. Stored separately at /broadcasts/{broadcastId} and fanned
 * out to individual user notification subcollections by a Cloud Function.
 */
export interface BroadcastDocument extends BaseDocument {
  id: string;

  /** Target scope — either a list of centreIds or the literal string "ALL" for all centres. */
  targetCentreIds: string[] | 'ALL';

  /** Target roles — null means all eligible roles (STUDENT, PARENT by default). */
  targetRoles: string[] | null;

  title: string;
  body: string;

  /** Channels to actually deliver on. In-app is always included implicitly. */
  sendWhatsApp: boolean;
  sendPush: boolean;
  sendEmail: boolean;

  /** Fan-out status. */
  fanoutComplete: boolean;
  fanoutCount: number;
}
