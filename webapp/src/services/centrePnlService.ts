/**
 * Per-centre profit & loss, with month-over-month movement.
 *
 * The Financials overview only ever computed company-wide totals, so "which
 * centre did better or worse than last month" could not be answered without
 * exporting and pivoting by hand. This builds one row per centre for a month,
 * against the same month prior, from data the page already loads.
 *
 * Revenue is *collected* (status PAID), not billed — an unpaid invoice is not
 * profit, and counting it would flatter a centre with poor collection.
 */

import type {
  CentreExpenseDocument,
  PartnerPayoutDocument,
  PaymentDocument,
  CentreDocument,
} from '@bba/shared';

export interface CentrePnlRow {
  centreId: string;
  centreName: string;

  revenuePaise: number;
  billedPaise: number;
  /** Collected ÷ billed for the month. Null when nothing was billed. */
  collectionRate: number | null;

  expensesPaise: number;
  salaryPaise: number;
  payoutsPaise: number;

  netPaise: number;
  /** Net ÷ revenue. Null when there was no revenue to take a margin on. */
  marginPct: number | null;

  // ── Prior month, and movement ──
  prevRevenuePaise: number;
  prevExpensesPaise: number;
  prevNetPaise: number;
  /** Net this month minus net last month. Positive = improved. */
  netDeltaPaise: number;
  /**
   * Percent change in net vs last month. Null when last month's net was zero
   * (no meaningful base) — the absolute delta is the honest number there.
   */
  netDeltaPct: number | null;
  /** True when the centre has no activity at all in either month. */
  dormant: boolean;
}

export interface PnlInputs {
  centres: CentreDocument[];
  payments: PaymentDocument[];
  monthExpenses: CentreExpenseDocument[];
  prevMonthExpenses: CentreExpenseDocument[];
  monthPayouts: PartnerPayoutDocument[];
  prevMonthPayouts: PartnerPayoutDocument[];
  month: string;
  prevMonth: string;
}

function sum<T>(rows: T[], pick: (r: T) => number): number {
  return rows.reduce((s, r) => s + pick(r), 0);
}

/** Previous YYYY-MM. */
export function previousMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function buildCentrePnl(input: PnlInputs): CentrePnlRow[] {
  const {
    centres, payments,
    monthExpenses, prevMonthExpenses,
    monthPayouts, prevMonthPayouts,
    month, prevMonth,
  } = input;

  return centres.map((centre) => {
    const forCentre = <T extends { centreId: string }>(rows: T[]) =>
      rows.filter((r) => r.centreId === centre.id);

    const curPayments = payments.filter((p) => p.centreId === centre.id && p.month === month);
    const prevPayments = payments.filter((p) => p.centreId === centre.id && p.month === prevMonth);

    const revenuePaise = sum(curPayments.filter((p) => p.status === 'PAID'), (p) => p.totalAmountPaise);
    const billedPaise = sum(curPayments, (p) => p.totalAmountPaise);
    const prevRevenuePaise = sum(prevPayments.filter((p) => p.status === 'PAID'), (p) => p.totalAmountPaise);

    const curExp = forCentre(monthExpenses);
    const prevExp = forCentre(prevMonthExpenses);
    const expensesPaise = sum(curExp, (e) => e.amountPaise);
    const prevExpensesPaise = sum(prevExp, (e) => e.amountPaise);
    const salaryPaise = sum(curExp.filter((e) => e.category === 'COACH_SALARY'), (e) => e.amountPaise);

    const payoutsPaise = sum(forCentre(monthPayouts), (p) => p.amountPaise);
    const prevPayoutsPaise = sum(forCentre(prevMonthPayouts), (p) => p.amountPaise);

    const netPaise = revenuePaise - expensesPaise - payoutsPaise;
    const prevNetPaise = prevRevenuePaise - prevExpensesPaise - prevPayoutsPaise;
    const netDeltaPaise = netPaise - prevNetPaise;

    return {
      centreId: centre.id,
      centreName: centre.name,
      revenuePaise,
      billedPaise,
      collectionRate: billedPaise > 0 ? revenuePaise / billedPaise : null,
      expensesPaise,
      salaryPaise,
      payoutsPaise,
      netPaise,
      marginPct: revenuePaise > 0 ? netPaise / revenuePaise : null,
      prevRevenuePaise,
      prevExpensesPaise,
      prevNetPaise,
      netDeltaPaise,
      netDeltaPct: prevNetPaise !== 0 ? netDeltaPaise / Math.abs(prevNetPaise) : null,
      dormant:
        revenuePaise === 0 && expensesPaise === 0 && payoutsPaise === 0 &&
        prevRevenuePaise === 0 && prevExpensesPaise === 0 && prevPayoutsPaise === 0,
    };
  });
}

export interface PnlTotals {
  revenuePaise: number;
  expensesPaise: number;
  salaryPaise: number;
  payoutsPaise: number;
  netPaise: number;
  prevNetPaise: number;
  netDeltaPaise: number;
}

export function totalPnl(rows: CentrePnlRow[]): PnlTotals {
  return {
    revenuePaise: sum(rows, (r) => r.revenuePaise),
    expensesPaise: sum(rows, (r) => r.expensesPaise),
    salaryPaise: sum(rows, (r) => r.salaryPaise),
    payoutsPaise: sum(rows, (r) => r.payoutsPaise),
    netPaise: sum(rows, (r) => r.netPaise),
    prevNetPaise: sum(rows, (r) => r.prevNetPaise),
    netDeltaPaise: sum(rows, (r) => r.netDeltaPaise),
  };
}
