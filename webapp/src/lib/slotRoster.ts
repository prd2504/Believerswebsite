/**
 * Shared "who's coming which day" grouping for Ruia's slot-booking flow.
 *
 * Used by both the Slot Bookings admin roster and the main Daily Roster page,
 * so the two can never disagree about which bookings count or how a slot is
 * labelled — they were duplicated once already and that's exactly how the two
 * pages would quietly drift out of sync.
 */

import { SlotBookingStatus, isTueThuSlot, type SlotBookingDocument } from '@bba/shared';

/** Paid-or-confirmed — a booking still awaiting payment hasn't committed to a day yet. */
export const ROSTER_STATUSES: ReadonlySet<string> = new Set([
  SlotBookingStatus.CONFIRMED,
  SlotBookingStatus.PENDING_VERIFICATION,
]);

/**
 * Human label for a booking's slot on a specific weekday (0=Sun…6=Sat).
 *
 * Tue/Thu only ever run 6–7 AM regardless of which band string the booking's
 * `timeSlot` happens to carry — a 2-day plan may have picked an MWF band as
 * its primary slot while still attending Tue/Thu on the days that overlap.
 */
export function slotLabelForDay(day: number, timeSlot: string): string {
  if (day === 6) return 'Games Day · 7–9 AM';
  if (day === 2 || day === 4 || isTueThuSlot(timeSlot)) return '6–7 AM';
  switch (timeSlot) {
    case '06:00-07:00': return '6–7 AM';
    case '07:00-08:00': return '7–8 AM';
    case '08:00-09:00': return '8–9 AM';
    default: return timeSlot;
  }
}

export interface RosterSlotGroup {
  label: string;
  bookings: SlotBookingDocument[];
}

export interface DayRoster {
  groups: RosterSlotGroup[];
  total: number;
  /** Paid/confirmed bookings with no captured day preference — pre-day-capture
   *  records, or a booking that otherwise slipped through without one. Kept
   *  visible here rather than silently absent from every day's roster. */
  unassigned: SlotBookingDocument[];
}

/** Build the roster for one weekday from a month's worth of bookings. */
export function buildDayRoster(bookings: SlotBookingDocument[], day: number): DayRoster {
  const eligible = bookings.filter((b) => ROSTER_STATUSES.has(b.status));
  const unassigned = eligible.filter((b) => !b.selectedDays || b.selectedDays.length === 0);
  const forDay = eligible.filter((b) => b.selectedDays?.includes(day));

  const map = new Map<string, SlotBookingDocument[]>();
  forDay.forEach((b) => {
    const label = slotLabelForDay(day, b.timeSlot);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(b);
  });

  const groups = Array.from(map.entries())
    .map(([label, list]) => ({
      label,
      bookings: list.sort((a, b) => a.participantName.localeCompare(b.participantName)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { groups, total: forDay.length, unassigned };
}
