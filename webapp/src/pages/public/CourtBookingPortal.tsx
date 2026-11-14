/**
 * Court hour booking — reachable only by direct link.
 *
 * Deliberately unlisted: no nav entry, no link from /fees, and a noindex
 * robots tag set on mount so it never turns up in search. That's a
 * discoverability choice, not a records one — the booking is stored and
 * reported for exactly what it is.
 *
 * Availability and writes go through Cloud Functions, not Firestore: the
 * `courtBookings` collection is admin-read (every document carries a member of
 * the public's name and phone), so an anonymous visitor querying it directly
 * was denied and saw "nothing free" on every date. See courtBookingApi.ts.
 *
 * A slot is HELD on submit, not confirmed. Payment is verified by hand in
 * Admin → Court Hours, which is also what releases or cancels the hour.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Clock, Calendar, Check, Loader2, AlertCircle, Copy, CheckCircle2, Upload, User, Phone, Mail,
  CalendarDays, Repeat,
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { uploadObjectPath } from '../../lib/uploadPath';
import { storage } from '@/lib/firebase';
import { cn } from '@/lib/cn';
import { UpiQrCode } from '@/components/common/UpiQrCode';
import {
  getPublicAvailability,
  createCourtBookingPublic,
  createCourtPlanPublic,
  SlotUnavailableError,
  type PublicAvailability,
  type PublicSlot,
} from '@/services/courtRentalService';
import { getActiveCentres } from '@/services/centreService';
import {
  formatINR,
  COMPANY,
  COURT_ADDONS,
  COURT_RULES,
  MAX_BOOKING_HOURS,
  INCLUDED_PLAYERS,
  GUEST_FEE_PAISE,
  addOnsTotalPaise,
  guestFeePaise,
  formatHourRange,
  istNow,
  isHourPast,
  nextMonth,
  addHour,
} from '@bba/shared';

/** Slug → centre code. Only centres that actually sell court hours. */
const SLUG_TO_CODE: Record<string, string> = { dadar: 'DAD' };

const UPI_ID = '85287401@ubin';

type Clock = { date: string; time: string };
type Mode = 'SLOT' | 'PLAN';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function weekdayOfDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function clockLabel(c: Clock): string {
  const [y, m, d] = c.date.split('-').map(Number);
  const [hh, mm] = c.time.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm);
  return dt.toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

/** Whole minutes between two wall clocks. */
function clockDiffMinutes(a: Clock, b: Clock): number {
  const toMs = (c: Clock) => {
    const [y, m, d] = c.date.split('-').map(Number);
    const [hh, mm] = c.time.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm).getTime();
  };
  return Math.round((toMs(a) - toMs(b)) / 60_000);
}

function clockPlus(c: Clock, minutes: number): Clock {
  const [y, m, d] = c.date.split('-').map(Number);
  const [hh, mm] = c.time.split(':').map(Number);
  const t = new Date(y, m - 1, d, hh, mm + minutes);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`,
    time: `${p(t.getHours())}:${p(t.getMinutes())}`,
  };
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  }
}

/** Last day of a month, as YYYY-MM-DD. */
function endOfMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return `${yearMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

export default function CourtBookingPortal() {
  const { centreSlug } = useParams<{ centreSlug: string }>();
  const centreCode = centreSlug ? SLUG_TO_CODE[centreSlug.toLowerCase()] : undefined;

  const [centreId, setCentreId] = useState('');
  const [centreName, setCentreName] = useState('');
  const [avail, setAvail] = useState<PublicAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  /**
   * The court's clock, not the device's.
   *
   * The server sends its own Asia/Kolkata time with the availability; the
   * difference from this device's idea of Asia/Kolkata is kept as an offset
   * and applied to every local tick. A phone with a wrong clock therefore
   * still shows — and books against — the right hour, without needing a round
   * trip every second.
   */
  const [offsetMin, setOffsetMin] = useState(0);
  const [clock, setClock] = useState<Clock>(() => istNow());

  const [mode, setMode] = useState<Mode>('SLOT');
  const [month, setMonth] = useState('');
  const [date, setDate] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [hours, setHours] = useState(1);

  const [planWeekday, setPlanWeekday] = useState<number | null>(null);
  const [planHour, setPlanHour] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addOns, setAddOns] = useState<Record<string, number>>({});
  const [players, setPlayers] = useState(INCLUDED_PLAYERS);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [shot, setShot] = useState<File | null>(null);
  const [shotPreview, setShotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | { kind: Mode; booked: string[]; clashes: string[] }>(null);
  const [copied, setCopied] = useState(false);

  // Keep this page out of search results. Set here rather than in index.html
  // so it applies to this route only and no other page is affected.
  useEffect(() => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex, nofollow';
    document.head.appendChild(tag);
    return () => { document.head.removeChild(tag); };
  }, []);

  // Tick. Every 15s is plenty for a clock showing minutes, and it is what
  // retires an hour from the grid the moment it starts.
  useEffect(() => {
    const tick = () => setClock(clockPlus(istNow(), offsetMin));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [offsetMin]);

  const load = useCallback(async (id: string) => {
    const serverGuess = istNow();
    const from = serverGuess.date;
    // Two months: this one and the next. Anyone planning further out than
    // that is arranging it with Jaydeep anyway.
    const to = endOfMonth(nextMonth(serverGuess.date.slice(0, 7)));
    const a = await getPublicAvailability(id, from, to);
    setAvail(a);
    setOffsetMin(clockDiffMinutes(a.now, istNow()));
    setClock(a.now);
    setMonth((m) => m || a.now.date.slice(0, 7));
    return a;
  }, []);

  useEffect(() => {
    if (!centreCode) { setLoading(false); return; }
    getActiveCentres().then(async (centres) => {
      const c = centres.find((x) => x.centreCode === centreCode);
      if (!c) { setLoading(false); return; }
      setCentreId(c.id);
      setCentreName(c.name);
      try {
        await load(c.id);
      } catch {
        setLoadErr('Could not load availability. Please refresh.');
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [centreCode, load]);

  /**
   * Which months are on sale. Next month appears on the 25th of this one —
   * the same day the slot-booking window drops, so a regular has one release
   * date to remember rather than two. An empty next-month tab sitting there
   * all month reads as a broken page, so it simply isn't offered until then.
   */
  const months = useMemo(() => {
    const first = clock.date.slice(0, 7);
    const second = nextMonth(first);
    const horizon = avail?.horizon ?? '';
    return horizon >= `${second}-01` ? [first, second] : [first];
  }, [clock.date, avail?.horizon]);

  useEffect(() => {
    if (months.length > 0 && !months.includes(month)) setMonth(months[0]);
  }, [months, month]);

  /**
   * An hour the server called free may have started since. Re-testing against
   * the ticking clock is what stops a page left open on a table from selling
   * an hour that is already underway.
   */
  const slotState = useCallback((d: string, s: PublicSlot): string => (
    s.state === 'AVAILABLE' && isHourPast(d, s.hour, clock) ? 'PAST' : s.state
  ), [clock]);

  /** Dates in the chosen month with at least one hour still sellable. */
  const dates = useMemo(() => {
    if (!avail) return [];
    return Object.keys(avail.days)
      .filter((d) => d.startsWith(month) && d >= clock.date)
      .filter((d) => avail.days[d].some((s) => slotState(d, s) === 'AVAILABLE'))
      .sort();
  }, [avail, month, clock.date, slotState]);

  useEffect(() => {
    if (dates.length === 0) { setDate(''); return; }
    if (!dates.includes(date)) setDate(dates[0]);
  }, [dates, date]);

  const daySlots = useMemo(
    () => (avail && date ? avail.days[date] ?? [] : []),
    [avail, date],
  );

  /** Only hours worth showing: free, or free-but-elapsed so the clock reads true. */
  const shownSlots = useMemo(
    () => daySlots
      .map((s) => ({ ...s, state: slotState(date, s) }))
      .filter((s) => s.state === 'AVAILABLE' || s.state === 'PAST'),
    [daySlots, date, slotState],
  );

  const hasAvailable = shownSlots.some((s) => s.state === 'AVAILABLE');

  useEffect(() => { setPicked(null); }, [date, mode]);

  /** Longest run of free hours from the picked one — caps the duration list. */
  const maxHours = useMemo(() => {
    if (!picked) return 1;
    const byHour = new Map(shownSlots.map((s) => [s.hour, s]));
    let n = 0;
    let cur = picked;
    while (byHour.get(cur)?.state === 'AVAILABLE' && n < MAX_BOOKING_HOURS) {
      n++;
      cur = addHour(cur);
    }
    return Math.max(1, n);
  }, [picked, shownSlots]);

  useEffect(() => { if (hours > maxHours) setHours(maxHours); }, [maxHours, hours]);

  // ── Monthly plan ───────────────────────────────────────────────────────────

  /** Weekdays this month that still have a sellable hour. */
  const planWeekdays = useMemo(() => {
    if (!avail) return [];
    const set = new Set<number>();
    Object.entries(avail.days).forEach(([d, slots]) => {
      if (!d.startsWith(month) || d < clock.date) return;
      if (slots.some((s) => slotState(d, s) === 'AVAILABLE')) set.add(weekdayOfDate(d));
    });
    return Array.from(set).sort();
  }, [avail, month, clock.date, slotState]);

  useEffect(() => {
    if (planWeekdays.length === 0) { setPlanWeekday(null); return; }
    if (planWeekday === null || !planWeekdays.includes(planWeekday)) setPlanWeekday(planWeekdays[0]);
  }, [planWeekdays, planWeekday]);

  /** Every remaining date in the month falling on the chosen weekday. */
  const planDates = useMemo(() => {
    if (!avail || planWeekday === null) return [];
    return Object.keys(avail.days)
      .filter((d) => d.startsWith(month) && d >= clock.date && weekdayOfDate(d) === planWeekday)
      .sort();
  }, [avail, month, clock.date, planWeekday]);

  /**
   * Hours free on EVERY remaining date of that weekday.
   *
   * A plan is one hour repeated weekly, so an hour that is taken on the third
   * Saturday is not a plan hour — offering it and then part-booking it is how
   * you end up owing someone a refund.
   */
  const planHourOptions = useMemo(() => {
    if (!avail || planDates.length === 0) return [];
    const counts = new Map<string, number>();
    planDates.forEach((d) => {
      (avail.days[d] ?? []).forEach((s) => {
        if (slotState(d, s) === 'AVAILABLE') counts.set(s.hour, (counts.get(s.hour) ?? 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .filter(([, n]) => n === planDates.length)
      .map(([h]) => h)
      .sort();
  }, [avail, planDates, slotState]);

  useEffect(() => {
    if (planHourOptions.length === 0) { setPlanHour(null); return; }
    if (planHour === null || !planHourOptions.includes(planHour)) setPlanHour(planHourOptions[0]);
  }, [planHourOptions, planHour]);

  // ── Money ──────────────────────────────────────────────────────────────────

  const rate = avail?.hourlyRatePaise ?? 0;
  const planRate = avail?.planHourlyRatePaise ?? 0;
  const extrasTotal = addOnsTotalPaise(addOns);
  const guestTotal = guestFeePaise(players);

  const total = mode === 'SLOT'
    ? rate * hours + extrasTotal + guestTotal
    : planRate * planDates.length;

  const upiUrl = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent('BBA Sports')}` +
    `&am=${Math.round(total / 100)}&cu=INR&tn=${encodeURIComponent('Court booking')}`;

  const readyToPay = mode === 'SLOT' ? !!picked : (planWeekday !== null && !!planHour && planDates.length > 0);

  function onShot(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setShot(f);
    const r = new FileReader();
    r.onload = () => setShotPreview(r.result as string);
    r.readAsDataURL(f);
  }

  function resetForm() {
    setDone(null); setPicked(null); setName(''); setPhone(''); setEmail('');
    setAddOns({}); setPlayers(INCLUDED_PLAYERS);
    setRulesAccepted(false); setShot(null); setShotPreview(null);
  }

  async function submit() {
    if (!centreId || !readyToPay) return;
    if (name.trim().length < 2) { setError('Please enter your name.'); return; }
    if (phone.replace(/\D/g, '').length !== 10) { setError('Please enter a 10-digit phone number.'); return; }
    if (!rulesAccepted) { setError('Please confirm you have read the court rules.'); return; }
    setSubmitting(true);
    setError('');
    try {
      let screenshotUrl: string | null = null;
      if (shot) {
        try {
          const path = uploadObjectPath('court-bookings', centreId, shot.name);
          const r = ref(storage, path);
          // The screenshot is optional — never let a slow upload hold the
          // booking hostage, or the hour may be gone by the time it finishes.
          const up = (async () => { await uploadBytes(r, shot); return getDownloadURL(r); })();
          screenshotUrl = await Promise.race([
            up,
            new Promise<null>((res) => setTimeout(() => res(null), 20_000)),
          ]);
        } catch { /* proceed without it */ }
      }

      const booker = {
        bookerName: name.trim(),
        bookerPhone: phone.replace(/\D/g, ''),
        bookerEmail: email.trim() || undefined,
        screenshotUrl,
      };

      if (mode === 'SLOT') {
        await createCourtBookingPublic({
          centreId, date, startHour: picked!, hours, addOns, players, ...booker,
        });
        setDone({ kind: 'SLOT', booked: [date], clashes: [] });
      } else {
        const res = await createCourtPlanPublic({
          centreId, weekday: planWeekday!, startHour: planHour!, hours: 1,
          yearMonth: month, ...booker,
        });
        setDone({ kind: 'PLAN', booked: res.booked, clashes: res.clashes });
      }
    } catch (err) {
      setError(err instanceof SlotUnavailableError
        ? err.message
        : 'Something went wrong. Please try again.');
      try { await load(centreId); } catch { /* keep the message we already have */ }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 size={28} className="animate-spin text-brand-primary" />
      </div>
    );
  }

  if (!centreCode || !centreId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <AlertCircle size={44} className="mx-auto text-gray-300" />
          <h1 className="mt-4 text-lg font-bold text-gray-700">Not found</h1>
          <p className="mt-1 text-sm text-gray-500">Please check the link you were given.</p>
        </div>
      </div>
    );
  }

  if (loadErr || !avail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <AlertCircle size={44} className="mx-auto text-gray-300" />
          <h1 className="mt-4 text-lg font-bold text-gray-700">Can&apos;t load times</h1>
          <p className="mt-1 text-sm text-gray-500">{loadErr || 'Please refresh and try again.'}</p>
        </div>
      </div>
    );
  }

  if (!avail.isOpen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <Clock size={44} className="mx-auto text-gray-300" />
          <h1 className="mt-4 text-lg font-bold text-gray-700">Bookings closed</h1>
          <p className="mt-1 text-sm text-gray-500">Please check back later.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h1 className="mt-5 text-xl font-bold text-brand-secondary">
            {done.kind === 'PLAN' ? 'Monthly plan requested' : 'Slot requested'}
          </h1>

          {done.kind === 'SLOT' ? (
            <p className="mt-2 text-sm text-gray-500">
              {dayLabel(done.booked[0])} · {formatHourRange(picked ?? '09:00', hours)}
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-500">
              {WEEKDAY_NAMES[planWeekday ?? 0]}s, {formatHourRange(planHour ?? '09:00')} ·{' '}
              {done.booked.length} session{done.booked.length > 1 ? 's' : ''} in {monthLabel(month)}
            </p>
          )}

          {done.clashes.length > 0 && (
            <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-left">
              <p className="text-xs font-semibold text-orange-900">
                {done.clashes.length} date{done.clashes.length > 1 ? 's' : ''} couldn&apos;t be booked
              </p>
              <p className="mt-1 text-xs text-orange-800">
                {done.clashes.map(dayLabel).join(', ')} — someone took {done.clashes.length > 1 ? 'those hours' : 'that hour'}
                {' '}first. We&apos;ll call you to sort out the difference before charging for {done.clashes.length > 1 ? 'them' : 'it'}.
              </p>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left">
            <p className="text-xs text-amber-800">
              Your {done.kind === 'PLAN' ? 'hours are' : 'slot is'} held. Confirmed once we verify the
              payment — you&apos;ll get a call if anything is unclear. Questions: {COMPANY.supportEmail}
            </p>
          </div>
          <button
            onClick={() => { resetForm(); load(centreId).catch(() => {}); }}
            className="mt-4 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-600"
          >
            Book another slot
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <header className="border-b border-gray-100 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <img src="/logo.png" alt="" className="h-9 w-9 rounded-lg object-contain" />
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-brand-secondary">{centreName}</h1>
            <p className="text-xs text-gray-500">Court booking · {formatINR(rate, { withDecimals: false })}/hour</p>
          </div>
          {/* The court's clock, so nobody is booking against a phone that
              thinks it's in another timezone. */}
          <div className="shrink-0 text-right">
            <p className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wide text-gray-400">
              <Clock size={10} /> Court time
            </p>
            <p className="text-xs font-semibold tabular-nums text-brand-secondary">{clockLabel(clock)}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-5 px-4 pt-5">
        {/* Single slot vs monthly plan */}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
          {([
            { key: 'SLOT' as Mode, label: 'Single slot', icon: CalendarDays },
            { key: 'PLAN' as Mode, label: 'Monthly plan', icon: Repeat },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setMode(key); setError(''); }}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition',
                mode === key ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500',
              )}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {mode === 'PLAN' && (
          <div className="rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-3">
            <p className="text-xs leading-relaxed text-brand-secondary">
              Book the same hour every week for a month at{' '}
              <strong>{formatINR(planRate, { withDecimals: false })}/hour</strong> instead of{' '}
              {formatINR(rate, { withDecimals: false })}. The hour is reserved for you all month —
              a week you can&apos;t make isn&apos;t credited, because nobody else could take it.
            </p>
          </div>
        )}

        {/* Month */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-brand-secondary">
            <Calendar size={14} /> Month
          </label>
          <div className={cn('grid gap-2', months.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
            {months.map((m) => (
              <button
                key={m}
                onClick={() => { setMonth(m); setError(''); }}
                className={cn(
                  'rounded-lg border py-2 text-xs font-medium transition',
                  month === m
                    ? 'border-brand-primary bg-brand-primary text-white'
                    : 'border-gray-200 bg-white text-gray-600',
                )}
              >
                {monthLabel(m)}
              </button>
            ))}
          </div>
          {months.length === 1 && (
            <p className="mt-1.5 text-[11px] text-gray-400">
              {monthLabel(nextMonth(months[0]))} opens on the 25th.
            </p>
          )}
        </div>

        {mode === 'SLOT' ? (
          <>
            {/* Date */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-brand-secondary">
                <CalendarDays size={14} /> Pick a date
              </label>
              {dates.length === 0 ? (
                <p className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
                  Nothing left in {monthLabel(month)}. Try the other month.
                </p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {dates.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDate(d)}
                      className={cn(
                        'shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition',
                        date === d
                          ? 'border-brand-primary bg-brand-primary text-white'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                      )}
                    >
                      {dayLabel(d)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Hours */}
            {date && (
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-brand-secondary">
                  <Clock size={14} /> Pick a time
                </label>
                {!hasAvailable ? (
                  <p className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
                    Nothing free on {dayLabel(date)}. Try another date.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {shownSlots.map((s) => {
                      const past = s.state === 'PAST';
                      return (
                        <button
                          key={s.hour}
                          disabled={past}
                          onClick={() => { setPicked(s.hour); setHours(1); }}
                          className={cn(
                            'rounded-lg border-2 py-2.5 text-xs font-semibold transition',
                            past
                              ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 line-through'
                              : picked === s.hour
                                ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                                : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200',
                          )}
                        >
                          {formatHourRange(s.hour)}
                        </button>
                      );
                    })}
                  </div>
                )}
                {shownSlots.some((s) => s.state === 'PAST') && (
                  <p className="mt-1.5 text-[11px] text-gray-400">
                    Crossed-out hours have already started.
                  </p>
                )}
              </div>
            )}

            {picked && maxHours > 1 && (
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-brand-secondary">How long?</label>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: maxHours }, (_, i) => i + 1).map((h) => (
                    <button
                      key={h}
                      onClick={() => setHours(h)}
                      className={cn(
                        'rounded-lg border-2 py-2 text-xs font-semibold transition',
                        hours === h
                          ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                          : 'border-gray-100 bg-white text-gray-600',
                      )}
                    >
                      {h} hr
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Weekday */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-brand-secondary">
                <Repeat size={14} /> Which day, every week?
              </label>
              {planWeekdays.length === 0 ? (
                <p className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
                  Nothing left in {monthLabel(month)}. Try the other month.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {planWeekdays.map((w) => (
                    <button
                      key={w}
                      onClick={() => setPlanWeekday(w)}
                      className={cn(
                        'rounded-lg border py-2 text-xs font-medium transition',
                        planWeekday === w
                          ? 'border-brand-primary bg-brand-primary text-white'
                          : 'border-gray-200 bg-white text-gray-600',
                      )}
                    >
                      {WEEKDAY_NAMES[w]}s
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Hour, restricted to those free on every remaining occurrence */}
            {planWeekday !== null && (
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-brand-secondary">
                  <Clock size={14} /> Which hour?
                </label>
                {planHourOptions.length === 0 ? (
                  <p className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
                    No single hour is free on every {WEEKDAY_NAMES[planWeekday]} left this month.
                    Book single slots instead, or try the other month.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {planHourOptions.map((h) => (
                      <button
                        key={h}
                        onClick={() => setPlanHour(h)}
                        className={cn(
                          'rounded-lg border-2 py-2.5 text-xs font-semibold transition',
                          planHour === h
                            ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                            : 'border-gray-100 bg-white text-gray-600',
                        )}
                      >
                        {formatHourRange(h)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {planHour && planDates.length > 0 && (
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <p className="text-sm font-semibold text-brand-secondary">
                  {planDates.length} session{planDates.length > 1 ? 's' : ''} in {monthLabel(month)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {planDates.map((d) => (
                    <span key={d} className="rounded-md bg-gray-50 px-2 py-1 text-[11px] text-gray-600">
                      {dayLabel(d)}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  {planDates.length} × {formatINR(planRate, { withDecimals: false })} ={' '}
                  <strong className="text-brand-secondary">{formatINR(total, { withDecimals: false })}</strong>
                  {' — you save '}
                  {formatINR((rate - planRate) * planDates.length, { withDecimals: false })}
                </p>
              </div>
            )}
          </>
        )}

        {readyToPay && (
          <>
            <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-4">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <User size={13} /> Your name
                </label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-brand-primary focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <Phone size={13} /> Phone
                </label>
                <input value={phone} inputMode="numeric"
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-brand-primary focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <Mail size={13} /> Email <span className="text-gray-400">(for your confirmation)</span>
                </label>
                <input value={email} type="email" inputMode="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-brand-primary focus:outline-none" />
              </div>
            </div>

            {/* How many playing — a single slot only. On a monthly plan the
                numbers vary week to week, so guests are settled on the day
                rather than pre-paid for every session in the month. */}
            {mode === 'SLOT' && (
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-secondary">How many playing?</p>
                    <p className="text-xs text-gray-400">
                      Up to {INCLUDED_PLAYERS} included ·{' '}
                      {formatINR(GUEST_FEE_PAISE, { withDecimals: false })} per extra guest
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPlayers((p) => Math.max(1, p - 1))}
                      disabled={players <= 1}
                      className="h-9 w-9 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30"
                    >−</button>
                    <span className="w-6 text-center text-base font-bold text-brand-secondary">{players}</span>
                    <button
                      type="button"
                      onClick={() => setPlayers((p) => Math.min(12, p + 1))}
                      className="h-9 w-9 rounded-lg border border-gray-200 text-gray-600"
                    >+</button>
                  </div>
                </div>
                {guestTotal > 0 && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                    {players - INCLUDED_PLAYERS} guest{players - INCLUDED_PLAYERS > 1 ? 's' : ''} over{' '}
                    {INCLUDED_PLAYERS} — {formatINR(guestTotal, { withDecimals: false })} added.
                  </p>
                )}
              </div>
            )}

            {/* Extras — a single slot only. Shuttles across a whole month are
                sorted on the day, not pre-paid five weeks ahead. */}
            {mode === 'SLOT' && (
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <p className="mb-2 text-sm font-semibold text-brand-secondary">Need anything?</p>
                <div className="space-y-2">
                  {COURT_ADDONS.map((a) => {
                    const qty = addOns[a.key] ?? 0;
                    return (
                      <div key={a.key} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-700">{a.label}</p>
                          <p className="text-xs text-gray-400">{formatINR(a.pricePaise, { withDecimals: false })} each</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setAddOns((p) => ({ ...p, [a.key]: Math.max(0, (p[a.key] ?? 0) - 1) }))}
                            disabled={qty === 0}
                            className="h-8 w-8 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30"
                          >−</button>
                          <span className="w-5 text-center text-sm font-semibold">{qty}</span>
                          <button
                            type="button"
                            onClick={() => setAddOns((p) => ({ ...p, [a.key]: Math.min(10, (p[a.key] ?? 0) + 1) }))}
                            className="h-8 w-8 rounded-lg border border-gray-200 text-gray-600"
                          >+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rules — shown before payment, and repeated in the email, so what
                someone agreed to on the page is what reaches their inbox. */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-800">
                Court rules
              </p>
              <ul className="space-y-1.5">
                {COURT_RULES.map((r) => (
                  <li key={r} className="flex gap-2 text-xs leading-relaxed text-amber-900">
                    <span className="mt-0.5 shrink-0">•</span>{r}
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={rulesAccepted}
                  onChange={(e) => setRulesAccepted(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-xs font-medium text-amber-900">
                  I&apos;ve read and agree to the court rules
                </span>
              </label>
            </div>

            {/* Pay */}
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <div className="mb-3 text-center">
                <p className="text-xs text-gray-500">Amount</p>
                <p className="text-2xl font-bold text-brand-secondary">
                  {formatINR(total, { withDecimals: false })}
                </p>
                <p className="text-[11px] text-gray-400">
                  {mode === 'SLOT'
                    ? `${dayLabel(date)} · ${formatHourRange(picked!, hours)}`
                    : `${WEEKDAY_NAMES[planWeekday!]}s, ${formatHourRange(planHour!)} · ${planDates.length} session${planDates.length > 1 ? 's' : ''}`}
                </p>
                {mode === 'SLOT' && (extrasTotal > 0 || guestTotal > 0) && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    Court {formatINR(rate * hours, { withDecimals: false })}
                    {extrasTotal > 0 && <> + extras {formatINR(extrasTotal, { withDecimals: false })}</>}
                    {guestTotal > 0 && <> + guests {formatINR(guestTotal, { withDecimals: false })}</>}
                  </p>
                )}
              </div>

              <UpiQrCode upiUrl={upiUrl} className="border-gray-100" />

              <a href={upiUrl}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white active:scale-95">
                Open UPI app
              </a>

              {/* The deep link does not work everywhere — some browsers block
                  it, and a phone with several UPI apps can fail to pick one.
                  This is the way through when that happens, so it says so
                  rather than sitting there as an unexplained row of text. */}
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-2 text-xs text-gray-600">
                  Button not working? Copy this UPI ID and pay from any UPI app
                  &mdash; GPay, PhonePe, Paytm or your bank&rsquo;s.
                </p>
                <button
                  onClick={async () => { await copy(UPI_ID); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2.5"
                >
                  <span className="font-mono text-sm font-semibold text-brand-secondary">{UPI_ID}</span>
                  <span className={cn(
                    'flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold',
                    copied ? 'text-green-700' : 'text-brand-primary',
                  )}>
                    {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </span>
                </button>
                <p className="mt-2 text-[11px] text-gray-500">
                  Send exactly {formatINR(total, { withDecimals: false })}, then upload the
                  screenshot below.
                </p>
              </div>
            </div>

            {/* Proof */}
            <label className={cn(
              'flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed py-5 transition',
              shotPreview ? 'border-green-300 bg-green-50/40' : 'border-gray-300 bg-white',
            )}>
              {shotPreview
                ? <img src={shotPreview} alt="" className="mb-2 h-24 rounded object-contain" />
                : <Upload size={22} className="mb-1.5 text-gray-400" />}
              <span className="text-xs text-gray-500">
                {shotPreview ? 'Tap to change' : 'Upload payment screenshot (optional)'}
              </span>
              <input type="file" accept="image/*" onChange={onShot} className="hidden" />
            </label>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700">
                <AlertCircle size={14} className="shrink-0" /> {error}
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {submitting
                ? <><Loader2 size={16} className="animate-spin" /> Booking…</>
                : mode === 'PLAN' ? 'Confirm monthly plan' : 'Confirm booking'}
            </button>
            <p className="text-center text-[11px] text-gray-400">
              Your {mode === 'PLAN' ? 'hours are' : 'slot is'} held straight away and confirmed once payment is verified.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
