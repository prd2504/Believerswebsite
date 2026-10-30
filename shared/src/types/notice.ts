/**
 * Dated notices shown on the public /fees page, per centre.
 *
 * Each one disappears on its own after `until`, so an announcement can never
 * linger past its date. Edit this list to add the next one.
 */

import type { IsoDate } from './common.js';

export interface FeeNotice {
  id: string;
  /** Centre codes it applies to. */
  centreCodes: readonly string[];
  /** Shown from / until these IST dates, inclusive. */
  from: IsoDate;
  until: IsoDate;
  tone: 'info' | 'warning';
  title: string;
  body: string;
}

export const FEE_NOTICES: readonly FeeNotice[] = [
  {
    id: 'fees-nov-2026',
    centreCodes: ['DAD', 'RBI'],
    from: '2026-10-25',
    until: '2026-11-05',
    tone: 'warning',
    title: 'November fees — last date 5 November',
    body: 'Please pay November fees on this page by Thursday, 5 November. Quarterly payers covered through November need not pay.',
  },
  {
    id: 'gate-pass-dadar',
    centreCodes: ['DAD'],
    from: '2026-10-25',
    until: '2026-11-30',
    tone: 'info',
    title: 'Gate pass for Dadar',
    body: 'Your gate pass is emailed to you as soon as your fee is recorded. Keep it on your phone (or printed) and show it at the gate — entry is by gate pass.',
  },
  {
    id: 'diwali-2026',
    centreCodes: ['DAD', 'RBI'],
    from: '2026-10-30',
    until: '2026-11-01',
    tone: 'info',
    title: 'Diwali vacation',
    body: 'Diwali vacation dates will be shared tomorrow.',
  },
];

/** Notices to show today. With no centre chosen yet, every live notice. */
export function activeFeeNotices(centreCode: string | null | undefined, today: IsoDate): FeeNotice[] {
  return FEE_NOTICES.filter((n) =>
    today >= n.from && today <= n.until && (!centreCode || n.centreCodes.includes(centreCode)));
}
