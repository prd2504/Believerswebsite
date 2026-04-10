/**
 * Tournaments. Top-level collection /tournaments/{tournamentId}.
 *
 * Registrations live in a subcollection /tournaments/{id}/registrations/{studentId}
 * so that a listener on the tournament document doesn't trigger on every new entry.
 */

import type { BaseDocument, IsoDate } from './common.js';
import type { SportType } from './centre.js';

export const TournamentStatus = {
  UPCOMING: 'UPCOMING',
  REGISTRATION_OPEN: 'REGISTRATION_OPEN',
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type TournamentStatus = (typeof TournamentStatus)[keyof typeof TournamentStatus];

/** A tournament category — age group × level. */
export interface TournamentCategory {
  id: string;
  name: string;
  /** e.g. "Under 12", "Open". Free text so admins can define new brackets. */
  ageGroup: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'OPEN';
  /** Optional cap on participants for this category. */
  maxParticipants: number | null;
}

export interface TournamentDocument extends BaseDocument {
  id: string;

  name: string;
  description: string;

  sport: SportType;

  /** Host centre. Tournaments may be BBA-hosted OR external events BBA students attend. */
  hostCentreId: string | null;

  /** Free-text venue for external tournaments. Overrides hostCentreId display. */
  venueName: string | null;
  venueAddress: string | null;

  /** Start date YYYY-MM-DD. Single-day events use same start and end. */
  startDate: IsoDate;
  endDate: IsoDate;

  /** Deadline for registrations. */
  registrationDeadline: IsoDate | null;

  categories: TournamentCategory[];

  status: TournamentStatus;

  /** Optional entry fee in paise. */
  entryFeePaise: number | null;

  /** Cover image in Storage. */
  coverImagePath: string | null;
}

/** A registration — one per student per tournament. */
export interface TournamentRegistration extends BaseDocument {
  /** Doc id = studentId. */
  id: string;
  tournamentId: string;
  studentId: string;
  categoryId: string;
  /** Who registered — admin, coach, or the student/parent themselves. */
  registeredBy: string;
  confirmed: boolean;
}

/** Final result entry — one per student post-tournament. */
export interface TournamentResult {
  studentId: string;
  categoryId: string;
  position: number | null;
  roundReached: string | null;
  notes: string | null;
}
