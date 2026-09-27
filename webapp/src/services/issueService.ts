/**
 * Issue Tracker service — Firestore operations for issues and their comments.
 *
 * Collections:
 *   /issues/{issueId}                         — top-level issue documents
 *   /issues/{issueId}/comments/{commentId}    — threaded discussion per issue
 *
 * Issues flow through: OPEN -> IN_PROGRESS -> RESOLVED | ESCALATED
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  IssueDocument,
  IssueCommentDocument,
  IssueStatus,
  IssueType,
  IssuePriority,
} from '@bba/shared';

// ── Path helpers ──

const issuesCol = collection(db, 'issues');

function issueRef(issueId: string) {
  return doc(db, 'issues', issueId);
}

function commentsCol(issueId: string) {
  return collection(db, 'issues', issueId, 'comments');
}

// ── Converters ──

function toIso(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts) {
    return (ts as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

function issueFromFirestore(id: string, data: DocumentData): IssueDocument {
  return {
    id,
    centreId: data.centreId ?? '',
    type: (data.type ?? 'OTHER') as IssueType,
    priority: (data.priority ?? 'MEDIUM') as IssuePriority,
    status: (data.status ?? 'OPEN') as IssueStatus,
    title: data.title ?? '',
    description: data.description ?? '',
    raisedBy: data.raisedBy ?? '',
    assignedTo: data.assignedTo ?? null,
    dueDate: data.dueDate ?? null,
    resolutionNote: data.resolutionNote ?? null,
    resolvedAt: data.resolvedAt ? toIso(data.resolvedAt) : null,
    resolvedBy: data.resolvedBy ?? null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

function commentFromFirestore(id: string, data: DocumentData): IssueCommentDocument {
  return {
    id,
    issueId: data.issueId ?? '',
    authorId: data.authorId ?? '',
    text: data.text ?? '',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

// ── Issue CRUD ──

/** Create a new issue. Status defaults to OPEN and raisedBy is set to the current user. */
export async function createIssue(
  data: {
    centreId: string;
    type: IssueType;
    priority: IssuePriority;
    title: string;
    description: string;
    assignedTo?: string;
    dueDate?: string;
  },
  userId: string,
): Promise<IssueDocument> {
  const payload: Record<string, unknown> = {
    centreId: data.centreId,
    type: data.type,
    priority: data.priority,
    status: 'OPEN' satisfies IssueStatus,
    title: data.title,
    description: data.description,
    raisedBy: userId,
    assignedTo: data.assignedTo ?? null,
    dueDate: data.dueDate ?? null,
    resolutionNote: null,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  };

  const docRef = await addDoc(issuesCol, payload);
  const now = new Date().toISOString();
  return issueFromFirestore(docRef.id, {
    ...payload,
    createdAt: now,
    updatedAt: now,
  });
}

/** Update an existing issue. */
export async function updateIssue(
  issueId: string,
  data: Partial<{
    centreId: string;
    type: IssueType;
    priority: IssuePriority;
    status: IssueStatus;
    title: string;
    description: string;
    assignedTo: string | null;
    dueDate: string | null;
  }>,
  userId: string,
): Promise<void> {
  const ref = issueRef(issueId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/** Delete an issue. */
export async function deleteIssue(issueId: string): Promise<void> {
  await deleteDoc(issueRef(issueId));
}

/**
 * Get all issues with optional filters. Supports filtering by centreId, type,
 * status, and assignedTo. Results are ordered by createdAt descending.
 */
export async function getAllIssues(
  filters?: {
    centreId?: string;
    type?: IssueType;
    status?: IssueStatus;
    assignedTo?: string;
  },
): Promise<IssueDocument[]> {
  const constraints = [
    ...(filters?.centreId ? [where('centreId', '==', filters.centreId)] : []),
    ...(filters?.type ? [where('type', '==', filters.type)] : []),
    ...(filters?.status ? [where('status', '==', filters.status)] : []),
    ...(filters?.assignedTo ? [where('assignedTo', '==', filters.assignedTo)] : []),
    orderBy('createdAt', 'desc'),
  ];
  const q = query(issuesCol, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => issueFromFirestore(d.id, d.data()));
}

/** Get all issues for a specific centre. */
export async function getIssuesByCentre(centreId: string): Promise<IssueDocument[]> {
  const q = query(issuesCol, where('centreId', '==', centreId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => issueFromFirestore(d.id, d.data()));
}

/** Get all issues assigned to a specific user. */
export async function getIssuesByAssignee(userId: string): Promise<IssueDocument[]> {
  const q = query(issuesCol, where('assignedTo', '==', userId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => issueFromFirestore(d.id, d.data()));
}

/** Resolve an issue with a resolution note. */
export async function resolveIssue(
  issueId: string,
  resolutionNote: string,
  userId: string,
): Promise<void> {
  const ref = issueRef(issueId);
  await updateDoc(ref, {
    status: 'RESOLVED' satisfies IssueStatus,
    resolutionNote,
    resolvedAt: new Date().toISOString(),
    resolvedBy: userId,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/** Escalate an issue. */
export async function escalateIssue(
  issueId: string,
  userId: string,
): Promise<void> {
  const ref = issueRef(issueId);
  await updateDoc(ref, {
    status: 'ESCALATED' satisfies IssueStatus,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

// ── Comments ──

/** Add a comment to an issue's comment thread. */
export async function addComment(
  issueId: string,
  text: string,
  userId: string,
): Promise<IssueCommentDocument> {
  const col = commentsCol(issueId);
  const payload: Record<string, unknown> = {
    issueId,
    authorId: userId,
    text,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  };

  const docRef = await addDoc(col, payload);
  const now = new Date().toISOString();
  return commentFromFirestore(docRef.id, {
    ...payload,
    createdAt: now,
    updatedAt: now,
  });
}

/** Get all comments for an issue, ordered chronologically (oldest first). */
export async function getComments(issueId: string): Promise<IssueCommentDocument[]> {
  const q = query(commentsCol(issueId), orderBy('createdAt', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => commentFromFirestore(d.id, d.data()));
}
