/**
 * Zod schema for Student forms. Mirrors the StudentDocument type from @bba/shared.
 */

import { z } from 'zod';

const emergencyContactSchema = z.object({
  name: z.string().min(1, 'Emergency contact name is required'),
  relationship: z.string().min(1, 'Relationship is required'),
  phone: z.string().min(10, 'Enter a valid phone number'),
});

export const studentFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  gender: z.enum(['M', 'F', 'OTHER', 'UNDISCLOSED']),
  guardianName: z.string().min(2, 'Guardian name is required'),
  guardianUserId: z.string().nullable().optional(),
  phone: z.string().min(10, 'Enter a valid phone number').nullable().or(z.literal('')),
  email: z.string().email('Invalid email').nullable().or(z.literal('')),
  address: z.string().min(5, 'Address is required'),
  city: z.string().min(2, 'City is required'),
  pincode: z.string().regex(/^\d{6}$/, 'Must be a 6-digit pincode'),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN']),
  emergencyContact: emergencyContactSchema,
  primaryCentreId: z.string().min(1, 'Select a centre'),
  batchIds: z.array(z.string()),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  status: z.enum(['ACTIVE', 'ON_HOLD', 'GRADUATED', 'LEFT']),
  joinedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  medicalNotes: z.string().nullable().or(z.literal('')),
});

export type StudentFormValues = z.infer<typeof studentFormSchema>;

/** Today in YYYY-MM-DD for default joinedDate. */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function defaultStudentFormValues(centreId?: string): StudentFormValues {
  return {
    name: '',
    dateOfBirth: '2015-01-01',
    gender: 'UNDISCLOSED',
    guardianName: '',
    guardianUserId: null,
    phone: '',
    email: '',
    address: '',
    city: 'Mumbai',
    pincode: '',
    bloodGroup: 'UNKNOWN',
    emergencyContact: { name: '', relationship: '', phone: '' },
    primaryCentreId: centreId ?? '',
    batchIds: [],
    level: 'BEGINNER',
    status: 'ACTIVE',
    joinedDate: todayStr(),
    medicalNotes: '',
  };
}
