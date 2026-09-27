import type { BaseDocument, IsoTimestamp, YearMonth } from './common.js';

export const FeedbackStatus = {
  SUBMITTED: 'SUBMITTED',
  REVIEWED: 'REVIEWED',
  ESCALATED: 'ESCALATED',
  RESOLVED: 'RESOLVED',
} as const;
export type FeedbackStatus = (typeof FeedbackStatus)[keyof typeof FeedbackStatus];

export interface ParentFeedbackDocument extends BaseDocument {
  id: string;
  studentId: string;
  centreId: string;
  batchId: string;
  yearMonth: YearMonth;

  parentName: string;
  parentPhone: string | null;

  overallSatisfaction: number;
  coachQuality: number;
  facilityRating: number;
  childProgressPerceived: number;
  npsScore: number;
  comment: string | null;

  status: FeedbackStatus;
  autoEscalated: boolean;
  source: 'GOOGLE_FORM' | 'MANUAL';

  reviewedBy: string | null;
  reviewNote: string | null;
  reviewedAt: IsoTimestamp | null;
}
