/**
 * Role definitions for the RBAC system.
 *
 * The five roles are exhaustive. A user has exactly one role. Never store raw strings —
 * always use the `UserRole` enum so that TypeScript catches typos at compile time AND
 * Firestore security rules can pattern-match the exact string values.
 */

export const UserRole = {
  /** The founder. Full read/write across every centre and every module. */
  SUPER_ADMIN: 'SUPER_ADMIN',
  /** Runs one or more specific centres. Full access within those centres only. */
  CENTRE_MANAGER: 'CENTRE_MANAGER',
  /** Teaches batches. Can mark attendance and update progress scores/notes. */
  COACH: 'COACH',
  /** A player. Views own schedule / attendance / progress / fees. */
  STUDENT: 'STUDENT',
  /** Guardian of one or more students. Views and pays on behalf of the child. */
  PARENT: 'PARENT',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/** Ordered list useful for role-pickers in admin invite flows. */
export const ALL_USER_ROLES: readonly UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.CENTRE_MANAGER,
  UserRole.COACH,
  UserRole.STUDENT,
  UserRole.PARENT,
];

/**
 * Roles that may access the admin-style (sidebar) interface. These two roles share the
 * same desktop shell but with different scoped data.
 */
export const ADMIN_LIKE_ROLES: readonly UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.CENTRE_MANAGER,
];

/** Roles that get the mobile-first bottom-nav shell. */
export const MOBILE_SHELL_ROLES: readonly UserRole[] = [
  UserRole.COACH,
  UserRole.STUDENT,
  UserRole.PARENT,
];

/**
 * Permission matrix — a minimal subset for Step 1. Each module will introduce more
 * fine-grained checks, but having the high-level "can access the module at all" list here
 * lets ProtectedRoute enforce a baseline from day one.
 */
export const CAN_ACCESS_MODULE = {
  centres: [UserRole.SUPER_ADMIN, UserRole.CENTRE_MANAGER],
  batches: [UserRole.SUPER_ADMIN, UserRole.CENTRE_MANAGER, UserRole.COACH],
  students: [UserRole.SUPER_ADMIN, UserRole.CENTRE_MANAGER, UserRole.COACH],
  attendance: [UserRole.SUPER_ADMIN, UserRole.CENTRE_MANAGER, UserRole.COACH],
  payments: [UserRole.SUPER_ADMIN, UserRole.CENTRE_MANAGER],
  progress: [UserRole.SUPER_ADMIN, UserRole.CENTRE_MANAGER, UserRole.COACH],
  sessionLogs: [UserRole.SUPER_ADMIN, UserRole.CENTRE_MANAGER, UserRole.COACH],
  parentFeedback: [UserRole.SUPER_ADMIN, UserRole.CENTRE_MANAGER],
  financials: [UserRole.SUPER_ADMIN, UserRole.CENTRE_MANAGER],
  issues: [UserRole.SUPER_ADMIN, UserRole.CENTRE_MANAGER, UserRole.COACH],
  notifications: [UserRole.SUPER_ADMIN, UserRole.CENTRE_MANAGER],
} as const satisfies Record<string, readonly UserRole[]>;

export type ModuleKey = keyof typeof CAN_ACCESS_MODULE;

/**
 * Pure helper — no runtime dependencies. Returns true if `role` may access `module`.
 * Deliberately lives in /shared so both frontend routing and backend Cloud Functions
 * can apply the identical rule.
 */
export function canAccessModule(role: UserRole | null | undefined, module: ModuleKey): boolean {
  if (!role) return false;
  return (CAN_ACCESS_MODULE[module] as readonly UserRole[]).includes(role);
}
