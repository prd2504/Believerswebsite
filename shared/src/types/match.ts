/**
 * Tournament match types — used for the live scoring system.
 * Separate from the general TournamentDocument which tracks registration/metadata.
 */

export type MatchSport = 'BADMINTON' | 'TABLE_TENNIS' | 'PICKLEBALL' | 'CARROM';
export type MatchCategory = 'SINGLES' | 'OPEN_DOUBLES' | 'MIXED_DOUBLES' | 'CARROM_DOUBLES';
export type MatchRound =
  | 'QUALIFIER'
  | 'PLACEMENT_56'
  | 'PLACEMENT_78'
  | 'QF'
  | 'SF'
  | 'FINAL';
export type MatchStatus = 'UPCOMING' | 'LIVE' | 'COMPLETED' | 'WALKOVER';
export type MatchSide = 'A' | 'B';

export interface GameScore {
  a: number;
  b: number;
}

export interface TournamentMatch {
  id: string;

  sport: MatchSport;
  category: MatchCategory;
  round: MatchRound;
  matchNumber: number;

  /** ISO UTC timestamp. Stored in UTC, displayed in IST. */
  scheduledAt: string;

  /** Side A — 1 name for singles, 2 for doubles. Null slots for bracket matches. */
  playerANames: string[];
  /** Side B */
  playerBNames: string[];

  /** Game-by-game scores. Empty until the match starts. */
  scores: GameScore[];

  status: MatchStatus;
  /** Which side won. Null until completed. */
  winner: MatchSide | null;

  /** Bracket wiring — which match the winner advances to. */
  nextMatchId: string | null;
  nextMatchSlot: MatchSide | null;

  notes: string | null;
  /** Incremented on every write; used for optimistic concurrency control. */
  version: number;

  createdAt: string;
  updatedAt: string;
}

export const MATCH_SPORT_LABEL: Record<MatchSport, string> = {
  BADMINTON: 'Badminton',
  TABLE_TENNIS: 'Table Tennis',
  PICKLEBALL: 'Pickleball',
  CARROM: 'Carrom',
};

export const MATCH_CATEGORY_LABEL: Record<MatchCategory, string> = {
  SINGLES: 'Singles',
  OPEN_DOUBLES: 'Open Doubles',
  MIXED_DOUBLES: 'Mixed Doubles',
  CARROM_DOUBLES: 'Carrom Doubles',
};

export const MATCH_ROUND_LABEL: Record<MatchRound, string> = {
  QUALIFIER: 'Qualifier',
  PLACEMENT_56: '5th/6th Place',
  PLACEMENT_78: '7th/8th Place',
  QF: 'Quarter Final',
  SF: 'Semi Final',
  FINAL: 'Final',
};

export const MATCH_SPORT_COLOR: Record<MatchSport, string> = {
  BADMINTON: 'bg-blue-100 text-blue-700',
  TABLE_TENNIS: 'bg-green-100 text-green-700',
  PICKLEBALL: 'bg-yellow-100 text-yellow-700',
  CARROM: 'bg-purple-100 text-purple-700',
};
