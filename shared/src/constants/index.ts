/**
 * Shared constants — values used by both frontend and backend. Anything that changes with
 * business rules (default skill fields, attendance thresholds, fee grace periods) lives
 * here so there is a single source of truth.
 */

import { SportType } from '../types/centre.js';

/** Company / brand metadata — safe to import from any component. */
export const COMPANY = {
  legalName: 'BBA Sports Private Limited',
  brandName: 'BBA Sports Academy',
  brandShortName: 'BBA',
  supportEmail: 'hello@bbashuttle.com',
  defaultLocale: 'en-IN',
  defaultTimezone: 'Asia/Kolkata',
  defaultCurrency: 'INR' as const,
  defaultCountryCode: '+91',
} as const;

/**
 * Ruia College identifiers, in one place because they previously weren't:
 * the centre code and the slot-booking namespace id were each hardcoded
 * separately in three different files and drifted at least once already
 * (two different UPI IDs shown depending on which page a parent opened).
 *
 * RUIA_CENTRE_CODE matches `centres.{id}.centreCode` — the real centre
 * document used everywhere else (payments, batches, enrollments).
 *
 * RUIA_SLOT_BOOKING_CENTRE_ID is the `centreId` value stored on every
 * `slotBookings` document. It is NOT a real centre document id — it's a
 * fixed namespace string chosen when the slot-booking flow was built,
 * decoupled from the centre doc on purpose so the booking flow didn't need
 * a live centre lookup. The two must be bridged explicitly (via
 * centreCode) wherever code needs to go from "the real Ruia centre" to
 * "Ruia's slot bookings", or vice versa.
 */
export const RUIA_CENTRE_CODE = 'RUI';
export const RUIA_SLOT_BOOKING_CENTRE_ID = 'ruia-college';

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
  /** GST not charged — BBA Sports has no GST compliance yet. Fees are billed as-is. */
  defaultGstRatePercent: 0,
  /** Receipt number prefix. */
  receiptNumberPrefix: 'BBA',
} as const;

/** Payroll business rules. */
export const PAYROLL = {
  ptSurchargeMonth: 2,
  section194JTdsRatePercent: 10,
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
  paymentMonthlySummaries: 'paymentMonthlySummaries',
  progress: 'progress',
  progressScores: 'scores',
  progressReports: 'reports',
  parentFeedback: 'parentFeedback',
  centreExpenses: 'centreExpenses',
  recurringExpenses: 'recurringExpenses',
  partnerPayouts: 'partnerPayouts',
  issues: 'issues',
  issueComments: 'comments',
  assessments: 'assessments',
  notifications: 'notifications',
  notificationMessages: 'messages',
  broadcasts: 'broadcasts',
  slotBookings: 'slotBookings',
  slotBookingConfig: 'slotBookingConfig',
  staff: 'staff',
  payrollRuns: 'payrollRuns',
  feeAttendanceReports: 'feeAttendanceReports',
  counters: 'counters',
} as const;
