/**
 * Zod schema for tournament forms.
 */

import { z } from 'zod';

const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Category name required'),
  ageGroup: z.string().min(1, 'Age group required'),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'OPEN']),
  maxParticipants: z.number().nullable(),
});

export const tournamentFormSchema = z.object({
  name: z.string().min(2, 'Tournament name required'),
  description: z.string().default(''),
  sport: z.enum(['BADMINTON', 'TENNIS', 'CRICKET', 'FOOTBALL', 'PICKLEBALL', 'TABLE_TENNIS']),
  hostCentreId: z.string().nullable().optional(),
  venueName: z.string().nullable().optional(),
  venueAddress: z.string().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  registrationDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().or(z.literal('')),
  categories: z.array(categorySchema).min(1, 'At least one category required'),
  status: z.enum(['UPCOMING', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  entryFeeRupees: z.number().nullable().optional(),
});

export type TournamentFormValues = z.infer<typeof tournamentFormSchema>;

let _catCounter = 0;
function newCatId() { return `cat-${++_catCounter}-${Date.now()}`; }

export function defaultTournamentFormValues(): TournamentFormValues {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: '',
    description: '',
    sport: 'BADMINTON',
    hostCentreId: null,
    venueName: '',
    venueAddress: '',
    startDate: today,
    endDate: today,
    registrationDeadline: '',
    categories: [{ id: newCatId(), name: 'Open Singles', ageGroup: 'Open', level: 'OPEN', maxParticipants: null }],
    status: 'UPCOMING',
    entryFeeRupees: null,
  };
}
