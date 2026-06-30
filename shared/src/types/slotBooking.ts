import type { YearMonth } from './common.js';

export const SlotBookingStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;
export type SlotBookingStatus = (typeof SlotBookingStatus)[keyof typeof SlotBookingStatus];

export const SlotPlanType = {
  TWO_DAY: 'TWO_DAY',
  THREE_DAY: 'THREE_DAY',
  FOUR_DAY: 'FOUR_DAY',
  GAMES_DAY: 'GAMES_DAY',
  COMPLETE_BUNDLE: 'COMPLETE_BUNDLE',
} as const;
export type SlotPlanType = (typeof SlotPlanType)[keyof typeof SlotPlanType];

/**
 * Tue & Thu run only the 6–7 AM session, tracked as its own bookable slot with
 * its own capacity (distinct from the Mon/Wed/Fri 6–7 AM band).
 */
export const TUE_THU_SLOT = '06:00-07:00-tt';
export function isTueThuSlot(slot: string): boolean {
  return slot === TUE_THU_SLOT;
}

export interface SlotBookingDocument {
  id: string;
  centreId: string;
  month: YearMonth;

  participantName: string;
  participantPhone: string;
  participantEmail: string | null;

  planType: SlotPlanType;
  timeSlot: string;
  amountPaise: number;

  status: SlotBookingStatus;
  upiTransactionId: string | null;

  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface SlotBookingConfig {
  centreId: string;
  weekdayCapacity: number;
  saturdayCapacity: number;
  isOpen: boolean;
  closedSlots: string[];
  updatedAt: string;
  updatedBy: string | null;
}

export const DEFAULT_SLOT_CONFIG: Omit<SlotBookingConfig, 'centreId' | 'updatedAt' | 'updatedBy'> = {
  weekdayCapacity: 9,
  saturdayCapacity: 15,
  isOpen: true,
  closedSlots: [],
};

export interface SlotPlanConfig {
  planType: SlotPlanType;
  label: string;
  description: string;
  amountPaise: number;
  days: string;
  timeSlots: string[];
  includesWeekday: boolean;
  includesSaturday: boolean;
}

export const SLOT_PLANS: SlotPlanConfig[] = [
  {
    planType: SlotPlanType.TWO_DAY,
    label: '2 Days / Week',
    description: 'Pick any 2 days from Mon, Wed, Fri',
    amountPaise: 300_000,
    days: 'Mon, Wed, Fri (any 2)',
    timeSlots: ['06:00-07:00', '07:00-08:00', '08:00-09:00'],
    includesWeekday: true,
    includesSaturday: false,
  },
  {
    planType: SlotPlanType.THREE_DAY,
    label: '3 Days / Week',
    description: 'Mon, Wed & Fri sessions',
    amountPaise: 400_000,
    days: 'Mon, Wed, Fri',
    timeSlots: ['06:00-07:00', '07:00-08:00', '08:00-09:00'],
    includesWeekday: true,
    includesSaturday: false,
  },
  {
    planType: SlotPlanType.FOUR_DAY,
    label: '4 Days / Week',
    description: 'Any 4 mornings, Mon–Fri',
    amountPaise: 450_000,
    days: 'Any 4 of Mon–Fri',
    // Mon/Wed/Fri run 6–9 AM; Tue/Thu run only 6–7 AM (its own slot).
    timeSlots: ['06:00-07:00', '07:00-08:00', '08:00-09:00', TUE_THU_SLOT],
    includesWeekday: true,
    includesSaturday: false,
  },
  {
    planType: SlotPlanType.GAMES_DAY,
    label: 'Games Day (Saturday)',
    description: 'Saturday games & match practice',
    amountPaise: 150_000,
    days: 'Saturday',
    timeSlots: ['07:00-09:00'],
    includesWeekday: false,
    includesSaturday: true,
  },
  {
    planType: SlotPlanType.COMPLETE_BUNDLE,
    label: 'Complete Bundle',
    description: 'Mon, Wed, Fri + Saturday Games Day',
    amountPaise: 550_000,
    days: 'Mon, Wed, Fri + Saturday',
    timeSlots: ['06:00-07:00', '07:00-08:00', '08:00-09:00'],
    includesWeekday: true,
    includesSaturday: true,
  },
];
