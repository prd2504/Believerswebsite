/**
 * The User document — one per Firebase Auth uid. Lives at /users/{uid}.
 *
 * Note: Student *player* records live in /students/{studentId} — a student user's /users
 * document only tracks account-level fields (auth, role, centre scope). The link between
 * a STUDENT user and a student profile is the `linkedStudentIds` field; similarly a PARENT
 * user's children are the student ids in `linkedStudentIds`.
 */

import type { BaseDocument } from './common.js';
import type { UserRole } from './roles.js';

/** Notification channel preferences per user, per alert type. */
export interface NotificationPreferences {
  feeReminders: boolean;
  absenceAlerts: boolean;
  progressReports: boolean;
  scheduleChanges: boolean;
  tournamentUpdates: boolean;
  broadcasts: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  feeReminders: true,
  absenceAlerts: true,
  progressReports: true,
  scheduleChanges: true,
  tournamentUpdates: true,
  broadcasts: true,
};

/**
 * Lifecycle state for an account. Only relevant for COACH accounts today — other roles
 * are always ACTIVE. Existing docs without this field default to ACTIVE at read time.
 */
export const AccountStatus = {
  /** Account is fully operational. */
  ACTIVE: 'ACTIVE',
  /** Coach self-registered and is waiting for admin approval + centre assignment. */
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  /** Admin has suspended the account (e.g. coach left). */
  SUSPENDED: 'SUSPENDED',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export interface UserDocument extends BaseDocument {
  /** Firebase Auth uid — also the document id. */
  id: string;
  /** Exactly one role per user. Enforced by security rules. */
  role: UserRole;

  /** Display name — required for all roles. */
  name: string;
  /** Phone in E.164 format, always starting with +91 for India. */
  phone: string | null;
  /** Email — optional when phone auth is used, required when email/password auth is used. */
  email: string | null;
  /** Storage path (not public URL) to the profile photo. */
  photoPath: string | null;

  /**
   * Centre scope for CENTRE_MANAGER and COACH users. Empty array for SUPER_ADMIN (who has
   * implicit access to all centres) and for STUDENT / PARENT (whose scope is implicit from
   * their enrolled batches). Never null — always an array.
   */
  centreIds: string[];

  /**
   * Batch ids explicitly assigned to a COACH. Drives the coach's attendance and roster
   * views. Managed by the admin Coaches page — not by the coach themselves.
   */
  assignedBatchIds: string[];

  /**
   * For STUDENT and PARENT users: the list of student profile ids they represent. A STUDENT
   * user typically has exactly one (themselves). A PARENT user can have many children.
   */
  linkedStudentIds: string[];

  /** Per-user notification channel opt-ins. */
  notificationPreferences: NotificationPreferences;

  /** Whether the user has finished the role-specific onboarding flow. */
  onboardingComplete: boolean;

  /** Soft-delete / deactivation flag. Disabled users cannot log in. */
  disabled: boolean;

  /**
   * Account lifecycle state. Defaults to ACTIVE for all existing and new non-coach users.
   * COACH accounts created via self-registration start as PENDING_APPROVAL until an admin
   * approves them.
   */
  accountStatus: AccountStatus;
}

/** Shape of the profile fields a user can edit themselves (subset of UserDocument). */
export interface EditableUserProfile {
  name: string;
  phone: string | null;
  email: string | null;
  photoPath: string | null;
  notificationPreferences: NotificationPreferences;
}
