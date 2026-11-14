/**
 * RETIRED — no longer routed. /book/<slug> now redirects to /fees via
 * BookingRedirect.tsx.
 *
 * This portal wrote a slotBooking document and nothing else: no payment
 * record, no invoice number, no receipt email. Bookings taken here were
 * therefore absent from the payment ledger and from the CA's invoice
 * sequence, and had to be reconciled by hand from WhatsApp screenshots.
 * /fees does all of that in one flow, so Ruia now uses it like every other
 * centre.
 *
 * Kept in the tree (rather than deleted) so the flow can be restored quickly
 * if the standalone portal is ever wanted again — re-point the /book route at
 * this component. Note it would need its UPI ID kept in step with
 * CENTRE_FEE_CONFIG in FeesPortal.tsx; they had already drifted apart once.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Check,
  Copy,
  ChevronRight,
  Clock,
  Users,
  Phone,
  Mail,
  User,
  BadgeIndianRupee,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  Zap,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatINR } from '@bba/shared';
import {
  SLOT_PLANS,
  SlotPlanType,
  SlotBookingStatus,
  DEFAULT_SLOT_CONFIG,
  TUE_THU_SLOT,
  isBookingWindowOpen,
  getSlotPlanDays,
  type SlotBookingDocument,
  type SlotPlanConfig,
  type SlotBookingConfig,
} from '@bba/shared';
import {
  subscribeToBookings,
  subscribeToConfig,
  createBooking,
  checkDuplicatePhone,
} from '@/services/slotBookingService';

// ── Centre config ───────────────────────────────────────────────────────────

interface CentreConfig {
  centreId: string;
  name: string;
  upiId: string;
  upiQrPath: string;
  whatsappGroupUrl: string;
}

const CENTRE_SLUG_MAP: Record<string, CentreConfig> = {
  ruia: {
    centreId: 'ruia-college',
    name: 'Ruia College',
    // Must match CENTRE_FEE_CONFIG.RUI in FeesPortal.tsx — these drifted apart
    // once and Ruia advertised two different payees depending on entry point.
    upiId: '85287401@ubin',
    upiQrPath: '/upi-qr-ruia.png',
    whatsappGroupUrl: 'https://chat.whatsapp.com/IMOn7V1P8KZAIPCW3zJhpt',
  },
};

// ── Time slot labels ────────────────────────────────────────────────────────

const TIME_SLOT_LABELS: Record<string, string> = {
  '06:00-07:00': '6:00 – 7:00 AM',
  '07:00-08:00': '7:00 – 8:00 AM',
  '08:00-09:00': '8:00 – 9:00 AM',
  '07:00-09:00': '7:00 – 9:00 AM',
  [TUE_THU_SLOT]: '6:00 – 7:00 AM (Tue/Thu)',
};

/** Indexed by JS day number (0=Sun … 6=Sat) — matches getSlotPlanDays(). */
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getBookingMonth(): string {
  const d = new Date();
  const target = d.getDate() >= 25
    ? new Date(d.getFullYear(), d.getMonth() + 1, 1)
    : new Date(d.getFullYear(), d.getMonth(), 1);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(m: string): string {
  const [y, mo] = m.split('-');
  const d = new Date(Number(y), Number(mo) - 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// ── Capacity helpers ────────────────────────────────────────────────────────

function isSaturdaySlot(slot: string) {
  return slot === '07:00-09:00';
}

function getSlotCount(bookings: SlotBookingDocument[], timeSlot: string): number {
  if (isSaturdaySlot(timeSlot)) {
    return bookings.filter(
      (b) => b.planType === SlotPlanType.COMPLETE_BUNDLE || b.planType === SlotPlanType.GAMES_DAY,
    ).length;
  }
  return bookings.filter(
    (b) =>
      b.timeSlot === timeSlot &&
      (b.planType === SlotPlanType.TWO_DAY ||
        b.planType === SlotPlanType.THREE_DAY ||
        b.planType === SlotPlanType.FOUR_DAY ||
        b.planType === SlotPlanType.COMPLETE_BUNDLE),
  ).length;
}

// ── WhatsApp message helper ─────────────────────────────────────────────────

function buildWhatsAppMessage(
  name: string,
  plan: SlotPlanConfig,
  timeSlot: string,
  month: string,
  centreName: string,
): string {
  const slotLabel = isSaturdaySlot(timeSlot)
    ? `${TIME_SLOT_LABELS[timeSlot]} (Saturday)`
    : TIME_SLOT_LABELS[timeSlot] ?? timeSlot;
  return (
    `Hi! I've booked my slot at ${centreName} Morning Badminton for ${formatMonth(month)}.\n\n` +
    `📋 Booking Details:\n` +
    `• Name: ${name}\n` +
    `• Plan: ${plan.label} (${plan.days})\n` +
    `• Time Slot: ${slotLabel}\n` +
    `• Month: ${formatMonth(month)}\n` +
    `• Amount: ${formatINR(plan.amountPaise, { withDecimals: false })}\n\n` +
    `✅ Payment done! Please find my payment screenshot below.`
  );
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ── Live names section ──────────────────────────────────────────────────────

function LiveSlotDisplay({
  bookings,
  timeSlot,
  label,
  capacity,
  isClosed,
}: {
  bookings: SlotBookingDocument[];
  timeSlot: string;
  label: string;
  capacity: number;
  isClosed: boolean;
}) {
  const displayNames = isSaturdaySlot(timeSlot)
    ? bookings.filter(
        (b) => b.planType === SlotPlanType.COMPLETE_BUNDLE || b.planType === SlotPlanType.GAMES_DAY,
      )
    : bookings.filter(
        (b) =>
          b.timeSlot === timeSlot &&
          (b.planType === SlotPlanType.TWO_DAY ||
            b.planType === SlotPlanType.THREE_DAY ||
            b.planType === SlotPlanType.FOUR_DAY ||
            b.planType === SlotPlanType.COMPLETE_BUNDLE),
      );

  const count = displayNames.length;
  const isFull = count >= capacity;
  const fillPercent = capacity > 0 ? Math.min(100, Math.round((count / capacity) * 100)) : 0;
  const blocked = isClosed || isFull;

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        blocked ? 'border-red-100 bg-red-50/30' : 'border-gray-100 bg-white',
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={15} className={blocked ? 'text-red-400' : 'text-brand-primary'} />
          <h3 className="text-sm font-semibold text-brand-secondary">{label}</h3>
          {blocked && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">
              {isClosed ? 'Closed' : 'Full'}
            </span>
          )}
        </div>
        <div
          className={cn(
            'flex items-center gap-1 rounded-full px-2.5 py-1',
            blocked ? 'bg-red-100' : 'bg-brand-primary/10',
          )}
        >
          <Users size={12} className={blocked ? 'text-red-500' : 'text-brand-primary'} />
          <span
            className={cn(
              'text-xs font-semibold',
              blocked ? 'text-red-500' : 'text-brand-primary',
            )}
          >
            {count}/{capacity}
          </span>
        </div>
      </div>

      {/* Fill bar */}
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            blocked ? 'bg-red-400' : fillPercent >= 80 ? 'bg-amber-400' : 'bg-green-400',
          )}
          style={{ width: `${fillPercent}%` }}
        />
      </div>

      {displayNames.length === 0 ? (
        <p className="text-xs italic text-gray-400">No bookings yet — be the first!</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {displayNames.map((b) => (
            <span
              key={b.id}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                b.status === SlotBookingStatus.CONFIRMED
                  ? 'bg-green-50 text-green-700'
                  : 'bg-blue-50 text-blue-700',
              )}
            >
              {b.status === SlotBookingStatus.CONFIRMED ? <Check size={11} /> : <User size={11} />}
              {b.participantName}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Plan card ───────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  bookings,
  portalConfig,
  onSelect,
}: {
  plan: SlotPlanConfig;
  bookings: SlotBookingDocument[];
  portalConfig: SlotBookingConfig | null;
  onSelect: () => void;
}) {
  const isBest = plan.planType === SlotPlanType.COMPLETE_BUNDLE;
  const isGameDay = plan.planType === SlotPlanType.GAMES_DAY;

  const satCap = portalConfig?.saturdayCapacity ?? DEFAULT_SLOT_CONFIG.saturdayCapacity;
  const satCount = getSlotCount(bookings, '07:00-09:00');
  const gamesDayFull = isGameDay && satCount >= satCap;
  const isDisabled = gamesDayFull;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isDisabled}
      className={cn(
        'relative w-full rounded-xl border-2 bg-white p-4 text-left transition-all',
        isDisabled
          ? 'cursor-not-allowed border-gray-100 opacity-60'
          : 'cursor-pointer border-gray-100 hover:border-brand-primary/40 hover:shadow-sm active:scale-[0.98]',
      )}
    >
      {isBest && !isDisabled && (
        <span className="absolute -top-2.5 right-3 rounded-full bg-brand-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Best Value
        </span>
      )}
      {isDisabled && (
        <span className="absolute -top-2.5 right-3 flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          <Lock size={9} /> Full
        </span>
      )}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-brand-secondary">{plan.label}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{plan.description}</p>
          <p className="mt-1 text-xs text-gray-400">{plan.days}</p>
          {isGameDay && (
            <p
              className={cn(
                'mt-1 text-xs font-medium',
                gamesDayFull ? 'text-red-500' : 'text-green-600',
              )}
            >
              {satCount}/{satCap} slots filled
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-brand-primary">
            {formatINR(plan.amountPaise, { withDecimals: false })}
          </p>
          <p className="text-[10px] text-gray-400">/month</p>
        </div>
      </div>
    </button>
  );
}

// ── Step instruction card ────────────────────────────────────────────────────

function StepCard({
  num,
  title,
  desc,
  highlight,
}: {
  num: number;
  title: string;
  desc: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl border p-3',
        highlight ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white',
      )}
    >
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white',
          highlight ? 'bg-amber-500' : 'bg-brand-primary',
        )}
      >
        {num}
      </div>
      <div>
        <p className="text-sm font-semibold text-brand-secondary">{title}</p>
        <p className="mt-0.5 text-xs text-gray-500">{desc}</p>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

type Step = 'browse' | 'form' | 'payment' | 'success';

export default function BookingPortal() {
  const { centreSlug } = useParams<{ centreSlug: string }>();
  const config = centreSlug ? CENTRE_SLUG_MAP[centreSlug] : undefined;

  const [month] = useState(getBookingMonth);
  const [bookings, setBookings] = useState<SlotBookingDocument[]>([]);
  const [portalConfig, setPortalConfig] = useState<SlotBookingConfig | null>(null);
  const [step, setStep] = useState<Step>('browse');

  const [selectedPlan, setSelectedPlan] = useState<SlotPlanConfig | null>(null);
  const [timeSlot, setTimeSlot] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  // Weekdays the participant will attend — asked only when the plan leaves a
  // choice (2-day, 4-day); derived automatically otherwise. Drives the roster.
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  // Ticks so a page left open before the window opens unlocks by itself.
  const [now, setNow] = useState(() => new Date());
  const [upiCopied, setUpiCopied] = useState(false);
  const [msgCopied, setMsgCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!config) return;
    const unsub1 = subscribeToBookings(config.centreId, month, setBookings);
    const unsub2 = subscribeToConfig(config.centreId, setPortalConfig);
    return () => {
      unsub1();
      unsub2();
    };
  }, [config, month]);

  const weekdayCapacity = portalConfig?.weekdayCapacity ?? DEFAULT_SLOT_CONFIG.weekdayCapacity;
  const saturdayCapacity = portalConfig?.saturdayCapacity ?? DEFAULT_SLOT_CONFIG.saturdayCapacity;
  // Open only when the manual switch is on AND any scheduled openAt has passed.
  const isPortalOpen = isBookingWindowOpen(
    portalConfig ? { isOpen: portalConfig.isOpen, openAt: portalConfig.openAt } : null,
    now,
  );
  const planDays = selectedPlan ? getSlotPlanDays(selectedPlan.planType) : null;
  const daysSatisfied = !planDays || selectedDays.length === planDays.pick;
  const closedSlots = portalConfig?.closedSlots ?? [];

  const weekdaySlots = ['06:00-07:00', '07:00-08:00', '08:00-09:00'];
  const saturdaySlot = '07:00-09:00';

  const isSlotBlocked = useCallback(
    (slot: string) => {
      if (closedSlots.includes(slot)) return true;
      const cap = isSaturdaySlot(slot) ? saturdayCapacity : weekdayCapacity;
      return getSlotCount(bookings, slot) >= cap;
    },
    [bookings, closedSlots, weekdayCapacity, saturdayCapacity],
  );

  const handleSelectPlan = useCallback((plan: SlotPlanConfig) => {
    setSelectedPlan(plan);
    setTimeSlot('');
    setStep('form');
  }, []);

  const handleCopyUpi = useCallback(async () => {
    if (!config) return;
    await copyToClipboard(config.upiId);
    setUpiCopied(true);
    setTimeout(() => setUpiCopied(false), 2000);
  }, [config]);

  const handleCopyMessage = useCallback(async () => {
    if (!config || !selectedPlan) return;
    const finalSlot =
      selectedPlan.timeSlots.length === 1 ? selectedPlan.timeSlots[0] : timeSlot;
    const msg = buildWhatsAppMessage(name, selectedPlan, finalSlot, month, config.name);
    await copyToClipboard(msg);
    setMsgCopied(true);
    setTimeout(() => setMsgCopied(false), 3000);
  }, [config, selectedPlan, name, timeSlot, month]);

  const handleSubmit = useCallback(async () => {
    if (!config || !selectedPlan) return;
    setError('');

    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!phone.trim() || phone.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }
    {
      const pd = getSlotPlanDays(selectedPlan.planType);
      if (!pd.fixed && selectedDays.length !== pd.pick) {
        setError(`Please pick exactly ${pd.pick} preferred days`);
        return;
      }
    }
    if (!timeSlot && selectedPlan.timeSlots.length > 1) {
      setError('Please select a time slot');
      return;
    }

    const finalTimeSlot =
      selectedPlan.timeSlots.length === 1 ? selectedPlan.timeSlots[0] : timeSlot;

    if (isSlotBlocked(finalTimeSlot)) {
      setError('This time slot is now full or closed. Please select a different slot.');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    setSubmitting(true);
    try {
      const isDuplicate = await checkDuplicatePhone(
        cleanPhone,
        config.centreId,
        month,
        selectedPlan.planType,
      );
      if (isDuplicate) {
        setError('A booking with this phone number already exists for this plan and month.');
        setSubmitting(false);
        return;
      }

      await createBooking({
        centreId: config.centreId,
        month,
        participantName: name.trim(),
        participantPhone: cleanPhone,
        participantEmail: email.trim() || undefined,
        planType: selectedPlan.planType,
        timeSlot: finalTimeSlot,
        selectedDays,
        amountPaise: selectedPlan.amountPaise,
      });

      setStep('success');
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [config, selectedPlan, name, phone, email, timeSlot, month, isSlotBlocked]);

  const resetForm = useCallback(() => {
    setStep('browse');
    setSelectedPlan(null);
    setName('');
    setPhone('');
    setEmail('');
    setTimeSlot('');
    setError('');
  }, []);

  // ── Not found ─────────────────────────────────────────────────────────────

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto text-gray-300" />
          <h1 className="mt-4 text-lg font-bold text-gray-700">Centre not found</h1>
          <p className="mt-1 text-sm text-gray-500">
            The booking link you followed is invalid. Please check the URL.
          </p>
        </div>
      </div>
    );
  }

  // Keep `now` fresh so a scheduled opening unlocks without a reload.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Fixed-day plans have nothing to choose — set them silently so the roster
  // still gets days. For choice plans, drop any day the new plan doesn't offer.
  useEffect(() => {
    if (!selectedPlan) { setSelectedDays([]); return; }
    const pd = getSlotPlanDays(selectedPlan.planType);
    if (pd.fixed) setSelectedDays(pd.choices);
    else setSelectedDays((prev) => prev.filter((d) => pd.choices.includes(d)));
  }, [selectedPlan]);

  function toggleDay(d: number) {
    if (!planDays || planDays.fixed) return;
    setSelectedDays((prev) => {
      if (prev.includes(d)) return prev.filter((x) => x !== d);
      if (prev.length >= planDays.pick) return prev;
      return [...prev, d].sort((a, b) => a - b);
    });
  }

  // ── Portal closed ─────────────────────────────────────────────────────────

  if (portalConfig !== null && !isPortalOpen) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-30 border-b border-gray-100 bg-white">
          <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
            <img src="/logo.png" alt="BBA Sports" className="h-9 w-9 rounded-lg object-contain" />
            <div className="flex-1">
              <h1 className="text-sm font-bold text-brand-secondary">BBA Sports Academy</h1>
              <p className="text-xs text-gray-500">{config.name} — Morning Badminton</p>
            </div>
          </div>
        </header>
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="text-center">
            <Lock size={48} className="mx-auto text-gray-300" />
            <h1 className="mt-4 text-lg font-bold text-gray-700">
              {portalConfig?.isOpen && portalConfig?.openAt ? 'Booking Opens Soon' : 'Bookings Closed'}
            </h1>
            {portalConfig?.isOpen && portalConfig?.openAt ? (
              <>
                <p className="mt-1 text-sm text-gray-500">
                  {formatMonth(month)} slots open at{' '}
                  <strong className="text-gray-700">
                    {new Date(portalConfig.openAt).toLocaleString('en-IN', {
                      day: 'numeric', month: 'short',
                      hour: 'numeric', minute: '2-digit', hour12: true,
                    })}
                  </strong>
                </p>
                <p className="mt-2 text-xs text-gray-400">
                  Keep this page open — it unlocks automatically.
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-gray-500">
                Slot bookings for {formatMonth(month)} are not open yet. Please check back later.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────

  if (step === 'success') {
    const finalSlot =
      selectedPlan?.timeSlots.length === 1 ? selectedPlan.timeSlots[0] : timeSlot;
    const whatsappMsg =
      selectedPlan && finalSlot
        ? buildWhatsAppMessage(name, selectedPlan, finalSlot, month, config.name)
        : '';

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
            <h1 className="mt-5 text-xl font-bold text-brand-secondary">Slot Booked!</h1>
            <p className="mt-2 text-sm text-gray-500">
              Now complete your payment and inform us on the WhatsApp group.
            </p>
          </div>

          {/* Booking summary */}
          <div className="mt-5 rounded-xl border border-gray-100 bg-white p-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="font-medium text-brand-secondary">{name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Plan</span>
                <span className="font-medium text-brand-secondary">{selectedPlan?.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Time Slot</span>
                <span className="font-medium text-brand-secondary">
                  {isSaturdaySlot(finalSlot)
                    ? `${TIME_SLOT_LABELS[finalSlot]} (Sat)`
                    : (TIME_SLOT_LABELS[finalSlot] ?? finalSlot)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Month</span>
                <span className="font-medium text-brand-secondary">{formatMonth(month)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2">
                <span className="font-semibold text-gray-700">Amount to Pay</span>
                <span className="font-bold text-brand-primary">
                  {selectedPlan ? formatINR(selectedPlan.amountPaise, { withDecimals: false }) : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Pre-typed message */}
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-green-800">
                📋 Pre-typed WhatsApp Message
              </p>
              <button
                onClick={handleCopyMessage}
                className={cn(
                  'flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                  msgCopied
                    ? 'bg-green-600 text-white'
                    : 'bg-green-200 text-green-800 hover:bg-green-300',
                )}
              >
                {msgCopied ? (
                  <>
                    <Check size={11} /> Copied!
                  </>
                ) : (
                  <>
                    <Copy size={11} /> Copy Message
                  </>
                )}
              </button>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg border border-green-100 bg-white p-3 text-xs leading-relaxed text-gray-700">
              {whatsappMsg}
            </pre>
          </div>

          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800">
              ⚠️ Don't forget to share your payment screenshot!
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Copy the message above → Open the group → Paste it → Attach your payment screenshot. Booking is confirmed after admin verifies.
            </p>
          </div>

          <a
            href={config.whatsappGroupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#20bd5a]"
          >
            <MessageCircle size={18} />
            Open WhatsApp Group
          </a>

          <button
            onClick={resetForm}
            className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Book Another Slot
          </button>
        </div>
      </div>
    );
  }

  // ── Main page ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <img src="/logo.png" alt="BBA Sports" className="h-9 w-9 rounded-lg object-contain" />
          <div className="flex-1">
            <h1 className="text-sm font-bold text-brand-secondary">BBA Sports Academy</h1>
            <p className="text-xs text-gray-500">{config.name} — Morning Badminton</p>
          </div>
          <span className="rounded-full bg-brand-primary/10 px-2.5 py-1 text-xs font-semibold text-brand-primary">
            {formatMonth(month)}
          </span>
        </div>
      </header>

      {/* Live blinking banner */}
      <div className="bg-gradient-to-r from-brand-primary to-orange-400 py-3 text-center">
        <div className="flex items-center justify-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
          </span>
          <p className="text-sm font-bold uppercase tracking-widest text-white">
            {formatMonth(month)} Slots Are Live
          </p>
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-white/80">
          First come, first served · Book before slots fill up!
        </p>
      </div>

      <main className="mx-auto max-w-lg px-4 pb-8 pt-4">
        {/* How to Book — step instructions */}
        {step === 'browse' && (
          <section className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Zap size={15} className="text-blue-600" />
              <h2 className="text-sm font-bold text-blue-800">How to Book Your Slot</h2>
            </div>
            <div className="space-y-2">
              <StepCard
                num={1}
                title="Select your plan below"
                desc="Choose from 2-day, 3-day, 4-day, Games Day (Sat), or Complete Bundle"
              />
              <StepCard
                num={2}
                title="Fill in your details"
                desc="Enter your name and 10-digit phone number"
              />
              <StepCard
                num={3}
                title="Pay via UPI"
                desc="Scan the QR code or copy the UPI ID to transfer the fee"
              />
              <StepCard
                num={4}
                title="Share screenshot on WhatsApp group"
                highlight
                desc="IMPORTANT: We'll prepare a message for you. Open the group, paste it, and attach your payment screenshot. Slot confirmed after admin verifies payment."
              />
            </div>
          </section>
        )}

        {/* Live slots */}
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
            </span>
            <h2 className="text-sm font-bold text-brand-secondary">
              Live Bookings — {formatMonth(month)}
            </h2>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Mon · Wed · Fri
            </h3>
            {weekdaySlots.map((slot) => (
              <LiveSlotDisplay
                key={slot}
                bookings={bookings}
                timeSlot={slot}
                label={TIME_SLOT_LABELS[slot]}
                capacity={weekdayCapacity}
                isClosed={closedSlots.includes(slot)}
              />
            ))}

            <h3 className="mt-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Tue · Thu
            </h3>
            <LiveSlotDisplay
              bookings={bookings}
              timeSlot={TUE_THU_SLOT}
              label={TIME_SLOT_LABELS[TUE_THU_SLOT]}
              capacity={weekdayCapacity}
              isClosed={closedSlots.includes(TUE_THU_SLOT)}
            />

            <h3 className="mt-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Saturday — Games Day
            </h3>
            <LiveSlotDisplay
              bookings={bookings}
              timeSlot={saturdaySlot}
              label={`${TIME_SLOT_LABELS[saturdaySlot]} (Saturday)`}
              capacity={saturdayCapacity}
              isClosed={closedSlots.includes(saturdaySlot)}
            />
          </div>
        </section>

        {/* Step: Browse Plans */}
        {step === 'browse' && (
          <section>
            <h2 className="mb-3 text-sm font-bold text-brand-secondary">Choose Your Plan</h2>
            <div className="space-y-3">
              {SLOT_PLANS.map((plan) => (
                <PlanCard
                  key={plan.planType}
                  plan={plan}
                  bookings={bookings}
                  portalConfig={portalConfig}
                  onSelect={() => handleSelectPlan(plan)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Step: Form + Payment */}
        {(step === 'form' || step === 'payment') && selectedPlan && (
          <section className="space-y-5">
            {/* Selected plan summary */}
            <div className="rounded-xl border-2 border-brand-primary/30 bg-brand-primary/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-brand-secondary">{selectedPlan.label}</h3>
                  <p className="text-xs text-gray-500">{selectedPlan.days}</p>
                </div>
                <p className="text-lg font-bold text-brand-primary">
                  {formatINR(selectedPlan.amountPaise, { withDecimals: false })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('browse');
                  setSelectedPlan(null);
                  setTimeSlot('');
                }}
                className="mt-2 text-xs font-medium text-brand-primary hover:underline"
              >
                ← Change plan
              </button>
            </div>

            {/* Time slot picker */}
            {selectedPlan.timeSlots.length > 1 && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                  Select Time Slot <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {selectedPlan.timeSlots.map((slot) => {
                    const count = getSlotCount(bookings, slot);
                    const cap = weekdayCapacity;
                    const slotFull = count >= cap;
                    const slotClosed = closedSlots.includes(slot);
                    const blocked = slotFull || slotClosed;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => !blocked && setTimeSlot(slot)}
                        disabled={blocked}
                        className={cn(
                          'rounded-lg border-2 px-2 py-2.5 text-xs font-medium transition-all',
                          blocked
                            ? 'cursor-not-allowed border-red-100 bg-red-50 text-red-400'
                            : timeSlot === slot
                              ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                              : 'border-gray-100 text-gray-600 hover:border-gray-200',
                        )}
                      >
                        <div>{TIME_SLOT_LABELS[slot]}</div>
                        <div
                          className={cn(
                            'mt-1 text-[10px]',
                            blocked ? 'text-red-400 font-semibold' : 'text-gray-400',
                          )}
                        >
                          {blocked ? (slotClosed ? 'Closed' : 'Full') : `${count}/${cap}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preferred days — only when the plan leaves a real choice. */}
            {planDays && !planDays.fixed && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                  Preferred Days <span className="text-red-500">*</span>
                  <span className="ml-1 font-normal text-gray-400">
                    (pick {planDays.pick} — {selectedDays.length}/{planDays.pick})
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {planDays.choices.map((d) => {
                    const active = selectedDays.includes(d);
                    const atLimit = !active && selectedDays.length >= planDays.pick;
                    return (
                      <button key={d} type="button" onClick={() => toggleDay(d)} disabled={atLimit}
                        className={cn(
                          'rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all',
                          active
                            ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                            : atLimit
                              ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300'
                              : 'border-gray-100 text-gray-600 hover:border-gray-200',
                        )}>
                        {DAY_LABELS[d]}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-gray-400">Tue &amp; Thu run only the 6–7 AM session.</p>
              </div>
            )}

            {planDays && planDays.fixed && planDays.choices.length > 0 && (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                Days for this plan:{' '}
                <span className="font-semibold text-gray-700">
                  {planDays.choices.map((d) => DAY_LABELS[d]).join(' · ')}
                </span>
              </p>
            )}

            {/* Participant details */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-brand-secondary">Your Details</h3>

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <User size={13} /> Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <Phone size={13} /> Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={12}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <Mail size={13} /> Email{' '}
                  <span className="text-xs text-gray-400">(optional)</span>
                </label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                />
              </div>
            </div>

            {/* Proceed to Payment */}
            {step === 'form' && (
              <>
                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!name.trim()) {
                      setError('Please enter your name');
                      return;
                    }
                    if (!phone.trim() || phone.replace(/\D/g, '').length < 10) {
                      setError('Please enter a valid 10-digit phone number');
                      return;
                    }
                    if (selectedPlan.timeSlots.length > 1 && !timeSlot) {
                      setError('Please select a time slot');
                      return;
                    }
                    const finalSlot =
                      selectedPlan.timeSlots.length === 1 ? selectedPlan.timeSlots[0] : timeSlot;
                    if (isSlotBlocked(finalSlot)) {
                      setError(
                        'This time slot is now full or closed. Please select a different slot.',
                      );
                      return;
                    }
                    if (!daysSatisfied) {
                      setError(`Please pick ${planDays?.pick ?? 0} preferred day${planDays?.pick === 1 ? '' : 's'}`);
                      return;
                    }
                    setError('');
                    setStep('payment');
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary/90"
                >
                  Proceed to Payment <ChevronRight size={16} />
                </button>
              </>
            )}

            {/* Payment step */}
            {step === 'payment' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-100 bg-white p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-brand-secondary">
                    <BadgeIndianRupee size={16} className="text-brand-primary" />
                    Pay via UPI
                  </h3>

                  <div className="mb-4 flex justify-center">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                      <img
                        src={config.upiQrPath}
                        alt="UPI QR Code"
                        className="h-48 w-48 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="mb-1.5 text-xs text-gray-500">Or pay to this UPI ID:</p>
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                      <code className="flex-1 text-sm font-semibold text-brand-secondary">
                        {config.upiId}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyUpi}
                        className={cn(
                          'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                          upiCopied
                            ? 'bg-green-100 text-green-700'
                            : 'bg-brand-primary text-white hover:bg-brand-primary/90',
                        )}
                      >
                        {upiCopied ? (
                          <>
                            <Check size={12} /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={12} /> Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg bg-green-50 p-3 text-center">
                    <p className="text-xs text-green-600">Amount to Pay</p>
                    <p className="text-2xl font-bold text-green-700">
                      {formatINR(selectedPlan.amountPaise, { withDecimals: false })}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs text-amber-800">
                    After paying, click <strong>"Confirm Booking"</strong> below. You'll get a pre-typed message to send in the WhatsApp group along with your payment screenshot.
                  </p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}

                {!daysSatisfied && !submitting && (
                  <p className="text-center text-xs text-amber-600">
                    Go back and finish selecting your preferred days.
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !daysSatisfied}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary/90 disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Booking…
                    </>
                  ) : (
                    <>
                      <Check size={16} /> Confirm Booking
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="w-full text-center text-xs font-medium text-gray-500 hover:text-gray-700"
                >
                  ← Go back to edit details
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="border-t border-gray-100 bg-white py-4 text-center">
        <p className="text-xs text-gray-400">
          BBA Sports Academy · First come, first served · Monthly admissions
        </p>
      </footer>
    </div>
  );
}
