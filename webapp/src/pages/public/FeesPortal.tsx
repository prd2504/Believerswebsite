import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  ChevronLeft,
  Search,
  UserPlus,
  User,
  Users,
  BadgeIndianRupee,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Upload,
  Building2,
  Calendar,
  Receipt,
  Clock,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatINR, COMPANY, SLOT_PLANS, TUE_THU_SLOT, isTueThuSlot, type SlotPlanType, type SlotBookingDocument } from '@bba/shared';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import {
  fetchActiveCentres,
  searchStudentsByCentre,
  registerStudent,
  submitFeePayment,
  type CentreOption,
  type StudentSearchResult,
  type FeeSubmissionResult,
} from '@/services/publicFeesService';
import {
  subscribeToBookings,
  subscribeToConfig,
  createBooking,
  checkDuplicatePhone,
} from '@/services/slotBookingService';

// ── Constants ───────────────────────────────────────────────────────────────

const RUIA_CENTRE_CODE = 'RUI';
const RUIA_BOOKING_CENTRE_ID = 'ruia-college';

interface CentreFeeConfig { centreCode: string; upiId: string }
const CENTRE_FEE_CONFIG: Record<string, CentreFeeConfig> = {
  DAD: { centreCode: 'DAD', upiId: '85287401@ubin' },
  RBI: { centreCode: 'RBI', upiId: '85287401@ubin' },
  RUI: { centreCode: 'RUI', upiId: '85287401@ubin' },
  BAN: { centreCode: 'BAN', upiId: '85287401@ubin' },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function getDefaultMonth(): string {
  const d = new Date();
  const target = d.getDate() >= 25
    ? new Date(d.getFullYear(), d.getMonth() + 1, 1)
    : new Date(d.getFullYear(), d.getMonth(), 1);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function getMonthOptions(): string[] {
  const now = new Date();
  return Array.from({ length: 4 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

function formatTimeSlot(slot: string): string {
  if (isTueThuSlot(slot)) return '6 – 7 AM · Tue/Thu';
  return slot.split('-').map((t) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? `${h12} ${ampm}` : `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  }).join(' – ');
}

function isSaturdaySlot(slot: string) { return slot === '07:00-09:00'; }

async function copyToClipboard(text: string) {
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }
}

/**
 * Downscale + re-encode a screenshot to a small JPEG before upload so the
 * upload is fast on mobile data. Falls back to the original file on any failure
 * or if compression doesn't actually shrink it.
 */
async function compressImage(file: File, maxDim = 1280, quality = 0.7): Promise<Blob> {
  try {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

type Step = 'centre' | 'lookup' | 'form' | 'slot' | 'payment' | 'success';

// ── Wizard state persistence ─────────────────────────────────────────────────
// Survives the round-trip to a UPI app (which can reload / evict this page on
// return). Scoped to the browser-tab session so a fresh visit always starts clean.
const PERSIST_KEY = 'bba_fees_wizard_v1';
function loadPersistedState(): Record<string, any> {
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    // Never resume into the terminal success screen (its `result` isn't persisted).
    if (!data || data.step === 'success') return {};
    return data;
  } catch { return {}; }
}

// ── Main component ─────────────────────────────────────────────────────────

export default function FeesPortal() {
  const [persisted] = useState(loadPersistedState);
  const [step, setStep] = useState<Step>(persisted.step ?? 'centre');

  // Centre
  const { data: centres = [], isLoading: centresLoading } = useQuery({
    queryKey: ['activeCentres'],
    queryFn: fetchActiveCentres,
  });
  const [selectedCentre, setSelectedCentre] = useState<CentreOption | null>(persisted.selectedCentre ?? null);
  const isRuia = selectedCentre?.centreCode === RUIA_CENTRE_CODE;

  // Lookup / autocomplete
  const [nameQuery, setNameQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(persisted.selectedStudent ?? null);
  const studentsQuery = useQuery({
    queryKey: ['centreStudents', selectedCentre?.centreCode],
    queryFn: () => searchStudentsByCentre(selectedCentre!.centreCode!),
    enabled: !!selectedCentre?.centreCode,
  });
  const filteredStudents = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return (studentsQuery.data ?? []).filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [nameQuery, studentsQuery.data]);

  // Inline register form
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');

  // Form — plan selection
  const [month, setMonth] = useState(persisted.month ?? getDefaultMonth());
  const [payerEmail, setPayerEmail] = useState(persisted.payerEmail ?? '');
  const [selectedPlanType, setSelectedPlanType] = useState<string | null>(persisted.selectedPlanType ?? null); // Ruia
  const [selectedFreqDays, setSelectedFreqDays] = useState<number | null>(persisted.selectedFreqDays ?? null); // other centres
  const [manualAmount, setManualAmount] = useState(persisted.manualAmount ?? '');
  const [useManualAmount, setUseManualAmount] = useState(persisted.useManualAmount ?? false);
  const [method, setMethod] = useState<'UPI' | 'CASH' | 'BANK_TRANSFER'>(persisted.method ?? 'UPI');

  // Slot step (Ruia only)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(persisted.selectedTimeSlot ?? null);
  const [slotPhone, setSlotPhone] = useState(persisted.slotPhone ?? '');
  const [slotError, setSlotError] = useState('');
  const [slotBookings, setSlotBookings] = useState<SlotBookingDocument[]>([]);
  const [slotConfig, setSlotConfig] = useState({ weekdayCapacity: 9, saturdayCapacity: 15 });

  // Payment
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [upiCopied, setUpiCopied] = useState(false);

  // Success
  const [result, setResult] = useState<FeeSubmissionResult | null>(null);

  // ── Real-time slot subscription (Ruia only, while on slot step) ───────────
  useEffect(() => {
    if (!isRuia || step !== 'slot') return;
    const unsub1 = subscribeToBookings(RUIA_BOOKING_CENTRE_ID, month, setSlotBookings);
    const unsub2 = subscribeToConfig(RUIA_BOOKING_CENTRE_ID, (cfg) => {
      setSlotConfig({ weekdayCapacity: cfg.weekdayCapacity, saturdayCapacity: cfg.saturdayCapacity });
    });
    return () => { unsub1(); unsub2(); };
  }, [isRuia, step, month]);

  // ── Persist wizard state (survives the UPI-app round-trip / page reload) ───
  useEffect(() => {
    try {
      sessionStorage.setItem(PERSIST_KEY, JSON.stringify({
        step, selectedCentre, selectedStudent, month, payerEmail,
        selectedPlanType, selectedFreqDays, manualAmount, useManualAmount,
        method, selectedTimeSlot, slotPhone,
      }));
    } catch { /* private mode / quota — non-fatal */ }
  }, [step, selectedCentre, selectedStudent, month, payerEmail,
      selectedPlanType, selectedFreqDays, manualAmount, useManualAmount,
      method, selectedTimeSlot, slotPhone]);

  // ── Derived: fee plans available (own enrollment or centre-wide fallback for new students) ──
  const availablePlans = useMemo(() => {
    const own = selectedStudent?.frequencyPlans ?? [];
    if (own.length > 0) return own;
    // New registration: aggregate unique plans from all centre students
    const seen = new Map<number, number>();
    for (const s of studentsQuery.data ?? []) {
      for (const p of s.frequencyPlans ?? []) {
        if (!seen.has(p.daysPerWeek)) seen.set(p.daysPerWeek, p.monthlyFeePaise);
      }
    }
    return Array.from(seen.entries())
      .map(([daysPerWeek, monthlyFeePaise]) => ({ daysPerWeek, monthlyFeePaise }))
      .sort((a, b) => a.daysPerWeek - b.daysPerWeek);
  }, [selectedStudent, studentsQuery.data]);

  // ── Derived: effective amount ────────────────────────────────────────────
  const effectiveAmount = useMemo(() => {
    if (useManualAmount) return Number(manualAmount) || 0;
    if (isRuia && selectedPlanType) {
      const plan = SLOT_PLANS.find((p) => p.planType === selectedPlanType);
      return plan ? Math.round(plan.amountPaise / 100) : 0;
    }
    if (!isRuia && selectedFreqDays != null) {
      const match = availablePlans.find((p) => p.daysPerWeek === selectedFreqDays);
      if (match) return Math.round(match.monthlyFeePaise / 100);
    }
    // No frequencyPlans data (CF not yet deployed or batch has none) — let manual input drive
    if (!isRuia && availablePlans.length === 0) return Number(manualAmount) || 0;
    return selectedStudent?.monthlyFeeRupees ?? 0;
  }, [useManualAmount, manualAmount, isRuia, selectedPlanType, selectedFreqDays, selectedStudent, availablePlans]);

  // ── Slot helpers ─────────────────────────────────────────────────────────
  function getSlotCount(slot: string): number {
    if (isSaturdaySlot(slot)) {
      return slotBookings.filter((b) => b.planType === 'COMPLETE_BUNDLE' || b.planType === 'GAMES_DAY').length;
    }
    return slotBookings.filter((b) => b.timeSlot === slot &&
      (b.planType === 'TWO_DAY' || b.planType === 'THREE_DAY' || b.planType === 'FOUR_DAY' || b.planType === 'COMPLETE_BUNDLE')).length;
  }
  function getSlotCapacity(slot: string) {
    return isSaturdaySlot(slot) ? slotConfig.saturdayCapacity : slotConfig.weekdayCapacity;
  }
  function getSlotNames(slot: string): string[] {
    const bookings = isSaturdaySlot(slot)
      ? slotBookings.filter((b) => b.planType === 'COMPLETE_BUNDLE' || b.planType === 'GAMES_DAY')
      : slotBookings.filter((b) => b.timeSlot === slot &&
          (b.planType === 'TWO_DAY' || b.planType === 'THREE_DAY' || b.planType === 'FOUR_DAY' || b.planType === 'COMPLETE_BUNDLE'));
    return bookings.map((b) => b.participantName);
  }

  // Time slots available for the selected Ruia plan
  const ruiaTimeSlots = useMemo(() => {
    if (!selectedPlanType) return [];
    const plan = SLOT_PLANS.find((p) => p.planType === selectedPlanType);
    return plan?.timeSlots ?? [];
  }, [selectedPlanType]);

  // ── Handlers ───────────────────────────────────────────────────────────

  function handleCentreSelect(centre: CentreOption) {
    if (!centre.centreCode) return;
    setSelectedCentre(centre);
    setStep('lookup');
  }

  function handleStudentSelect(s: StudentSearchResult) {
    setSelectedStudent(s);
    // Pre-select plan
    if (isRuia) {
      // Map enrollment days to Ruia plan
      if (s.daysPerWeek === 2) setSelectedPlanType('TWO_DAY');
      else if (s.daysPerWeek === 3) setSelectedPlanType('THREE_DAY');
      else if (s.daysPerWeek === 4) setSelectedPlanType('FOUR_DAY');
      else setSelectedPlanType(null);
    } else {
      setSelectedFreqDays(s.daysPerWeek > 0 ? s.daysPerWeek : null);
    }
    setManualAmount(s.monthlyFeeRupees > 0 ? String(s.monthlyFeeRupees) : '');
    setStep('form');
  }

  async function handleRegister() {
    if (!selectedCentre?.centreCode) return;
    if (regName.trim().length < 2 || regPhone.length !== 10) {
      setRegisterError('Please fill in your full name and 10-digit phone number.');
      return;
    }
    setRegistering(true);
    setRegisterError('');
    try {
      const res = await registerStudent({
        centreCode: selectedCentre.centreCode,
        name: regName.trim(),
        phone: regPhone,
        email: regEmail.trim() || undefined,
      });
      if (regEmail.trim()) setPayerEmail(regEmail.trim());
      handleStudentSelect({
        studentId: res.studentId,
        name: res.name,
        maskedPhone: res.maskedPhone,
        externalStudentId: null,
        batchName: '',
        monthlyFeeRupees: 0,
        daysPerWeek: 0,
        frequencyPlans: [],
      });
      studentsQuery.refetch();
    } catch (err: any) {
      setRegisterError(err.message || 'Registration failed');
    } finally {
      setRegistering(false);
    }
  }

  function handleContinueFromForm() {
    if (isRuia && selectedPlanType) {
      setSelectedTimeSlot(null);
      setSlotError('');
      setStep('slot');
    } else {
      setStep('payment');
    }
  }

  function handleScreenshotChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = () => setScreenshotPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!selectedCentre?.centreCode || !selectedStudent || effectiveAmount <= 0) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      let screenshotUrl: string | null = null;
      if (screenshotFile) {
        try {
          const compressed = await compressImage(screenshotFile);
          const safeName = screenshotFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const path = `fee-screenshots/${selectedCentre.id}/${Date.now()}_${safeName}`;
          const storageRef = ref(storage, path);
          await uploadBytes(storageRef, compressed, { contentType: (compressed as Blob).type || 'image/jpeg' });
          screenshotUrl = await getDownloadURL(storageRef);
        } catch (uploadErr) {
          // Screenshot is optional — don't block the payment if upload fails.
          console.warn('[FeesPortal] screenshot upload failed, continuing without it', uploadErr);
        }
      }

      // Always create the fee payment record
      const paymentResult = await submitFeePayment({
        centreCode: selectedCentre.centreCode,
        studentId: selectedStudent.studentId,
        externalStudentId: selectedStudent.externalStudentId ?? undefined,
        email: payerEmail.trim() || undefined,
        month,
        amountRupees: effectiveAmount,
        method,
        screenshotUrl,
      });

      // For Ruia: also create the slot booking
      if (isRuia && selectedPlanType && selectedTimeSlot && slotPhone.length === 10) {
        // Duplicate check
        const isDup = await checkDuplicatePhone(slotPhone, RUIA_BOOKING_CENTRE_ID, month, selectedPlanType as SlotPlanType);
        if (isDup) {
          setSubmitError(`A booking for ${selectedPlanType.replace('_', ' ')} in ${formatMonth(month)} already exists for this phone number.`);
          setSubmitting(false);
          return;
        }
        await createBooking({
          centreId: RUIA_BOOKING_CENTRE_ID,
          month,
          participantName: selectedStudent.name,
          participantPhone: slotPhone,
          planType: selectedPlanType as SlotPlanType,
          timeSlot: selectedTimeSlot,
          amountPaise: effectiveAmount * 100,
        });
      }

      setResult(paymentResult);
      setStep('success');
    } catch (err: any) {
      setSubmitError(err.message || 'Payment submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    try { sessionStorage.removeItem(PERSIST_KEY); } catch { /* ignore */ }
    setStep('centre');
    setSelectedCentre(null);
    setNameQuery('');
    setSelectedStudent(null);
    setShowRegister(false);
    setRegName(''); setRegPhone(''); setRegEmail(''); setRegisterError('');
    setMonth(getDefaultMonth());
    setPayerEmail('');
    setSelectedPlanType(null);
    setSelectedFreqDays(null);
    setManualAmount('');
    setUseManualAmount(false);
    setMethod('UPI');
    setSelectedTimeSlot(null);
    setSlotPhone('');
    setSlotError('');
    setSlotBookings([]);
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setSubmitError('');
    setResult(null);
    setUpiCopied(false);
  }

  // ── Render helpers ─────────────────────────────────────────────────────

  const feeConfig = selectedCentre?.centreCode ? CENTRE_FEE_CONFIG[selectedCentre.centreCode] : null;
  const STEPS: Step[] = isRuia
    ? ['centre', 'lookup', 'form', 'slot', 'payment', 'success']
    : ['centre', 'lookup', 'form', 'payment', 'success'];

  const canContinueForm = isRuia
    ? !!selectedPlanType && (useManualAmount ? effectiveAmount > 0 : true)
    : effectiveAmount > 0;

  const canSubmit = isRuia
    ? slotPhone.length === 10 && !!selectedTimeSlot
    : true;

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-secondary via-brand-secondary to-[#0D1B2E]">
      {/* Header */}
      <header className="px-4 pb-4 pt-8 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary shadow-lg shadow-brand-primary/30">
          <BadgeIndianRupee size={28} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-white">{COMPANY.brandName}</h1>
        <p className="mt-1 text-sm text-gray-400">Fee Payment Portal</p>
      </header>

      {/* Step indicator */}
      <div className="mx-auto mb-6 flex max-w-md items-center justify-center gap-2 px-4">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
              step === s ? 'bg-brand-primary text-white'
                : STEPS.indexOf(step) > i ? 'bg-green-500 text-white'
                : 'bg-gray-700 text-gray-400',
            )}>
              {STEPS.indexOf(step) > i ? <Check size={12} /> : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className="h-0.5 w-4 bg-gray-700" />}
          </div>
        ))}
      </div>

      <main className="mx-auto max-w-md px-4 pb-12">

        {/* ── 1. Centre selection ──────────────────────────────────── */}
        {step === 'centre' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Select Your Centre</h2>
            {centresLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-brand-primary" />
              </div>
            ) : centres.length === 0 ? (
              <p className="text-sm text-gray-400">No active centres available.</p>
            ) : (
              centres.filter((c) => c.centreCode).map((c) => (
                <button key={c.id} onClick={() => handleCentreSelect(c)}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-700 bg-gray-800/50 p-4 text-left transition hover:border-brand-primary/50 hover:bg-gray-800">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary/10">
                      <Building2 size={20} className="text-brand-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-white">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.city}</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-gray-500" />
                </button>
              ))
            )}
          </div>
        )}

        {/* ── 2. Name autocomplete ─────────────────────────────────── */}
        {step === 'lookup' && (
          <div className="space-y-4">
            <button onClick={() => { setStep('centre'); setNameQuery(''); setShowRegister(false); }}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
              <ChevronLeft size={16} /> Back
            </button>

            <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
              <p className="mb-1 text-sm font-medium text-gray-300">Centre</p>
              <p className="text-white">{selectedCentre?.name}</p>
            </div>

            {!showRegister && (
              <>
                <h2 className="text-lg font-semibold text-white">Find Your Student</h2>
                <p className="text-sm text-gray-400">Type the student's name as registered.</p>

                <div className="relative">
                  <Search size={18} className="absolute left-3 top-3 text-gray-500" />
                  <input type="text" autoFocus placeholder="Student name" value={nameQuery}
                    onChange={(e) => setNameQuery(e.target.value)}
                    className="w-full rounded-xl border border-gray-700 bg-gray-800 py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:border-brand-primary focus:outline-none" />
                </div>

                {studentsQuery.isLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 size={16} className="animate-spin" /> Loading students…
                  </div>
                )}
                {studentsQuery.isError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-900/30 p-3 text-sm text-red-300">
                    <AlertCircle size={16} /> Could not load students. Please try again.
                  </div>
                )}

                {!studentsQuery.isLoading && nameQuery.trim().length >= 2 && (
                  <div className="space-y-2">
                    {filteredStudents.map((s) => (
                      <button key={s.studentId} onClick={() => handleStudentSelect(s)}
                        className="flex w-full items-center justify-between rounded-xl border border-gray-700 bg-gray-800/50 p-3 text-left transition hover:border-brand-primary/50">
                        <div>
                          <p className="font-medium text-white">{s.name}</p>
                          <p className="text-xs text-gray-400">
                            {s.maskedPhone}
                            {s.batchName && <> &middot; {s.batchName}</>}
                          </p>
                        </div>
                        <ChevronRight size={16} className="text-gray-500" />
                      </button>
                    ))}
                    {filteredStudents.length === 0 && (
                      <p className="px-1 text-sm text-gray-400">No students match &ldquo;{nameQuery.trim()}&rdquo;.</p>
                    )}
                  </div>
                )}
                {nameQuery.trim().length > 0 && nameQuery.trim().length < 2 && (
                  <p className="px-1 text-xs text-gray-500">Type at least 2 characters.</p>
                )}

                <button onClick={() => { setShowRegister(true); setRegName(nameQuery.trim()); setRegisterError(''); }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-600 bg-gray-800/30 py-3 text-sm font-medium text-gray-300 transition hover:border-brand-primary/50 hover:text-white">
                  <UserPlus size={16} /> Can&apos;t find your name? Register a new student
                </button>
              </>
            )}

            {showRegister && (
              <>
                <h2 className="text-lg font-semibold text-white">Register New Student</h2>
                <p className="text-sm text-gray-400">We&apos;ll create a profile so you can pay. The academy will fill in the rest.</p>
                <div className="space-y-3">
                  {[
                    { label: 'Student Name', value: regName, onChange: (v: string) => { setRegName(v); setRegisterError(''); }, type: 'text', placeholder: 'Full name' },
                    { label: 'Phone Number', value: regPhone, onChange: (v: string) => { setRegPhone(v.replace(/\D/g, '').slice(0, 10)); setRegisterError(''); }, type: 'tel', placeholder: '10-digit phone' },
                    { label: 'Email (for invoice)', value: regEmail, onChange: (v: string) => { setRegEmail(v); setRegisterError(''); }, type: 'email', placeholder: 'yourname@email.com (optional)' },
                  ].map(({ label, value, onChange, type, placeholder }) => (
                    <div key={label}>
                      <label className="mb-1 block text-sm font-medium text-gray-300">{label}</label>
                      <input type={type} placeholder={placeholder} value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-brand-primary focus:outline-none" />
                    </div>
                  ))}
                </div>
                {registerError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-900/30 p-3 text-sm text-red-300">
                    <AlertCircle size={16} /> {registerError}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { setShowRegister(false); setRegisterError(''); }}
                    className="flex-1 rounded-xl border border-gray-700 bg-gray-800 py-3 text-sm font-semibold text-gray-300 transition hover:text-white">
                    Cancel
                  </button>
                  <button onClick={handleRegister} disabled={registering}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-primary py-3 text-sm font-semibold text-white transition disabled:opacity-50">
                    {registering ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                    {registering ? 'Registering…' : 'Register & Continue'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 3. Form — plan + month + method ──────────────────────── */}
        {step === 'form' && selectedStudent && (
          <div className="space-y-4">
            <button onClick={() => { setStep('lookup'); setSelectedStudent(null); }}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
              <ChevronLeft size={16} /> Back
            </button>

            {/* Student card */}
            <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/5 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary/20">
                  <User size={20} className="text-brand-primary" />
                </div>
                <div>
                  <p className="font-semibold text-white">{selectedStudent.name}</p>
                  <p className="text-xs text-gray-400">
                    {selectedStudent.batchName
                      ? <>{selectedStudent.batchName} &middot; {selectedStudent.daysPerWeek} days/week</>
                      : 'New registration'}
                    {selectedStudent.externalStudentId && <> &middot; ID: {selectedStudent.externalStudentId}</>}
                  </p>
                </div>
              </div>
            </div>

            <h2 className="text-lg font-semibold text-white">Payment Details</h2>

            {/* Month */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                <Calendar size={14} className="mr-1 inline" /> Fee Month
              </label>
              <select value={month} onChange={(e) => setMonth(e.target.value)}
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-brand-primary focus:outline-none">
                {getMonthOptions().map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
              </select>
            </div>

            {/* Email — invoice receipt goes here */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Email for Invoice</label>
              <input type="email" inputMode="email" placeholder="yourname@email.com"
                value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-brand-primary focus:outline-none" />
              <p className="mt-1 text-xs text-gray-500">Your payment receipt / invoice will be sent here.</p>
            </div>

            {/* Plan selector — Ruia */}
            {isRuia && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Select Plan</label>
                <div className="space-y-2">
                  {SLOT_PLANS.map((plan) => (
                    <button key={plan.planType} onClick={() => { setSelectedPlanType(plan.planType); setUseManualAmount(false); }}
                      className={cn(
                        'flex w-full items-start justify-between rounded-xl border p-4 text-left transition',
                        selectedPlanType === plan.planType
                          ? 'border-brand-primary bg-brand-primary/10'
                          : 'border-gray-700 bg-gray-800/50 hover:border-gray-600',
                      )}>
                      <div>
                        <p className={cn('font-semibold', selectedPlanType === plan.planType ? 'text-brand-primary' : 'text-white')}>
                          {plan.label}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">{plan.days}</p>
                      </div>
                      <p className={cn('text-sm font-bold', selectedPlanType === plan.planType ? 'text-brand-primary' : 'text-gray-300')}>
                        {formatINR(plan.amountPaise, { withDecimals: false })}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Plan selector — other centres (frequencyPlans) */}
            {!isRuia && availablePlans.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Select Plan</label>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(availablePlans.length, 3)}, 1fr)` }}>
                  {availablePlans
                    .slice()
                    .sort((a, b) => a.daysPerWeek - b.daysPerWeek)
                    .map((plan) => (
                      <button key={plan.daysPerWeek}
                        onClick={() => { setSelectedFreqDays(plan.daysPerWeek); setUseManualAmount(false); }}
                        className={cn(
                          'rounded-xl border p-3 text-center transition',
                          selectedFreqDays === plan.daysPerWeek
                            ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                            : 'border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600',
                        )}>
                        <p className="text-sm font-bold">{plan.daysPerWeek} days/wk</p>
                        <p className="mt-0.5 text-xs opacity-80">
                          {formatINR(plan.monthlyFeePaise, { withDecimals: false })}
                        </p>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Amount display — only when plan-derived amount is available */}
            {!useManualAmount && effectiveAmount > 0 && (isRuia || availablePlans.length > 0) && (
              <div className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800/50 p-4">
                <div>
                  <p className="mb-0.5 text-sm text-gray-400">Amount to Pay</p>
                  <p className="text-2xl font-bold text-white">
                    {formatINR(effectiveAmount * 100, { withDecimals: false })}
                  </p>
                </div>
                <button onClick={() => { setManualAmount(String(effectiveAmount)); setUseManualAmount(true); }}
                  className="flex items-center gap-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-xs text-gray-300 transition hover:text-white">
                  <Pencil size={12} /> Edit
                </button>
              </div>
            )}

            {/* Manual input — always shown when no plans, or when user clicked Edit */}
            {(useManualAmount || effectiveAmount === 0 || (!isRuia && availablePlans.length === 0)) && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  <BadgeIndianRupee size={14} className="mr-1 inline" /> Amount to Pay (₹)
                </label>
                <div className="flex gap-2">
                  <input type="number" inputMode="numeric" min={1} placeholder="Enter fee amount"
                    value={manualAmount} onChange={(e) => setManualAmount(e.target.value.replace(/\D/g, ''))}
                    className="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-brand-primary focus:outline-none" />
                  {useManualAmount && availablePlans.length > 0 && (
                    <button onClick={() => setUseManualAmount(false)}
                      className="rounded-xl border border-gray-600 bg-gray-700 px-3 text-xs text-gray-400 transition hover:text-white">
                      Cancel
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {availablePlans.length === 0
                    ? 'Enter the amount agreed with your coach.'
                    : 'Confirm the exact fee amount with your coach.'}
                </p>
              </div>
            )}

            {/* Payment method */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Payment Method</label>
              <div className="grid grid-cols-3 gap-2">
                {(['UPI', 'CASH', 'BANK_TRANSFER'] as const).map((m) => (
                  <button key={m} onClick={() => setMethod(m)}
                    className={cn(
                      'rounded-lg border py-2.5 text-center text-sm font-medium transition',
                      method === m
                        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                        : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-white',
                    )}>
                    {m === 'BANK_TRANSFER' ? 'Bank' : m}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleContinueFromForm} disabled={!canContinueForm}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary py-3 font-semibold text-white transition hover:bg-brand-primary/90 disabled:opacity-50">
              {isRuia ? 'Choose Time Slot' : 'Continue to Payment'}
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* ── 4. Slot booking (Ruia only) ──────────────────────────── */}
        {step === 'slot' && isRuia && selectedStudent && selectedPlanType && (
          <div className="space-y-4">
            <button onClick={() => setStep('form')}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
              <ChevronLeft size={16} /> Back
            </button>

            {/* Plan recap */}
            {(() => {
              const plan = SLOT_PLANS.find((p) => p.planType === selectedPlanType)!;
              return (
                <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">{plan.label}</p>
                      <p className="text-xs text-gray-400">{plan.days} &middot; {formatMonth(month)}</p>
                    </div>
                    <p className="font-bold text-brand-primary">
                      {formatINR(effectiveAmount * 100, { withDecimals: false })}
                    </p>
                  </div>
                </div>
              );
            })()}

            <h2 className="text-lg font-semibold text-white">Book Your Slot</h2>
            <p className="text-sm text-gray-400">Slots are first-come-first-served. Once full, no further bookings are accepted.</p>

            {/* Phone for booking */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Your Phone Number</label>
              <input type="tel" placeholder="10-digit phone (for booking record)"
                value={slotPhone} onChange={(e) => { setSlotPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setSlotError(''); }}
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-brand-primary focus:outline-none" />
            </div>

            {/* Time slots */}
            <div className="space-y-3">
              {ruiaTimeSlots.map((slot) => {
                const count = getSlotCount(slot);
                const capacity = getSlotCapacity(slot);
                const full = count >= capacity;
                const names = getSlotNames(slot);
                const isSat = isSaturdaySlot(slot);
                const isSelected = selectedTimeSlot === slot;

                return (
                  <button key={slot} disabled={full}
                    onClick={() => setSelectedTimeSlot(isSelected ? null : slot)}
                    className={cn(
                      'w-full rounded-xl border p-4 text-left transition',
                      full ? 'cursor-not-allowed border-gray-700 bg-gray-800/30 opacity-50'
                        : isSelected ? 'border-brand-primary bg-brand-primary/10'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-500',
                    )}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className={cn(isSelected ? 'text-brand-primary' : 'text-gray-400')} />
                        <span className={cn('font-semibold', isSelected ? 'text-brand-primary' : 'text-white')}>
                          {formatTimeSlot(slot)}
                          {isSat && <span className="ml-2 text-xs font-normal text-gray-400">(Saturday)</span>}
                        </span>
                      </div>
                      <div className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-bold',
                        full ? 'bg-red-900/50 text-red-300'
                          : count >= capacity * 0.8 ? 'bg-yellow-900/50 text-yellow-300'
                          : 'bg-green-900/50 text-green-300',
                      )}>
                        {full ? 'FULL' : `${count}/${capacity}`}
                      </div>
                    </div>

                    {/* Player names */}
                    {names.length > 0 && (
                      <div className="mt-1 flex items-start gap-2">
                        <Users size={13} className="mt-0.5 shrink-0 text-gray-500" />
                        <p className="text-xs text-gray-400 leading-relaxed">
                          {names.slice(0, 6).join(', ')}{names.length > 6 ? ` +${names.length - 6} more` : ''}
                        </p>
                      </div>
                    )}
                    {names.length === 0 && !full && (
                      <p className="mt-1 text-xs text-gray-500">No bookings yet — be the first!</p>
                    )}
                  </button>
                );
              })}

              {/* For COMPLETE_BUNDLE: also show Saturday slot info */}
              {selectedPlanType === 'COMPLETE_BUNDLE' && (
                <div className="rounded-xl border border-gray-700 bg-gray-800/30 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-gray-400" />
                      <span className="font-semibold text-gray-300">
                        7 AM – 9 AM <span className="text-xs font-normal text-gray-400">(Saturday — auto-included)</span>
                      </span>
                    </div>
                    <div className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-bold',
                      getSlotCount('07:00-09:00') >= slotConfig.saturdayCapacity
                        ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300',
                    )}>
                      {getSlotCount('07:00-09:00')}/{slotConfig.saturdayCapacity}
                    </div>
                  </div>
                  {getSlotNames('07:00-09:00').length > 0 && (
                    <div className="flex items-start gap-2">
                      <Users size={13} className="mt-0.5 shrink-0 text-gray-500" />
                      <p className="text-xs text-gray-400">
                        {getSlotNames('07:00-09:00').slice(0, 6).join(', ')}
                        {getSlotNames('07:00-09:00').length > 6 && ` +${getSlotNames('07:00-09:00').length - 6} more`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {slotError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-900/30 p-3 text-sm text-red-300">
                <AlertCircle size={16} /> {slotError}
              </div>
            )}

            <button
              onClick={() => {
                if (slotPhone.length !== 10) { setSlotError('Enter your 10-digit phone number.'); return; }
                if (!selectedTimeSlot) { setSlotError('Please select a time slot.'); return; }
                setSlotError('');
                setStep('payment');
              }}
              disabled={!selectedTimeSlot || slotPhone.length !== 10}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary py-3 font-semibold text-white transition hover:bg-brand-primary/90 disabled:opacity-50">
              Continue to Payment <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* ── 5. Payment ───────────────────────────────────────────── */}
        {step === 'payment' && selectedStudent && feeConfig && (
          <div className="space-y-4">
            <button onClick={() => setStep(isRuia ? 'slot' : 'form')}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
              <ChevronLeft size={16} /> Back
            </button>

            {method === 'UPI' && (
              <>
                <h2 className="text-lg font-semibold text-white">Pay via UPI</h2>

                {/* UPI ID for manual entry or desktop scanning */}
                <div className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800/50 p-3">
                  <div>
                    <p className="text-xs text-gray-400">UPI ID (manual / desktop)</p>
                    <p className="font-mono text-sm text-white">{feeConfig.upiId}</p>
                  </div>
                  <button onClick={async () => { await copyToClipboard(feeConfig.upiId); setUpiCopied(true); setTimeout(() => setUpiCopied(false), 2000); }}
                    className="rounded-lg bg-gray-700 p-2 transition hover:bg-gray-600">
                    {upiCopied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="text-gray-300" />}
                  </button>
                </div>
                <div className="rounded-lg bg-blue-900/20 p-3 text-xs text-blue-300">
                  Tap "Open UPI App" below to pay, then upload a screenshot — it helps us verify your payment faster.
                </div>
              </>
            )}

            {method !== 'UPI' && (
              <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
                <h2 className="text-lg font-semibold text-white">
                  {method === 'CASH' ? 'Cash Payment' : 'Bank Transfer'}
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  {method === 'CASH'
                    ? 'Please pay cash to your coach and submit below for record.'
                    : 'Transfer to the academy bank account and upload proof below.'}
                </p>
              </div>
            )}

            {/* Screenshot */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                <Upload size={14} className="mr-1 inline" /> Payment Screenshot (optional)
              </label>
              <label className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-6 transition',
                screenshotPreview ? 'border-green-500/50 bg-green-900/10' : 'border-gray-600 bg-gray-800/30 hover:border-gray-500',
              )}>
                {screenshotPreview
                  ? <img src={screenshotPreview} alt="Preview" className="mb-2 h-32 rounded-lg object-contain" />
                  : <Upload size={24} className="mb-2 text-gray-500" />}
                <p className="text-sm text-gray-400">{screenshotPreview ? 'Tap to change' : 'Tap to upload'}</p>
                <input type="file" accept="image/*" onChange={handleScreenshotChange} className="hidden" />
              </label>
            </div>

            {submitError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-900/30 p-3 text-sm text-red-300">
                <AlertCircle size={16} /> {submitError}
              </div>
            )}

            {/* Summary */}
            <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 text-sm">
              <p className="mb-2 font-medium text-gray-300">Summary</p>
              <div className="space-y-1 text-gray-400">
                <div className="flex justify-between"><span>Student</span><span className="text-white">{selectedStudent.name}</span></div>
                <div className="flex justify-between"><span>Centre</span><span className="text-white">{selectedCentre?.name}</span></div>
                <div className="flex justify-between"><span>Month</span><span className="text-white">{formatMonth(month)}</span></div>
                {isRuia && selectedPlanType && (
                  <>
                    <div className="flex justify-between">
                      <span>Plan</span>
                      <span className="text-white">{SLOT_PLANS.find((p) => p.planType === selectedPlanType)?.label}</span>
                    </div>
                    {selectedTimeSlot && (
                      <div className="flex justify-between">
                        <span>Time Slot</span>
                        <span className="text-white">{formatTimeSlot(selectedTimeSlot)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between"><span>Method</span><span className="text-white">{method === 'BANK_TRANSFER' ? 'Bank Transfer' : method}</span></div>
                <div className="mt-2 flex justify-between border-t border-gray-700 pt-2">
                  <span className="font-medium text-white">Total</span>
                  <span className="text-lg font-bold text-brand-primary">
                    {formatINR(effectiveAmount * 100, { withDecimals: false })}
                  </span>
                </div>
              </div>
            </div>

            {method === 'UPI' && (
              <>
                {/* UPI deep link — opens GPay / PhonePe / Paytm etc. Placed right above
                    Submit so it's the last thing people see/tap before confirming,
                    instead of sitting above the fold where it gets missed. */}
                <a
                  href={`upi://pay?pa=${encodeURIComponent(feeConfig.upiId)}&pn=${encodeURIComponent('BBA Sports')}&am=${effectiveAmount}&cu=INR&tn=${encodeURIComponent('BBA Fee Payment')}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-base font-bold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-500 active:scale-95"
                >
                  <BadgeIndianRupee size={20} />
                  Step 1: Pay {formatINR(effectiveAmount * 100, { withDecimals: false })} — Open UPI App
                </a>
                <p className="text-center text-xs text-gray-500">
                  Opens GPay, PhonePe, Paytm or any UPI app on your device
                </p>
              </>
            )}

            <button onClick={handleSubmit} disabled={submitting || !canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 font-semibold text-white transition hover:bg-green-500 disabled:opacity-50">
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <Receipt size={18} />}
              {submitting ? 'Submitting...' : method === 'UPI' ? 'Step 2: Submit Payment' : 'Submit Payment'}
            </button>
          </div>
        )}

        {/* ── 6. Success ───────────────────────────────────────────── */}
        {step === 'success' && result && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <CheckCircle2 size={40} className="text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Payment Recorded!</h2>
            <p className="text-sm text-gray-400">
              Your fee payment for {formatMonth(month)} has been submitted successfully.
            </p>
            <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 text-left text-sm">
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-400">Student</span><span className="font-medium text-white">{result.studentName}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Invoice No.</span>
                  <span className="font-mono font-medium text-brand-primary">{result.externalInvoiceNo}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Student ID</span>
                  <span className="font-mono text-white">{result.externalStudentId}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Month</span><span className="text-white">{formatMonth(month)}</span></div>
                {isRuia && selectedPlanType && selectedTimeSlot && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Slot</span>
                    <span className="text-white">{formatTimeSlot(selectedTimeSlot)}</span>
                  </div>
                )}
                <div className="flex justify-between"><span className="text-gray-400">Amount</span>
                  <span className="font-semibold text-white">{formatINR(effectiveAmount * 100, { withDecimals: false })}</span></div>
              </div>
            </div>
            <p className="text-xs text-gray-500">An invoice will be sent to your registered email shortly.</p>
            <button onClick={handleReset}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-800 py-3 font-semibold text-white transition hover:bg-gray-700">
              Pay for Another Month
            </button>
          </div>
        )}

        <div className="mt-8 text-center text-xs text-gray-600">
          <p>{COMPANY.legalName}</p>
          <p className="mt-0.5">Questions? Email {COMPANY.supportEmail}</p>
        </div>
      </main>
    </div>
  );
}
