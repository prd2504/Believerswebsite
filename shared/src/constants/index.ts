/**
 * Shared constants — values used by both frontend and backend. Anything that changes with
 * business rules (default skill fields, attendance thresholds, fee grace periods) lives
 * here so there is a single source of truth.
 */

import { SportType } from '../types/centre.js';

/** Company / brand metadata — safe to import from any component. */
export const COMPANY = {
  legalName: 'BBA Sports Private Limited',
  brandName: 'Believers Badminton Academy',
  brandShortName: 'BBA',
  supportEmail: 'support@bbasports.in',
  defaultLocale: 'en-IN',
  defaultTimezone: 'Asia/Kolkata',
  defaultCurrency: 'INR' as const,
  defaultCountryCode: '+91',
} as const;

/** Brand colours — mirrored in Tailwind theme config in webapp/tailwind.config.js. */
export const BRAND_COLORS = {
  primary: '#E8593C',
  secondary: '#1A1A2E',
  background: '#FFFFFF',
  surface: '#F5F5F5',
} as const;

/**
 * Default skill fields per sport — used as the initial rubric when a new student is
 * assessed. Admins can customise these per centre/batch later but these are the defaults.
 */
export const DEFAULT_SKILL_FIELDS: Record<SportType, readonly string[]> = {
  [SportType.BADMINTON]: [
    'Footwork',
    'Smash',
    'Drop',
    'Clear',
    'Net Play',
    'Serve',
    'Rally Consistency',
  ],
  [SportType.TENNIS]: ['Forehand', 'Backhand', 'Serve', 'Volley', 'Footwork', 'Stamina'],
  [SportType.CRICKET]: ['Batting', 'Bowling', 'Fielding', 'Running', 'Strategy'],
  [SportType.FOOTBALL]: ['Dribbling', 'Passing', 'Shooting', 'Defending', 'Stamina', 'Positioning'],
  [SportType.PICKLEBALL]: ['Dinks', 'Drives', 'Serve', 'Volley', 'Footwork'],
  [SportType.TABLE_TENNIS]: ['Forehand', 'Backhand', 'Serve', 'Spin', 'Footwork'],
};

/** Skill score bounds — 1..10 inclusive. Enforced at write time. */
export const SKILL_SCORE_MIN = 1;
export const SKILL_SCORE_MAX = 10;

/** Attendance business rules. */
export const ATTENDANCE = {
  /** Minimum % to be considered "on track" for the month. */
  minMonthlyAttendancePercent: 75,
  /** Consecutive missed sessions that trigger an auto-alert. */
  consecutiveMissedAlertThreshold: 3,
  /** Coach self-edit window in hours after the session. */
  coachEditWindowHours: 24,
} as const;

/** Coach session log business rules. */
export const SESSION_LOG = {
  lateThresholdMinutes: 10,
  selfRatingMin: 1,
  selfRatingMax: 5,
} as const;

/** Payment / fee business rules. */
export const PAYMENT = {
  /** Days before due date when a friendly reminder is sent. */
  reminderDaysBeforeDue: 3,
  /** Days after due date when a status becomes OVERDUE. */
  gracePeriodDays: 0,
  /** Days after due date when a firm overdue reminder is sent. */
  overdueReminderDaysAfterDue: 3,
  /** Default GST rate for coaching services in India (can be overridden per centre). */
  defaultGstRatePercent: 18,
  /** Receipt number prefix. */
  receiptNumberPrefix: 'BBA',
} as const;

/** Path segments — stored as constants so typos are caught at compile time. */
export const COLLECTIONS = {
  users: 'users',
  centres: 'centres',
  batches: 'batches',
  enrollments: 'enrollments',
  students: 'students',
  attendance: 'attendance',
  sessions: 'sessions',
  records: 'records',
  payments: 'payments',
  progress: 'progress',
  progressScores: 'scores',
  progressReports: 'reports',
  parentFeedback: 'parentFeedback',
  centreExpenses: 'centreExpenses',
  partnerPayouts: 'partnerPayouts',
  issues: 'issues',
  issueComments: 'comments',
  assessments: 'assessments',
  notifications: 'notifications',
  notificationMessages: 'messages',
  broadcasts: 'broadcasts',
} as const;
