import { z } from 'zod';

export const studentFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().min(10, 'Enter a valid mobile number'),
  email: z.string().email('Invalid email').or(z.literal('')),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  primaryCentreId: z.string().min(1, 'Select a centre'),
});

export type StudentFormValues = z.infer<typeof studentFormSchema>;

export function defaultStudentFormValues(centreId?: string): StudentFormValues {
  return {
    name: '',
    phone: '',
    email: '',
    level: 'BEGINNER',
    primaryCentreId: centreId ?? '',
  };
}
