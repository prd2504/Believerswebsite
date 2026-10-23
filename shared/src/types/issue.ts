import type { BaseDocument, IsoDate, IsoTimestamp } from './common.js';

export const IssueType = {
  COACH: 'COACH',
  FACILITY: 'FACILITY',
  FINANCE: 'FINANCE',
  PARENT: 'PARENT',
  OTHER: 'OTHER',
} as const;
export type IssueType = (typeof IssueType)[keyof typeof IssueType];

export const IssueStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  ESCALATED: 'ESCALATED',
} as const;
export type IssueStatus = (typeof IssueStatus)[keyof typeof IssueStatus];

export const IssuePriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type IssuePriority = (typeof IssuePriority)[keyof typeof IssuePriority];

export interface IssueDocument extends BaseDocument {
  id: string;
  centreId: string;
  type: IssueType;
  priority: IssuePriority;
  status: IssueStatus;
  title: string;
  description: string;
  raisedBy: string;
  assignedTo: string | null;
  dueDate: IsoDate | null;
  resolutionNote: string | null;
  resolvedAt: IsoTimestamp | null;
  resolvedBy: string | null;
}

export interface IssueCommentDocument extends BaseDocument {
  id: string;
  issueId: string;
  authorId: string;
  text: string;
}
