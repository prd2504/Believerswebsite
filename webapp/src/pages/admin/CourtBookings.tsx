/**
 * Court hours — the weekend at a glance, with one-click open/close.
 *
 * Replaces coordinating availability over WhatsApp: every sellable hour for a
 * fortnight, what it's doing, and who has it. Bookings are live, so a booking
 * taken online appears here without a refresh.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CalendarDays, Lock, Unlock, Check, X, IndianRupee, Plus, Loader2,
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
  SlotUnavailableError,
} from '@/services/courtRentalService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import {
  formatINR,
  buildDayAvailability,
  DEFAULT_COURT_CONFIG,
  type CourtRentalConfig,
  type CourtBookingDocument,
  type CourtSlot,
} from '@bba/shared';
import type { CentreDocument } from '@bba/shared';

/** Next `count` days from today, as YYYY-MM-DD. */
function upcomingDates(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`);
  }
  return out;
}

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
};

export default function CourtBookingsPage() {
  const { profile } = useAuth();
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [centreId, setCentreId] = useState('');
  const [config, setConfig] = useState<CourtRentalConfig | null>(null);
  const [bookings, setBookings] = useState<CourtBookingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Manual booking dialog (walk-ins Jaydeep takes by phone)
  const [addTarget, setAddTarget] = useState<{ date: string; hour: string } | null>(null);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addHours, setAddHours] = useState('1');

  const dates = useMemo(() => upcomingDates(14), []);
  const rangeStart = dates[0];
  const rangeEnd = dates[dates.length - 1];

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

  const effectiveConfig = config ?? { centreId, ...DEFAULT_COURT_CONFIG, updatedAt: '', updatedBy: null };

  /** Only days that actually sell hours — weekdays would be empty noise. */
  const days = useMemo(() => dates
    .map((date) => ({ date, slots: buildDayAvailability(effectiveConfig, date, bookings) }))
    .filter((d) => d.slots.length > 0),
  [dates, effectiveConfig, bookings]);

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

  const bookingById = useMemo(
    () => new Map(bookings.map((b) => [b.id, b])), [bookings],
  );

  if (loading) {
    return <div><h1 className="mb-6 text-xl font-bold text-brand-secondary">Court Hours</h1><CardSkeleton count={3} /></div>;
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Court Hours</h1>
          <p className="text-sm text-gray-500">Next 14 days · {formatINR(effectiveConfig.hourlyRatePaise, { withDecimals: false })}/hour</p>
        </div>
        <select
          value={centreId}
          onChange={(e) => setCentreId(e.target.value)}
          className="input w-auto py-2 text-sm"
        >
          {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
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

      <div className="space-y-3">
        {days.length === 0 ? (
          <div className="card p-8 text-center text-sm text-gray-500">
            No bookable hours configured for the next fortnight.
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
                        <p className="truncate font-medium">{b.bookerName}</p>
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
