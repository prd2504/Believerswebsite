/**
 * Zod schemas for Batch forms. Used by react-hook-form for client-side validation.
 *
 * The new model: a batch is a (Centre + TimeSlot) container. Days the batch runs
 * are listed in offeredDays; pricing tiers (2/3/4/5 days/week) live in frequencyPlans.
 * Per-student day choices live on the EnrollmentDocument, NOT here.
 */

import { z } from 'zod';

const dayOfWeekSchema = z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3),
  z.literal(4), z.literal(5), z.literal(6),
]);

const frequencyPlanSchema = z.object({
  daysPerWeek: z.number().int().min(1, 'At least 1 day').max(7, 'Max 7 days'),
  monthlyFeeRupees: z.number().min(0, 'Fee cannot be negative'),
});

export const batchFormSchema = z.object({
  centreId: z.string().min(1, 'Select a centre'),
  name: z.string().min(2, 'Batch name must be at least 2 characters').max(100),
  description: z.string().max(500).optional().default(''),
  sport: z.string().min(1, 'Select a sport'),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),

  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),

  offeredDays: z.array(dayOfWeekSchema).min(1, 'Select at least one day'),
  frequencyPlans: z
    .array(frequencyPlanSchema)
    .min(1, 'Add at least one pricing plan')
    .refine(
      (plans) => new Set(plans.map((p) => p.daysPerWeek)).size === plans.length,
      { message: 'Duplicate daysPerWeek across plans' },
    ),

  maxCapacity: z.number().int().min(1, 'Minimum capacity is 1').max(500),
  coachIds: z.array(z.string()),
  status: z.enum(['ACTIVE', 'PAUSED', 'INACTIVE']),
}).refine(
  (data) => data.frequencyPlans.every((p) => p.daysPerWeek <= data.offeredDays.length),
  { message: 'A plan cannot require more days than the batch offers', path: ['frequencyPlans'] },
);

export type BatchFormValues = z.infer<typeof batchFormSchema>;

export function defaultBatchFormValues(centreId?: string): BatchFormValues {
  return {
    centreId: centreId ?? '',
    name: '',
    description: '',
    sport: 'BADMINTON',
    level: 'BEGINNER',
    startTime: '16:00',
    endTime: '17:00',
    offeredDays: [1, 2, 3, 4, 5],
    frequencyPlans: [
      { daysPerWeek: 2, monthlyFeeRupees: 2000 },
      { daysPerWeek: 3, monthlyFeeRupees: 2800 },
      { daysPerWeek: 4, monthlyFeeRupees: 3500 },
      { daysPerWeek: 5, monthlyFeeRupees: 4000 },
    ],
    maxCapacity: 30,
    coachIds: [],
    status: 'ACTIVE',
  };
}
