/**
 * Progress tracking — scores, coach notes, and AI-generated monthly reports.
 *
 * Storage layout:
 *   /progress/{studentId}/scores/{scoreId}    — one per scored session/week per skill set
 *   /progress/{studentId}/reports/{reportId}  — AI-generated monthly summary
 *
 * Skill fields are configurable per sport. The defaults live in /constants.ts so new
 * sports can be added without schema changes.
 */

import type { BaseDocument, IsoDate, IsoTimestamp, YearMonth } from './common.js';
import type { SportType } from './centre.js';

export const CoachRecommendation = {
  PROMOTE: 'PROMOTE',
  MAINTAIN: 'MAINTAIN',
  NEEDS_ATTENTION: 'NEEDS_ATTENTION',
} as const;
export type CoachRecommendation = (typeof CoachRecommendation)[keyof typeof CoachRecommendation];

/** Single skill rating on a 1–10 scale. */
export type SkillScore = number;

/**
 * Map of skill name → score. Keys come from `DEFAULT_SKILL_FIELDS[sport]` in constants.ts
 * but are stored as plain strings so custom skills can be added without a type change.
 */
export type SkillScoreMap = Record<string, SkillScore>;

/** One recorded progress assessment — usually one per session or one per week. */
export interface ProgressScoreDocument extends BaseDocument {
  id: string;

  studentId: string;
  batchId: string;
  coachId: string;
  sport: SportType;

  /** IST calendar date of the assessment. */
  assessedOn: IsoDate;

  /** Keyed by skill name, value 1–10. */
  scores: SkillScoreMap;

  /** Free-text coach note — what the student did well / needs to work on. */
  note: string | null;
}

/** AI-generated monthly progress report. */
export interface ProgressReportDocument extends BaseDocument {
  id: string;

  studentId: string;
  /** The month this report covers, e.g. "2026-04". */
  yearMonth: YearMonth;

  /**
   * Input snapshot — the exact numbers fed into Claude so reports are reproducible. We
   * store this alongside the output so coaches can audit how the report was generated.
   */
  inputSnapshot: {
    attendancePercent: number;
    averageScores: SkillScoreMap;
    sessionCount: number;
    coachNotes: string[];
  };

  /** The 2–3 paragraph personalised summary from Claude. */
  summaryText: string;

  /** Which model produced it — useful if we upgrade Claude versions later. */
  modelId: string;

  /** Whether this report has been delivered to the parent/student yet. */
  delivered: boolean;
  deliveredAt: string | null;

  /** Optional PDF if the admin generated one. */
  pdfPath: string | null;
}

/** Structured monthly assessment — one per student per month at /progress/{studentId}/assessments/{YYYY-MM}. */
export interface MonthlyAssessmentDocument extends BaseDocument {
  id: string;
  studentId: string;
  batchId: string;
  coachId: string;
  sport: SportType;
  yearMonth: YearMonth;

  scores: SkillScoreMap;
  recommendation: CoachRecommendation;

  strengths: string;
  areasForImprovement: string;
  coachComments: string;

  sharedWithParent: boolean;
  sharedAt: IsoTimestamp | null;
}
