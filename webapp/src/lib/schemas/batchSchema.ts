/**
 * Zod schemas for Batch forms. Used by react-hook-form for client-side validation.
 */

import { z } from 'zod';

const timeSlotSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
});

export const batchFormSchema = z.object({
  centreId: z.string().min(1, 'Select a centre'),
  name: z.string().min(2, 'Batch name must be at least 2 characters').max(100),
  description: z.string().max(500).optional().default(''),
  sport: z.string().min(1, 'Select a sport'),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  schedule: z.array(timeSlotSchema).min(1, 'Add at least one time slot'),
  maxCapacity: z.number().min(1, 'Minimum capacity is 1').max(100),
  monthlyFeeRupees: z.number().min(0, 'Fee cannot be negative'),
  coachIds: z.array(z.string()),
  status: z.enum(['ACTIVE', 'PAUSED', 'INACTIVE']),
});

export type BatchFormValues = z.infer<typeof batchFormSchema>;

export function defaultBatchFormValues(centreId?: string): BatchFormValues {
  return {
    centreId: centreId ?? '',
    name: '',
    description: '',
    sport: 'BADMINTON',
    level: 'BEGINNER',
    schedule: [{ dayOfWeek: 1, startTime: '06:00', endTime: '07:00' }],
    maxCapacity: 20,
    monthlyFeeRupees: 2000,
    coachIds: [],
    status: 'ACTIVE',
  };
}
