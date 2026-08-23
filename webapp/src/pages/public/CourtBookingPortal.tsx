/**
 * Court hour booking — reachable only by direct link.
 *
 * Deliberately unlisted: no nav entry, no link from /fees, and a noindex
 * robots tag set on mount so it never turns up in search. That's a
 * discoverability choice, not a records one — the booking is stored and
 * reported for exactly what it is.
 *
 * A slot is HELD on submit, not confirmed. Payment is verified by hand in
 * Admin → Court Hours, which is also what releases or cancels the hour.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Clock, Calendar, Check, Loader2, AlertCircle, Copy, CheckCircle2, Upload, User, Phone, Mail,
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { cn } from '@/lib/cn';
import { UpiQrCode } from '@/components/common/UpiQrCode';
import {
  getCourtConfig,
  getBookingsForDate,
  createCourtBooking,
  SlotUnavailableError,
} from '@/services/courtRentalService';
import { getActiveCentres } from '@/services/centreService';
import {
  formatINR,
  COMPANY,
  buildDayAvailability,
  DEFAULT_COURT_CONFIG,
  COURT_ADDONS,
  COURT_RULES,
  addOnsTotalPaise,
  type CourtRentalConfig,
  type CourtSlot,
} from '@bba/shared';

/** Slug → centre code. Only centres that actually sell court hours. */
const SLUG_TO_CODE: Record<string, string> = { dadar: 'DAD' };

const UPI_ID = '85287401@ubin';

function nextDates(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function hour12(hhmm: string): string {
  const [h] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12} ${ampm}`;
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  }
}

export default function CourtBookingPortal() {
  const { centreSlug } = useParams<{ centreSlug: string }>();
  const centreCode = centreSlug ? SLUG_TO_CODE[centreSlug.toLowerCase()] : undefined;

  const [centreId, setCentreId] = useState('');
  const [centreName, setCentreName] = useState('');
  const [config, setConfig] = useState<CourtRentalConfig | null>(null);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<CourtSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [picked, setPicked] = useState<string | null>(null);
  const [hours, setHours] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addOns, setAddOns] = useState<Record<string, number>>({});
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [shot, setShot] = useState<File | null>(null);
  const [shotPreview, setShotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
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

  useEffect(() => {
    if (!centreCode) { setLoading(false); return; }
    getActiveCentres().then(async (centres) => {
      const c = centres.find((x) => x.centreCode === centreCode);
      if (c) {
        setCentreId(c.id);
        setCentreName(c.name);
        setConfig(await getCourtConfig(c.id));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [centreCode]);

  const cfg = config ?? { centreId, ...DEFAULT_COURT_CONFIG, updatedAt: '', updatedBy: null };

  /** Only offer days that actually sell hours. */
  const dates = useMemo(
    () => nextDates(14).filter((d) => buildDayAvailability(cfg, d, []).length > 0),
    [cfg],
  );

  useEffect(() => { if (!date && dates.length > 0) setDate(dates[0]); }, [dates, date]);

  const loadSlots = useCallback(async () => {
    if (!centreId || !date) return;
    setLoadingSlots(true);
    try {
      setSlots(buildDayAvailability(cfg, date, await getBookingsForDate(centreId, date)));
    } finally {
      setLoadingSlots(false);
    }
  }, [centreId, date, cfg]);

  useEffect(() => { loadSlots(); setPicked(null); }, [loadSlots]);

  const rate = cfg.hourlyRatePaise;
  const courtTotal = rate * hours;
  const extrasTotal = addOnsTotalPaise(addOns);
  const total = courtTotal + extrasTotal;

  /** Longest run of free hours from the picked one — caps the duration list. */
  const maxHours = useMemo(() => {
    if (!picked) return 1;
    const byHour = new Map(slots.map((s) => [s.hour, s]));
    let n = 0;
    let cur = picked;
    while (byHour.get(cur)?.state === 'AVAILABLE' && n < 4) {
      n++;
      const [h, m] = cur.split(':').map(Number);
      cur = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return Math.max(1, n);
  }, [picked, slots]);

  useEffect(() => { if (hours > maxHours) setHours(maxHours); }, [maxHours, hours]);

  const upiUrl = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent('BBA Sports')}` +
    `&am=${Math.round(total / 100)}&cu=INR&tn=${encodeURIComponent('Court booking')}`;

  function onShot(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setShot(f);
    const r = new FileReader();
    r.onload = () => setShotPreview(r.result as string);
    r.readAsDataURL(f);
  }

  async function submit() {
    if (!picked || !centreId) return;
    if (name.trim().length < 2) { setError('Please enter your name.'); return; }
    if (phone.replace(/\D/g, '').length !== 10) { setError('Please enter a 10-digit phone number.'); return; }
    if (!rulesAccepted) { setError('Please confirm you have read the court rules.'); return; }
    setSubmitting(true);
    setError('');
    try {
      let screenshotUrl: string | null = null;
      if (shot) {
        try {
          const path = `court-bookings/${centreId}/${Date.now()}_${shot.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
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

      await createCourtBooking({
        centreId,
        date,
        startHour: picked,
        hours,
        bookerName: name.trim(),
        bookerPhone: phone.replace(/\D/g, ''),
        bookerEmail: email.trim() || undefined,
        addOns,
        source: 'ONLINE',
        screenshotUrl,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof SlotUnavailableError
        ? err.message
        : 'Something went wrong. Please try again.');
      await loadSlots();   // someone else may have just taken it
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

  if (!cfg.isOpen) {
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
          <h1 className="mt-5 text-xl font-bold text-brand-secondary">Slot requested</h1>
          <p className="mt-2 text-sm text-gray-500">
            {dayLabel(date)} · {hour12(picked!)} for {hours} hour{hours > 1 ? 's' : ''}
          </p>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left">
            <p className="text-xs text-amber-800">
              Your slot is held. It&apos;s confirmed once we verify the payment — you&apos;ll get a
              call if anything is unclear. Questions: {COMPANY.supportEmail}
            </p>
          </div>
          <button
            onClick={() => { setDone(false); setPicked(null); setName(''); setPhone(''); setEmail(''); setAddOns({}); setRulesAccepted(false); setShot(null); setShotPreview(null); loadSlots(); }}
            className="mt-4 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-600"
          >
            Book another slot
          </button>
        </div>
      </div>
    );
  }

  const available = slots.filter((s) => s.state === 'AVAILABLE');

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <header className="border-b border-gray-100 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <img src="/logo.png" alt="" className="h-9 w-9 rounded-lg object-contain" />
          <div>
            <h1 className="text-sm font-bold text-brand-secondary">{centreName}</h1>
            <p className="text-xs text-gray-500">Court booking · {formatINR(rate, { withDecimals: false })}/hour</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-5 px-4 pt-5">
        {/* Date */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-brand-secondary">
            <Calendar size={14} /> Pick a date
          </label>
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
        </div>

        {/* Hours */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-brand-secondary">
            <Clock size={14} /> Pick a time
          </label>
          {loadingSlots ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
          ) : available.length === 0 ? (
            <p className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
              Nothing free on {dayLabel(date)}. Try another date.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {available.map((s) => (
                <button
                  key={s.hour}
                  onClick={() => { setPicked(s.hour); setHours(1); }}
                  className={cn(
                    'rounded-lg border-2 py-2.5 text-xs font-semibold transition',
                    picked === s.hour
                      ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                      : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200',
                  )}
                >
                  {hour12(s.hour)}
                </button>
              ))}
            </div>
          )}
        </div>

        {picked && (
          <>
            {maxHours > 1 && (
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

            {/* Extras */}
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
                  I've read and agree to the court rules
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
                  {dayLabel(date)} · {hour12(picked)} · {hours} hour{hours > 1 ? 's' : ''}
                </p>
                {extrasTotal > 0 && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    Court {formatINR(courtTotal, { withDecimals: false })}
                    {' + extras '}{formatINR(extrasTotal, { withDecimals: false })}
                  </p>
                )}
              </div>

              <UpiQrCode upiUrl={upiUrl} className="border-gray-100" />

              <a href={upiUrl}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white active:scale-95">
                Open UPI app
              </a>

              <button
                onClick={async () => { await copy(UPI_ID); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="mt-2 flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5"
              >
                <span className="font-mono text-sm text-brand-secondary">{UPI_ID}</span>
                <span className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-gray-600">
                  {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                </span>
              </button>
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
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Booking…</> : 'Confirm booking'}
            </button>
            <p className="text-center text-[11px] text-gray-400">
              Your slot is held straight away and confirmed once payment is verified.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
