/**
 * Court hours — the month at a glance, with one-click open/close.
 *
 * Replaces coordinating availability over WhatsApp: every sellable hour in the
 * month, what it's doing, and who has it. Bookings are live, so one taken
 * online appears here without a refresh.
 *
 * The grid runs a whole month at a time and steps freely, including backwards.
 * The public page is capped — next month opens on the 25th of this one — but
 * that cap is a sales rule, not a records one: Jaydeep arranges bookings ahead
 * of the release date, and enters cash walk-ins after the fact.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CalendarDays, Lock, Unlock, Check, X, IndianRupee, Plus, Loader2,
  ChevronLeft, ChevronRight, Repeat, Trash2, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { getAllCentres } from '@/services/centreService';
import {
  subscribeToCourtConfig,
  subscribeToBookingsInRange,
  setHourOverride,
  confirmCourtBooking,
  cancelCourtBooking,
  createCourtBooking,
  subscribeToCourtPlans,
  cancelCourtPlan,
  SlotUnavailableError,
  type CourtRentalPlan,
} from '@/services/courtRentalService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import {
  formatINR,
  buildDayAvailability,
  datesInMonth,
  nextMonth,
  endOfMonthDate,
  istNow,
  bookableDatesInMonth,
  DEFAULT_COURT_CONFIG,
  type CourtRentalConfig,
  type CourtBookingDocument,
  type CourtSlot,
} from '@bba/shared';
import type { CentreDocument } from '@bba/shared';

/** "2026-08" → "2026-07". */
function prevMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

const STATE_STYLE: Record<string, string> = {
  AVAILABLE: 'border-green-200 bg-green-50 text-green-800',
  HELD: 'border-amber-200 bg-amber-50 text-amber-800',
  BOOKED: 'border-blue-200 bg-blue-50 text-blue-800',
  CLOSED: 'border-gray-200 bg-gray-50 text-gray-400',
  COACHING: 'border-gray-100 bg-gray-100/60 text-gray-400',
  PAST: 'border-gray-100 bg-gray-50 text-gray-300',
};

export default function CourtBookingsPage() {
  const { profile } = useAuth();
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [centreId, setCentreId] = useState('');
  const [config, setConfig] = useState<CourtRentalConfig | null>(null);
  const [bookings, setBookings] = useState<CourtBookingDocument[]>([]);
  const [plans, setPlans] = useState<CourtRentalPlan[]>([]);
  /**
   * Start on the month there is still work to do in.
   *
   * On the 30th, this month's last weekend has already gone and everything
   * left to arrange is in the next one — opening on a grid of spent hours
   * means a step before you can do anything. Falls back to the current month
   * when the config is still loading, and is overridden the moment anyone
   * touches the stepper.
   */
  const [month, setMonth] = useState(() => istNow().date.slice(0, 7));
  const [monthPinned, setMonthPinned] = useState(false);
  /**
   * Elapsed days are hidden by default. They matter — a cash walk-in gets
   * entered after the fact — but they are not what anyone opens this page for,
   * and by the end of a month they bury the days that are still live.
   */
  const [showPast, setShowPast] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Manual booking dialog (walk-ins Jaydeep takes by phone)
  const [addTarget, setAddTarget] = useState<{ date: string; hour: string } | null>(null);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addHours, setAddHours] = useState('1');

  const dates = useMemo(() => datesInMonth(month), [month]);
  const rangeStart = `${month}-01`;
  const rangeEnd = endOfMonthDate(month);

  useEffect(() => {
    getAllCentres().then((c) => {
      setCentres(c);
      // Court hours are a Dadar arrangement today; default there when present.
      const dad = c.find((x) => x.centreCode === 'DAD') ?? c[0];
      if (dad) setCentreId(dad.id);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!centreId) return;
    return subscribeToCourtConfig(centreId, setConfig);
  }, [centreId]);

  useEffect(() => {
    if (!centreId) return;
    return subscribeToBookingsInRange(centreId, rangeStart, rangeEnd, setBookings);
  }, [centreId, rangeStart, rangeEnd]);

  useEffect(() => {
    if (!centreId) return;
    return subscribeToCourtPlans(centreId, month, setPlans);
  }, [centreId, month]);

  const effectiveConfig = config ?? { centreId, ...DEFAULT_COURT_CONFIG, updatedAt: '', updatedBy: null };

  useEffect(() => {
    if (monthPinned || !config) return;
    const now = istNow();
    const thisMonth = now.date.slice(0, 7);
    if (bookableDatesInMonth(config, thisMonth, now).length === 0) setMonth(nextMonth(thisMonth));
  }, [config, monthPinned]);

  function stepMonth(to: string) {
    setMonthPinned(true);
    setMonth(to);
  }

  const today = istNow().date;

  /**
   * Only days that actually sell hours — weekdays would be empty noise — and,
   * in the current month, only days that haven't gone yet unless asked.
   *
   * The filter applies to the current month alone: stepping back to a past
   * month is a deliberate act with exactly one purpose, so hiding all of it
   * would be perverse.
   */
  const days = useMemo(() => dates
    .map((date) => ({ date, slots: buildDayAvailability(effectiveConfig, date, bookings) }))
    .filter((d) => d.slots.length > 0)
    .filter((d) => showPast || month !== today.slice(0, 7) || d.date >= today),
  [dates, effectiveConfig, bookings, showPast, month, today]);

  /** How many days the filter is holding back — so the toggle can say so. */
  const hiddenPast = useMemo(() => {
    if (showPast || month !== today.slice(0, 7)) return 0;
    return dates.filter((d) => d < today
      && buildDayAvailability(effectiveConfig, d, bookings).length > 0).length;
  }, [dates, effectiveConfig, bookings, showPast, month, today]);

  const revenue = useMemo(() => {
    const confirmed = bookings.filter((b) => b.status === 'CONFIRMED');
    const held = bookings.filter((b) => b.status === 'HELD');
    return {
      confirmedPaise: confirmed.reduce((t, b) => t + b.amountPaise, 0),
      heldPaise: held.reduce((t, b) => t + b.amountPaise, 0),
      confirmedHours: confirmed.length,
      heldCount: held.length,
    };
  }, [bookings]);

  const toggleHour = useCallback(async (date: string, slot: CourtSlot) => {
    if (!profile) return;
    setBusy(true);
    try {
      await setHourOverride(centreId, date, slot.hour, slot.state === 'CLOSED', profile.id);
      toast.success(`${dayLabel(date)} ${slot.hour} ${slot.state === 'CLOSED' ? 'opened' : 'closed'}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update that hour');
    } finally {
      setBusy(false);
    }
  }, [centreId, profile]);

  async function handleConfirm(id: string) {
    if (!profile) return;
    setBusy(true);
    try {
      await confirmCourtBooking(id, profile.id);
      toast.success('Booking confirmed');
    } catch { toast.error('Failed to confirm'); } finally { setBusy(false); }
  }

  async function handleCancel(id: string) {
    if (!profile) return;
    if (!confirm('Cancel this booking? The hour becomes available again.')) return;
    setBusy(true);
    try {
      await cancelCourtBooking(id, profile.id, 'Cancelled by admin');
      toast.success('Cancelled — hour is free again');
    } catch { toast.error('Failed to cancel'); } finally { setBusy(false); }
  }

  async function handleAdd() {
    if (!profile || !addTarget) return;
    if (addName.trim().length < 2 || addPhone.replace(/\D/g, '').length < 10) {
      toast.error('Name and a 10-digit phone are required.');
      return;
    }
    setBusy(true);
    try {
      await createCourtBooking({
        centreId,
        date: addTarget.date,
        startHour: addTarget.hour,
        hours: Number(addHours) || 1,
        bookerName: addName.trim(),
        bookerPhone: addPhone.replace(/\D/g, ''),
        source: 'ADMIN',
      });
      toast.success('Booked');
      setAddTarget(null);
      setAddName(''); setAddPhone(''); setAddHours('1');
    } catch (err) {
      toast.error(err instanceof SlotUnavailableError ? err.message : 'Failed to book');
    } finally { setBusy(false); }
  }

  async function handleCancelPlan(plan: CourtRentalPlan) {
    if (!profile) return;
    if (!confirm(
      `Cancel ${plan.bookerName}'s ${WEEKDAY_NAMES[plan.weekday]} ${plan.startHour} plan?\n\n`
      + 'Every hour it still holds this month becomes available again.',
    )) return;
    setBusy(true);
    try {
      const freed = await cancelCourtPlan(plan.id, profile.id);
      toast.success(`Plan cancelled — ${freed} hour${freed === 1 ? '' : 's'} freed`);
    } catch { toast.error('Failed to cancel the plan'); } finally { setBusy(false); }
  }

  const bookingById = useMemo(
    () => new Map(bookings.map((b) => [b.id, b])), [bookings],
  );

  /**
   * Plan revenue is already inside `bookings` — a plan is materialised as real
   * bookings, which is what makes the availability grid and the P&L work
   * without knowing plans exist. Counting it again here would double it, so
   * this panel reports sessions and status, not a second revenue figure.
   */
  const planRows = useMemo(() => plans.map((p) => {
    const held = bookings.filter((b) => b.planId === p.id && b.status !== 'CANCELLED');
    return {
      plan: p,
      remaining: held.length,
      confirmed: held.filter((b) => b.status === 'CONFIRMED').length,
      valuePaise: held.reduce((t, b) => t + b.amountPaise, 0),
    };
  }), [plans, bookings]);

  if (loading) {
    return <div><h1 className="mb-6 text-xl font-bold text-brand-secondary">Court Hours</h1><CardSkeleton count={3} /></div>;
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Court Hours</h1>
          <p className="text-sm text-gray-500">
            {formatINR(effectiveConfig.hourlyRatePaise, { withDecimals: false })}/hour ·{' '}
            {formatINR(effectiveConfig.planHourlyRatePaise, { withDecimals: false })}/hour on a plan
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            <button
              onClick={() => stepMonth(prevMonth(month))}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
              title="Previous month"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-[110px] text-center text-sm font-semibold text-brand-secondary">
              {monthLabel(month)}
            </span>
            <button
              onClick={() => stepMonth(nextMonth(month))}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
              title="Next month"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          {(hiddenPast > 0 || showPast) && (
            <button
              onClick={() => setShowPast((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition',
                showPast
                  ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50',
              )}
              title="Elapsed days are still bookable here — that's how a cash walk-in gets recorded"
            >
              <History size={13} />
              {showPast ? 'Hide past days' : `Show ${hiddenPast} past day${hiddenPast === 1 ? '' : 's'}`}
            </button>
          )}
          <select
            value={centreId}
            onChange={(e) => setCentreId(e.target.value)}
            className="input w-auto py-2 text-sm"
          >
            {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-lg bg-green-50 p-2"><IndianRupee size={18} className="text-green-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Confirmed</p>
            <p className="text-lg font-bold text-green-600">{formatINR(revenue.confirmedPaise, { withDecimals: false })}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-lg bg-amber-50 p-2"><Loader2 size={18} className="text-amber-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Awaiting verification</p>
            <p className="text-lg font-bold text-amber-600">{revenue.heldCount}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-lg bg-blue-50 p-2"><CalendarDays size={18} className="text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Hours sold</p>
            <p className="text-lg font-bold text-brand-secondary">{revenue.confirmedHours}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-lg bg-gray-100 p-2"><IndianRupee size={18} className="text-gray-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Held (unconfirmed)</p>
            <p className="text-lg font-bold text-brand-secondary">{formatINR(revenue.heldPaise, { withDecimals: false })}</p>
          </div>
        </div>
      </div>

      {planRows.length > 0 && (
        <div className="card mb-5">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-secondary">
            <Repeat size={14} /> Monthly plans · {monthLabel(month)}
          </h2>
          <div className="space-y-2">
            {planRows.map(({ plan, remaining, confirmed, valuePaise }) => (
              <div
                key={plan.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-brand-secondary">
                    {plan.bookerName}
                    {!plan.active && (
                      <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        Cancelled
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {WEEKDAY_NAMES[plan.weekday]}s · {plan.startHour}
                    {plan.hours > 1 ? ` for ${plan.hours}h` : ''} · {plan.bookerPhone}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {confirmed}/{remaining} confirmed
                    </p>
                    <p className="text-sm font-bold text-brand-secondary">
                      {formatINR(valuePaise, { withDecimals: false })}
                    </p>
                  </div>
                  {plan.active && (
                    <button
                      onClick={() => handleCancelPlan(plan)}
                      disabled={busy}
                      title="Cancel plan and free every hour it holds"
                      className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-gray-400">
            Plan hours are ordinary bookings underneath, so they already appear in the grid
            and in the totals above — this panel is not extra revenue.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {days.length === 0 ? (
          <div className="card p-8 text-center text-sm text-gray-500">
            {hiddenPast > 0
              ? `Nothing left to sell in ${monthLabel(month)} — step forward, or show the ${hiddenPast} day${hiddenPast === 1 ? '' : 's'} already played.`
              : `No bookable hours configured for ${monthLabel(month)}.`}
          </div>
        ) : days.map(({ date, slots }) => (
          <div key={date} className="card">
            <h3 className="mb-2.5 text-sm font-bold text-brand-secondary">{dayLabel(date)}</h3>
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => {
                const b = s.bookingId ? bookingById.get(s.bookingId) : null;
                const isBookable = s.state === 'AVAILABLE';
                const isToggleable = s.state === 'AVAILABLE' || s.state === 'CLOSED';
                return (
                  <div
                    key={s.hour}
                    className={cn('rounded-lg border p-2.5 text-xs', STATE_STYLE[s.state])}
                    style={{ minWidth: 132 }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{s.hour}–{s.endHour}</span>
                      {isToggleable && (
                        <button
                          onClick={() => toggleHour(date, s)}
                          disabled={busy}
                          title={s.state === 'CLOSED' ? 'Open this hour' : 'Close this hour'}
                          className="rounded p-0.5 opacity-60 hover:bg-black/10 hover:opacity-100 disabled:opacity-30"
                        >
                          {s.state === 'CLOSED' ? <Unlock size={11} /> : <Lock size={11} />}
                        </button>
                      )}
                    </div>

                    {s.state === 'COACHING' && <p className="mt-1 text-[11px]">Coaching</p>}
                    {s.state === 'CLOSED' && <p className="mt-1 text-[11px]">Closed</p>}

                    {isBookable && (
                      <button
                        onClick={() => { setAddTarget({ date, hour: s.hour }); }}
                        className="mt-1.5 flex items-center gap-1 rounded bg-white/70 px-1.5 py-0.5 text-[11px] font-medium hover:bg-white"
                      >
                        <Plus size={10} /> Book
                      </button>
                    )}

                    {b && (
                      <div className="mt-1">
                        <p className="truncate font-medium">
                          {b.bookerName}
                          {b.planId && (
                            <span className="ml-1 rounded bg-white/70 px-1 py-px text-[9px] font-semibold uppercase tracking-wide">
                              Plan
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] opacity-70">{b.bookerPhone}</p>
                        {b.amountPaise > 0 && (
                          <p className="text-[10px] font-semibold">{formatINR(b.amountPaise, { withDecimals: false })}</p>
                        )}
                        {b.status === 'HELD' && (
                          <div className="mt-1 flex gap-1">
                            <button
                              onClick={() => handleConfirm(b.id)}
                              disabled={busy}
                              className="rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-green-700"
                            >
                              <Check size={9} className="inline" /> Confirm
                            </button>
                            <button
                              onClick={() => handleCancel(b.id)}
                              disabled={busy}
                              className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50"
                            >
                              <X size={9} className="inline" />
                            </button>
                          </div>
                        )}
                        {b.status === 'CONFIRMED' && (
                          <button
                            onClick={() => handleCancel(b.id)}
                            disabled={busy}
                            className="mt-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {addTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <div>
                <h3 className="text-sm font-semibold text-brand-secondary">Book court time</h3>
                <p className="text-xs text-gray-400">{dayLabel(addTarget.date)} from {addTarget.hour}</p>
              </div>
              <button onClick={() => setAddTarget(null)} className="btn-ghost p-1"><X size={16} /></button>
            </div>
            <div className="space-y-3 p-4">
              <div>
                <label className="label">Name</label>
                <input value={addName} onChange={(e) => setAddName(e.target.value)} className="input" autoFocus />
              </div>
              <div>
                <label className="label">Phone</label>
                <input
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="input"
                  inputMode="numeric"
                />
              </div>
              <div>
                <label className="label">Hours</label>
                <select value={addHours} onChange={(e) => setAddHours(e.target.value)} className="input">
                  {[1, 2, 3, 4].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  {formatINR(effectiveConfig.hourlyRatePaise * (Number(addHours) || 1), { withDecimals: false })} total
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 p-3">
              <button onClick={() => setAddTarget(null)} className="btn-secondary text-xs" disabled={busy}>Cancel</button>
              <button onClick={handleAdd} className="btn-primary text-xs" disabled={busy}>
                {busy ? 'Booking…' : 'Book'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
