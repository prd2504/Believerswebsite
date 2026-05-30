import { useState, useEffect, useMemo, useCallback } from 'react';
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
  Calendar,
  BadgeIndianRupee,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatINR } from '@bba/shared';
import {
  SLOT_PLANS,
  SlotPlanType,
  SlotBookingStatus,
  type SlotBookingDocument,
  type SlotPlanConfig,
} from '@bba/shared';
import {
  subscribeToBookings,
  createBooking,
  checkDuplicatePhone,
} from '@/services/slotBookingService';

// ── Centre config ───────────────────────────────────────────────────────────

interface CentreConfig {
  centreId: string;
  name: string;
  upiId: string;
  upiQrPath: string;
}

const CENTRE_SLUG_MAP: Record<string, CentreConfig> = {
  ruia: {
    centreId: 'ruia-college',
    name: 'Ruia College',
    upiId: 'getepay.tdmcblqr413065',
    upiQrPath: '/upi-qr-ruia.png',
  },
};

// ── Time slot labels ────────────────────────────────────────────────────────

const TIME_SLOT_LABELS: Record<string, string> = {
  '06:00-07:00': '6:00 – 7:00 AM',
  '07:00-08:00': '7:00 – 8:00 AM',
  '08:00-09:00': '8:00 – 9:00 AM',
  '07:00-09:00': '7:00 – 9:00 AM (Saturday)',
};

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(m: string): string {
  const [y, mo] = m.split('-');
  const d = new Date(Number(y), Number(mo) - 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// ── Live names section ──────────────────────────────────────────────────────

function LiveSlotDisplay({
  bookings,
  timeSlot,
  label,
}: {
  bookings: SlotBookingDocument[];
  timeSlot: string;
  label: string;
}) {
  const names = bookings.filter((b) => {
    if (b.timeSlot === timeSlot) return true;
    if (
      b.planType === SlotPlanType.COMPLETE_BUNDLE &&
      timeSlot === '07:00-09:00' &&
      b.timeSlot !== '07:00-09:00'
    )
      return true;
    if (
      b.planType === SlotPlanType.COMPLETE_BUNDLE &&
      timeSlot !== '07:00-09:00' &&
      b.timeSlot === timeSlot
    )
      return true;
    return false;
  });

  // For Saturday slot, also include Complete Bundle bookings
  const saturdayNames =
    timeSlot === '07:00-09:00'
      ? bookings.filter(
          (b) =>
            b.planType === SlotPlanType.COMPLETE_BUNDLE ||
            (b.planType === SlotPlanType.GAMES_DAY && b.timeSlot === '07:00-09:00'),
        )
      : names;

  const displayNames = timeSlot === '07:00-09:00' ? saturdayNames : names;

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-brand-primary" />
          <h3 className="text-sm font-semibold text-brand-secondary">{label}</h3>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-brand-primary/10 px-2.5 py-1">
          <Users size={13} className="text-brand-primary" />
          <span className="text-xs font-semibold text-brand-primary">{displayNames.length}</span>
        </div>
      </div>
      {displayNames.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No bookings yet — be the first!</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {displayNames.map((b) => (
            <span
              key={b.id}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                b.status === SlotBookingStatus.CONFIRMED
                  ? 'bg-green-50 text-green-700'
                  : 'bg-amber-50 text-amber-700',
              )}
            >
              {b.status === SlotBookingStatus.CONFIRMED ? (
                <Check size={11} />
              ) : (
                <Clock size={11} />
              )}
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
  selected,
  onSelect,
}: {
  plan: SlotPlanConfig;
  selected: boolean;
  onSelect: () => void;
}) {
  const isBest = plan.planType === SlotPlanType.COMPLETE_BUNDLE;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative w-full rounded-xl border-2 p-4 text-left transition-all',
        selected
          ? 'border-brand-primary bg-brand-primary/5 shadow-md'
          : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm',
      )}
    >
      {isBest && (
        <span className="absolute -top-2.5 right-3 rounded-full bg-brand-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Best Value
        </span>
      )}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-brand-secondary">{plan.label}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{plan.description}</p>
          <p className="mt-1 text-xs text-gray-400">{plan.days}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-brand-primary">
            {formatINR(plan.amountPaise, { withDecimals: false })}
          </p>
          <p className="text-[10px] text-gray-400">/month</p>
        </div>
      </div>
      {selected && (
        <div className="absolute right-3 bottom-3">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-primary">
            <Check size={12} className="text-white" />
          </div>
        </div>
      )}
    </button>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

type Step = 'browse' | 'form' | 'payment' | 'success';

export default function BookingPortal() {
  const { centreSlug } = useParams<{ centreSlug: string }>();
  const config = centreSlug ? CENTRE_SLUG_MAP[centreSlug] : undefined;

  const [month] = useState(getCurrentMonth);
  const [bookings, setBookings] = useState<SlotBookingDocument[]>([]);
  const [step, setStep] = useState<Step>('browse');

  // Form state
  const [selectedPlan, setSelectedPlan] = useState<SlotPlanConfig | null>(null);
  const [timeSlot, setTimeSlot] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [upiTxnId, setUpiTxnId] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Real-time subscription
  useEffect(() => {
    if (!config) return;
    const unsubscribe = subscribeToBookings(config.centreId, month, setBookings);
    return unsubscribe;
  }, [config, month]);

  // Group bookings for display
  const weekdaySlots = ['06:00-07:00', '07:00-08:00', '08:00-09:00'];
  const saturdaySlot = '07:00-09:00';

  const handleSelectPlan = useCallback((plan: SlotPlanConfig) => {
    setSelectedPlan(plan);
    setTimeSlot('');
    setStep('form');
  }, []);

  const handleCopyUpi = useCallback(async () => {
    if (!config) return;
    try {
      await navigator.clipboard.writeText(config.upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = config.upiId;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [config]);

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
    if (!timeSlot && selectedPlan.timeSlots.length > 1) {
      setError('Please select a time slot');
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

      const finalTimeSlot =
        selectedPlan.timeSlots.length === 1 ? selectedPlan.timeSlots[0] : timeSlot;

      await createBooking({
        centreId: config.centreId,
        month,
        participantName: name.trim(),
        participantPhone: cleanPhone,
        participantEmail: email.trim() || undefined,
        planType: selectedPlan.planType,
        timeSlot: finalTimeSlot,
        amountPaise: selectedPlan.amountPaise,
        upiTransactionId: upiTxnId.trim() || undefined,
      });

      setStep('success');
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [config, selectedPlan, name, phone, email, timeSlot, upiTxnId, month]);

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

  // ── Success ───────────────────────────────────────────────────────────────

  if (step === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h1 className="mt-5 text-xl font-bold text-brand-secondary">Booking Submitted!</h1>
          <p className="mt-2 text-sm text-gray-500">
            {upiTxnId.trim()
              ? 'Your booking is pending verification. Once the admin confirms your payment, your name will appear in green on the live list.'
              : 'Please complete the UPI payment and share the transaction ID with the admin. Your booking will be confirmed once payment is verified.'}
          </p>
          <div className="mt-6 rounded-xl border border-gray-100 bg-white p-4 text-left text-sm">
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
                <span className="text-gray-500">Amount</span>
                <span className="font-medium text-brand-primary">
                  {selectedPlan ? formatINR(selectedPlan.amountPaise, { withDecimals: false }) : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Month</span>
                <span className="font-medium text-brand-secondary">{formatMonth(month)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setStep('browse');
              setSelectedPlan(null);
              setName('');
              setPhone('');
              setEmail('');
              setUpiTxnId('');
              setTimeSlot('');
              setError('');
            }}
            className="mt-6 w-full rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-primary/90 transition"
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

      <main className="mx-auto max-w-lg px-4 pb-8 pt-4">
        {/* Live slots */}
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <h2 className="text-sm font-bold text-brand-secondary">Live Bookings</h2>
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
              />
            ))}

            <h3 className="mt-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Saturday — Games Day
            </h3>
            <LiveSlotDisplay
              bookings={bookings}
              timeSlot={saturdaySlot}
              label={TIME_SLOT_LABELS[saturdaySlot]}
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
                  selected={false}
                  onSelect={() => handleSelectPlan(plan)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Step: Form */}
        {(step === 'form' || step === 'payment') && selectedPlan && (
          <section className="space-y-5">
            {/* Selected plan summary */}
            <div className="rounded-xl border-2 border-brand-primary/30 bg-brand-primary/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-brand-secondary">{selectedPlan.label}</h3>
                  <p className="text-xs text-gray-500">{selectedPlan.days}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-brand-primary">
                    {formatINR(selectedPlan.amountPaise, { withDecimals: false })}
                  </p>
                </div>
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
                Change plan
              </button>
            </div>

            {/* Time slot picker (only for weekday plans with multiple slots) */}
            {selectedPlan.timeSlots.length > 1 && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                  Select Time Slot <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {selectedPlan.timeSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setTimeSlot(slot)}
                      className={cn(
                        'rounded-lg border-2 px-3 py-2.5 text-xs font-medium transition-all',
                        timeSlot === slot
                          ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                          : 'border-gray-100 text-gray-600 hover:border-gray-200',
                      )}
                    >
                      {TIME_SLOT_LABELS[slot]}
                    </button>
                  ))}
                </div>
              </div>
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
                  <Mail size={13} /> Email <span className="text-xs text-gray-400">(optional)</span>
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

            {/* Payment section */}
            {step === 'form' && (
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
                  setError('');
                  setStep('payment');
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-primary/90 transition"
              >
                Proceed to Payment <ChevronRight size={16} />
              </button>
            )}

            {step === 'payment' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-100 bg-white p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-brand-secondary">
                    <BadgeIndianRupee size={16} className="text-brand-primary" />
                    Pay via UPI
                  </h3>

                  {/* UPI QR Code */}
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

                  {/* UPI ID */}
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
                          copied
                            ? 'bg-green-100 text-green-700'
                            : 'bg-brand-primary text-white hover:bg-brand-primary/90',
                        )}
                      >
                        {copied ? (
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

                  {/* Amount */}
                  <div className="mb-4 rounded-lg bg-green-50 p-3 text-center">
                    <p className="text-xs text-green-600">Amount to Pay</p>
                    <p className="text-2xl font-bold text-green-700">
                      {formatINR(selectedPlan.amountPaise, { withDecimals: false })}
                    </p>
                  </div>

                  {/* UPI Transaction ID */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-600">
                      UPI Transaction / Reference ID
                      <span className="ml-1 text-gray-400">(recommended)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Enter UPI transaction ID after payment"
                      value={upiTxnId}
                      onChange={(e) => setUpiTxnId(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    />
                    <p className="mt-1 text-[11px] text-gray-400">
                      You can find this in your UPI app's payment history. Providing it speeds up
                      verification.
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-primary/90 disabled:opacity-60 transition"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Submitting…
                    </>
                  ) : (
                    <>
                      <Check size={16} /> Submit Booking
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="w-full text-center text-xs font-medium text-gray-500 hover:text-gray-700"
                >
                  Go back to edit details
                </button>
              </div>
            )}

            {error && step === 'form' && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                <AlertCircle size={14} />
                {error}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white py-4 text-center">
        <p className="text-xs text-gray-400">
          BBA Sports Academy &middot; First come, first served &middot; Monthly admissions
        </p>
      </footer>
    </div>
  );
}
