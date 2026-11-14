/**
 * Notification service — in-app notifications and admin broadcasts.
 *
 * Paths:
 *   /notifications/{userId}/messages/{notificationId}  — per-user inbox
 *   /broadcasts/{broadcastId}                           — admin broadcasts
 */

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@bba/shared';
import type { NotificationDocument, BroadcastDocument, NotificationType } from '@bba/shared';

function toIso(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts)
    return (ts as Timestamp).toDate().toISOString();
  return new Date().toISOString();
}

function notifFromFirestore(id: string, d: DocumentData): NotificationDocument {
  return {
    id, userId: d.userId ?? '',
    type: (d.type ?? 'SYSTEM') as NotificationType,
    title: d.title ?? '', body: d.body ?? '',
    linkPath: d.linkPath ?? null,
    deliveredVia: Array.isArray(d.deliveredVia) ? d.deliveredVia : ['IN_APP'],
    read: d.read ?? false, readAt: d.readAt ?? null,
    createdAt: toIso(d.createdAt), updatedAt: toIso(d.updatedAt),
    createdBy: d.createdBy ?? null, updatedBy: d.updatedBy ?? null,
  };
}

function broadcastFromFirestore(id: string, d: DocumentData): BroadcastDocument {
  return {
    id, targetCentreIds: d.targetCentreIds ?? 'ALL',
    targetRoles: d.targetRoles ?? null,
    title: d.title ?? '', body: d.body ?? '',
    sendWhatsApp: d.sendWhatsApp ?? false,
    sendPush: d.sendPush ?? false,
    sendEmail: d.sendEmail ?? false,
    fanoutComplete: d.fanoutComplete ?? false,
    fanoutCount: d.fanoutCount ?? 0,
    createdAt: toIso(d.createdAt), updatedAt: toIso(d.updatedAt),
    createdBy: d.createdBy ?? null, updatedBy: d.updatedBy ?? null,
  };
}

// ── User notifications ──

export async function getUserNotifications(userId: string): Promise<NotificationDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.notifications, userId, COLLECTIONS.notificationMessages),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => notifFromFirestore(d.id, d.data()));
}

export async function markNotificationRead(userId: string, notifId: string): Promise<void> {
  const ref = doc(db, COLLECTIONS.notifications, userId, COLLECTIONS.notificationMessages, notifId);
  await updateDoc(ref, { read: true, readAt: new Date().toISOString(), updatedAt: serverTimestamp() });
}

// ── Broadcasts ──

export async function getAllBroadcasts(): Promise<BroadcastDocument[]> {
  const q = query(collection(db, COLLECTIONS.broadcasts), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => broadcastFromFirestore(d.id, d.data()));
}

export interface CreateBroadcastInput {
  title: string;
  body: string;
  targetCentreIds: string[] | 'ALL';
  targetRoles: string[] | null;
  sendWhatsApp: boolean;
  sendPush: boolean;
}

export async function createBroadcast(input: CreateBroadcastInput, userId: string): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.broadcasts), {
    ...input,
    sendEmail: false,
    fanoutComplete: false,
    fanoutCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  });
  return ref.id;
}
