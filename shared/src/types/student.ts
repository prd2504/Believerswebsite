/**
 * Student — a player profile. Lives at /students/{studentId}.
 *
 * A student profile is separate from the User account: adults have a 1:1 mapping
 * (student ↔ user) whereas juniors may have only a Parent user account with the student
 * profile existing on its own. This separation means a parent can manage multiple
 * children cleanly.
 */

import type { BaseDocument, IsoDate } from './common.js';
import type { BatchLevel } from './batch.js';

export const StudentStatus = {
  /** Actively attending — the default state. */
  ACTIVE: 'ACTIVE',
  /** Temporarily paused (injury, travel, etc.). Fees usually waived. */
  ON_HOLD: 'ON_HOLD',
  /** Successfully completed their programme / graduated out. */
  GRADUATED: 'GRADUATED',
  /** Left the academy (voluntary or involuntary). */
  LEFT: 'LEFT',
} as const;
export type StudentStatus = (typeof StudentStatus)[keyof typeof StudentStatus];

export const BloodGroup = {
  A_POS: 'A+',
  A_NEG: 'A-',
  B_POS: 'B+',
  B_NEG: 'B-',
  AB_POS: 'AB+',
  AB_NEG: 'AB-',
  O_POS: 'O+',
  O_NEG: 'O-',
  UNKNOWN: 'UNKNOWN',
} as const;
export type BloodGroup = (typeof BloodGroup)[keyof typeof BloodGroup];

/** Emergency contact — always required, may or may not equal the guardian. */
export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface StudentDocument extends BaseDocument {
  id: string;

  /** Full name as printed on receipts. */
  name: string;

  /** Date of birth, YYYY-MM-DD. Age is derived at read time, never stored denormalised. */
  dateOfBirth: IsoDate;

  /** Gender — free string to be inclusive; UI offers common options. */
  gender: 'M' | 'F' | 'OTHER' | 'UNDISCLOSED';

  /** Storage path (not public URL) to the photo. */
  photoPath: string | null;

  /** Primary guardian name — for juniors; same as student name for adults. */
  guardianName: string;
  /** Guardian user id — links to /users/{uid} where role=PARENT. Null for adult students. */
  guardianUserId: string | null;

  /** Contact details. At least one of phone/email must be present. */
  phone: string | null;
  email: string | null;

  address: string;
  city: string;
  pincode: string;

  bloodGroup: BloodGroup;
  emergencyContact: EmergencyContact;

  /** Centre the student is primarily attached to. Batches may span — see `batchIds`. */
  primaryCentreId: string;

  /** All batches this student is currently enrolled in. */
  batchIds: string[];

  /** Self-reported / coach-assessed level — used when searching / filtering. */
  level: BatchLevel;

  status: StudentStatus;

  /**
   * Date the student joined the academy. YYYY-MM-DD. Used for seniority and
   * graduation-status displays.
   */
  joinedDate: IsoDate;

  /** Any medical notes relevant for coaching (asthma, allergies, etc.). Free text. */
  medicalNotes: string | null;
}
