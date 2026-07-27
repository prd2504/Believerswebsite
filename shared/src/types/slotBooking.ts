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
  /**
   * Which weekdays this participant will actually attend (0=Sun … 6=Sat).
   * Captured at booking time so a daily roster (who's on court on which day,
   * in which slot) can be built without phoning every parent. For plans where
   * the days are fixed (3-day, Games Day, Bundle) this is derived
   * automatically; only 2-day and 4-day present a choice.
   */
  selectedDays: number[];
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
  /**
   * ISO timestamp before which bookings are not accepted — lets a booking
   * window be announced ("opens 9:30 PM tonight") and unlock on its own,
   * with no one needing to flip a switch at the exact minute.
   *
   * null / absent = no scheduled gate, behave as before. `isOpen` stays the
   * master kill switch and is checked independently, so setting it false
   * closes bookings immediately regardless of this value.
   *
   * Note: evaluated against the visitor's device clock, so a badly-set phone
   * clock can be a few minutes out either way. Good enough for announcing a
   * window; it is not a security boundary.
   */
  openAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export const DEFAULT_SLOT_CONFIG: Omit<SlotBookingConfig, 'centreId' | 'updatedAt' | 'updatedBy'> = {
  weekdayCapacity: 9,
  saturdayCapacity: 15,
  isOpen: true,
  closedSlots: [],
  openAt: null,
};

/**
 * Whether bookings are currently accepted, given the config and "now".
 * Both the /fees flow and the standalone /book portal call this so they can
 * never disagree about whether the window is open.
 *
 * `isOpen: false` closes immediately regardless of openAt (master kill switch).
 * A missing or unparseable `openAt` means no scheduled gate — fails open, so a
 * typo can never lock everyone out.
 */
export function isBookingWindowOpen(
  config: { isOpen: boolean; openAt: string | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!config) return true;             // config not loaded yet — don't block
  if (!config.isOpen) return false;     // manual kill switch wins
  if (!config.openAt) return true;      // no scheduled gate
  const opens = new Date(config.openAt);
  if (isNaN(opens.getTime())) return true; // unparseable → treat as no gate
  return now.getTime() >= opens.getTime();
}

/**
 * Which weekdays a Ruia plan covers, and how many the participant chooses.
 * `fixed` plans have no choice to make (choices.length === pick) so the UI
 * derives them silently; the rest need a day picker.
 *
 * Day numbers follow JS convention: 0=Sun, 1=Mon … 6=Sat.
 * Mon/Wed/Fri run the full 6–9 AM band; Tue/Thu run only the 6–7 AM session.
 */
export interface SlotPlanDays {
  choices: number[];
  pick: number;
  fixed: boolean;
}

export function getSlotPlanDays(planType: SlotPlanType): SlotPlanDays {
  const spec: Record<string, { choices: number[]; pick: number }> = {
    // Tue & Thu now also run a 6–7 AM session, so a 2-day plan can be any mix
    // of Mon/Wed/Fri and Tue/Thu (e.g. both Tue+Thu, or one of each).
    [SlotPlanType.TWO_DAY]:         { choices: [1, 2, 3, 4, 5],    pick: 2 },
    [SlotPlanType.THREE_DAY]:       { choices: [1, 3, 5],          pick: 3 },
    [SlotPlanType.FOUR_DAY]:        { choices: [1, 2, 3, 4, 5],    pick: 4 },
    [SlotPlanType.GAMES_DAY]:       { choices: [6],                pick: 1 },
    [SlotPlanType.COMPLETE_BUNDLE]: { choices: [1, 3, 5, 6],       pick: 4 },
  };
  const s = spec[planType] ?? { choices: [], pick: 0 };
  return { ...s, fixed: s.choices.length === s.pick };
}

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
    description: 'Pick any 2 days — Mon/Wed/Fri, or Tue & Thu (6–7 AM)',
    amountPaise: 300_000,
    days: 'Any 2 of Mon–Fri',
    // Mon/Wed/Fri offer all 3 bands; Tue/Thu only run 6–7 AM (its own slot).
    timeSlots: ['06:00-07:00', '07:00-08:00', '08:00-09:00', TUE_THU_SLOT],
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
