import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  ChevronLeft,
  Search,
  UserPlus,
  User,
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
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatINR, COMPANY } from '@bba/shared';
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

// ── Centre config (UPI details per centre) ─────────────────────────────────

interface CentreFeeConfig {
  centreCode: string;
  upiId: string;
  upiQrPath: string;
}

const CENTRE_FEE_CONFIG: Record<string, CentreFeeConfig> = {
  DAD: { centreCode: 'DAD', upiId: '85287401@ubin', upiQrPath: '/Payment_QR.png' },
  RBI: { centreCode: 'RBI', upiId: '85287401@ubin', upiQrPath: '/Payment_QR.png' },
  RUI: { centreCode: 'RUI', upiId: '85287401@ubin', upiQrPath: '/Payment_QR.png' },
  BAN: { centreCode: 'BAN', upiId: '85287401@ubin', upiQrPath: '/Payment_QR.png' },
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
  const d = new Date(Number(y), Number(mo) - 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function getMonthOptions(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = -1; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
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

// ── Types ───────────────────────────────────────────────────────────────────

type Step = 'centre' | 'lookup' | 'form' | 'payment' | 'success';

// ── Main component ─────────────────────────────────────────────────────────

export default function FeesPortal() {
  const [step, setStep] = useState<Step>('centre');

  // Centre step (cached via React Query — 5-min staleTime from App.tsx)
  const { data: centres = [], isLoading: centresLoading } = useQuery({
    queryKey: ['activeCentres'],
    queryFn: fetchActiveCentres,
  });
  const [selectedCentre, setSelectedCentre] = useState<CentreOption | null>(null);

  // Lookup step — name autocomplete
  const [nameQuery, setNameQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null);

  // Inline "register new student" form
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regGuardian, setRegGuardian] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');

  // All students at the selected centre — fetched once, filtered client-side
  const studentsQuery = useQuery({
    queryKey: ['centreStudents', selectedCentre?.centreCode],
    queryFn: () => searchStudentsByCentre(selectedCentre!.centreCode!),
    enabled: !!selectedCentre?.centreCode,
  });

  const filteredStudents = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return (studentsQuery.data ?? [])
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [nameQuery, studentsQuery.data]);

  // Form step
  const [month, setMonth] = useState(getDefaultMonth());
  const [method, setMethod] = useState<'UPI' | 'CASH' | 'BANK_TRANSFER'>('UPI');
  // Editable amount — only used when the student has no enrollment fee (e.g. just registered)
  const [amountInput, setAmountInput] = useState('');

  // Payment step
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [upiCopied, setUpiCopied] = useState(false);

  // Success step
  const [result, setResult] = useState<FeeSubmissionResult | null>(null);

  // Effective amount to charge (rupees)
  const effectiveAmount = selectedStudent && selectedStudent.monthlyFeeRupees > 0
    ? selectedStudent.monthlyFeeRupees
    : Number(amountInput) || 0;

  // ── Handlers ───────────────────────────────────────────────────────────

  function handleCentreSelect(centre: CentreOption) {
    if (!centre.centreCode) return;
    setSelectedCentre(centre);
    setStep('lookup');
  }

  function handleStudentSelect(s: StudentSearchResult) {
    setSelectedStudent(s);
    setAmountInput(s.monthlyFeeRupees > 0 ? String(s.monthlyFeeRupees) : '');
    setStep('form');
  }

  async function handleRegister() {
    if (!selectedCentre?.centreCode) return;
    if (regName.trim().length < 2 || regPhone.length !== 10 || regGuardian.trim().length < 2) {
      setRegisterError('Please fill name, 10-digit phone, and guardian name.');
      return;
    }
    setRegistering(true);
    setRegisterError('');
    try {
      const res = await registerStudent({
        centreCode: selectedCentre.centreCode,
        name: regName.trim(),
        phone: regPhone,
        guardianName: regGuardian.trim(),
      });
      // New students have no enrollment yet — amount is entered manually on the form.
      handleStudentSelect({
        studentId: res.studentId,
        name: res.name,
        maskedPhone: res.maskedPhone,
        externalStudentId: null,
        batchName: '',
        monthlyFeeRupees: 0,
        daysPerWeek: 0,
      });
      // refresh the cached student list so the new student appears next time
      studentsQuery.refetch();
    } catch (err: any) {
      setRegisterError(err.message || 'Registration failed');
    } finally {
      setRegistering(false);
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
        const path = `fee-screenshots/${selectedCentre.id}/${Date.now()}_${screenshotFile.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, screenshotFile);
        screenshotUrl = await getDownloadURL(storageRef);
      }

      const res = await submitFeePayment({
        centreCode: selectedCentre.centreCode,
        studentId: selectedStudent.studentId,
        externalStudentId: selectedStudent.externalStudentId ?? undefined,
        month,
        amountRupees: effectiveAmount,
        method,
        screenshotUrl,
      });

      setResult(res);
      setStep('success');
    } catch (err: any) {
      setSubmitError(err.message || 'Payment submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setStep('centre');
    setSelectedCentre(null);
    setNameQuery('');
    setSelectedStudent(null);
    setShowRegister(false);
    setRegName('');
    setRegPhone('');
    setRegGuardian('');
    setRegisterError('');
    setMonth(getDefaultMonth());
    setMethod('UPI');
    setAmountInput('');
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setSubmitError('');
    setResult(null);
    setUpiCopied(false);
  }

  function backToLookup() {
    setStep('lookup');
    setSelectedStudent(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const feeConfig = selectedCentre?.centreCode
    ? CENTRE_FEE_CONFIG[selectedCentre.centreCode]
    : null;

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
        {(['centre', 'lookup', 'form', 'payment', 'success'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                step === s
                  ? 'bg-brand-primary text-white'
                  : (['centre', 'lookup', 'form', 'payment', 'success'].indexOf(step) > i)
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-700 text-gray-400',
              )}
            >
              {(['centre', 'lookup', 'form', 'payment', 'success'].indexOf(step) > i) ? (
                <Check size={12} />
              ) : (
                i + 1
              )}
            </div>
            {i < 4 && <div className="h-0.5 w-4 bg-gray-700" />}
          </div>
        ))}
      </div>

      {/* Content */}
      <main className="mx-auto max-w-md px-4 pb-12">
        {/* ── Centre selection ─────────────────────────────────────── */}
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
                <button
                  key={c.id}
                  onClick={() => handleCentreSelect(c)}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-700 bg-gray-800/50 p-4 text-left transition hover:border-brand-primary/50 hover:bg-gray-800"
                >
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

        {/* ── Name autocomplete ────────────────────────────────────── */}
        {step === 'lookup' && (
          <div className="space-y-4">
            <button
              onClick={() => { setStep('centre'); setNameQuery(''); setShowRegister(false); }}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
            >
              <ChevronLeft size={16} /> Back
            </button>

            <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
              <p className="mb-1 text-sm font-medium text-gray-300">Centre</p>
              <p className="text-white">{selectedCentre?.name}</p>
            </div>

            {!showRegister && (
              <>
                <h2 className="text-lg font-semibold text-white">Find Your Student</h2>
                <p className="text-sm text-gray-400">
                  Start typing the student&apos;s name as registered with the academy.
                </p>

                <div className="relative">
                  <Search size={18} className="absolute left-3 top-3 text-gray-500" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Student name"
                    value={nameQuery}
                    onChange={(e) => setNameQuery(e.target.value)}
                    className="w-full rounded-xl border border-gray-700 bg-gray-800 py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:border-brand-primary focus:outline-none"
                  />
                </div>

                {/* Loading the centre roster */}
                {studentsQuery.isLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 size={16} className="animate-spin" /> Loading students…
                  </div>
                )}

                {studentsQuery.isError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-900/30 p-3 text-sm text-red-300">
                    <AlertCircle size={16} />
                    Could not load students. Please try again.
                  </div>
                )}

                {/* Results */}
                {!studentsQuery.isLoading && nameQuery.trim().length >= 2 && (
                  <div className="space-y-2">
                    {filteredStudents.map((s) => (
                      <button
                        key={s.studentId}
                        onClick={() => handleStudentSelect(s)}
                        className="flex w-full items-center justify-between rounded-xl border border-gray-700 bg-gray-800/50 p-3 text-left transition hover:border-brand-primary/50"
                      >
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
                      <p className="px-1 text-sm text-gray-400">
                        No students match &ldquo;{nameQuery.trim()}&rdquo;.
                      </p>
                    )}
                  </div>
                )}

                {nameQuery.trim().length > 0 && nameQuery.trim().length < 2 && (
                  <p className="px-1 text-xs text-gray-500">Type at least 2 characters.</p>
                )}

                {/* Register new student */}
                <button
                  onClick={() => { setShowRegister(true); setRegName(nameQuery.trim()); setRegisterError(''); }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-600 bg-gray-800/30 py-3 text-sm font-medium text-gray-300 transition hover:border-brand-primary/50 hover:text-white"
                >
                  <UserPlus size={16} />
                  Can&apos;t find your name? Register a new student
                </button>
              </>
            )}

            {/* Inline registration form */}
            {showRegister && (
              <>
                <h2 className="text-lg font-semibold text-white">Register New Student</h2>
                <p className="text-sm text-gray-400">
                  We&apos;ll create a profile so you can pay. The academy will fill in the rest.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-300">Student Name</label>
                    <input
                      type="text"
                      placeholder="Full name"
                      value={regName}
                      onChange={(e) => { setRegName(e.target.value); setRegisterError(''); }}
                      className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-brand-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-300">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="10-digit phone"
                      value={regPhone}
                      onChange={(e) => { setRegPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setRegisterError(''); }}
                      className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-brand-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-300">Guardian Name</label>
                    <input
                      type="text"
                      placeholder="Parent / guardian name"
                      value={regGuardian}
                      onChange={(e) => { setRegGuardian(e.target.value); setRegisterError(''); }}
                      className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-brand-primary focus:outline-none"
                    />
                  </div>
                </div>

                {registerError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-900/30 p-3 text-sm text-red-300">
                    <AlertCircle size={16} />
                    {registerError}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowRegister(false); setRegisterError(''); }}
                    className="flex-1 rounded-xl border border-gray-700 bg-gray-800 py-3 text-sm font-semibold text-gray-300 transition hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRegister}
                    disabled={registering}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-primary py-3 text-sm font-semibold text-white transition disabled:opacity-50"
                  >
                    {registering ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                    {registering ? 'Registering…' : 'Register & Continue'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Fee form ─────────────────────────────────────────────── */}
        {step === 'form' && selectedStudent && (
          <div className="space-y-4">
            <button
              onClick={backToLookup}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
            >
              <ChevronLeft size={16} /> Back
            </button>

            {/* Student summary card */}
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
                    {selectedStudent.externalStudentId && (
                      <> &middot; ID: {selectedStudent.externalStudentId}</>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <h2 className="text-lg font-semibold text-white">Payment Details</h2>

            {/* Month selector */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                <Calendar size={14} className="mr-1 inline" />
                Fee Month
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-brand-primary focus:outline-none"
              >
                {getMonthOptions().map((m) => (
                  <option key={m} value={m}>{formatMonth(m)}</option>
                ))}
              </select>
            </div>

            {/* Amount */}
            {selectedStudent.monthlyFeeRupees > 0 ? (
              <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
                <p className="mb-1 text-sm text-gray-400">Amount to Pay</p>
                <p className="text-2xl font-bold text-white">
                  {formatINR(selectedStudent.monthlyFeeRupees * 100, { withDecimals: false })}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {selectedStudent.daysPerWeek} days/week plan
                </p>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  <BadgeIndianRupee size={14} className="mr-1 inline" />
                  Amount to Pay (₹)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="Enter fee amount"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-brand-primary focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-500">
                  No saved plan for this student — please confirm the amount with your coach.
                </p>
              </div>
            )}

            {/* Method */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Payment Method</label>
              <div className="grid grid-cols-3 gap-2">
                {(['UPI', 'CASH', 'BANK_TRANSFER'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={cn(
                      'rounded-lg border py-2.5 text-center text-sm font-medium transition',
                      method === m
                        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                        : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-white',
                    )}
                  >
                    {m === 'BANK_TRANSFER' ? 'Bank' : m}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setStep('payment')}
              disabled={effectiveAmount <= 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary py-3 font-semibold text-white transition hover:bg-brand-primary/90 disabled:opacity-50"
            >
              Continue to Payment
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* ── Payment / UPI step ───────────────────────────────────── */}
        {step === 'payment' && selectedStudent && feeConfig && (
          <div className="space-y-4">
            <button
              onClick={() => setStep('form')}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
            >
              <ChevronLeft size={16} /> Back
            </button>

            {method === 'UPI' && (
              <>
                <h2 className="text-lg font-semibold text-white">Pay via UPI</h2>

                {/* QR Code */}
                <div className="flex flex-col items-center rounded-xl border border-gray-700 bg-white p-4">
                  <img
                    src={feeConfig.upiQrPath}
                    alt="UPI QR Code"
                    className="mb-3 h-48 w-48 rounded-lg"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <p className="text-sm text-gray-600">Scan with any UPI app</p>
                </div>

                {/* UPI ID */}
                <div className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800/50 p-3">
                  <div>
                    <p className="text-xs text-gray-400">UPI ID</p>
                    <p className="font-mono text-sm text-white">{feeConfig.upiId}</p>
                  </div>
                  <button
                    onClick={async () => {
                      await copyToClipboard(feeConfig.upiId);
                      setUpiCopied(true);
                      setTimeout(() => setUpiCopied(false), 2000);
                    }}
                    className="rounded-lg bg-gray-700 p-2 transition hover:bg-gray-600"
                  >
                    {upiCopied ? (
                      <Check size={16} className="text-green-400" />
                    ) : (
                      <Copy size={16} className="text-gray-300" />
                    )}
                  </button>
                </div>

                <div className="rounded-lg bg-blue-900/20 p-3 text-xs text-blue-300">
                  Pay exactly {formatINR(effectiveAmount * 100, { withDecimals: false })} to the UPI ID above,
                  then upload a screenshot below (optional).
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
                    ? 'Please pay cash to your coach and submit the form below for record.'
                    : 'Transfer to the academy bank account and upload proof below.'}
                </p>
              </div>
            )}

            {/* Screenshot upload */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                <Upload size={14} className="mr-1 inline" />
                Payment Screenshot (optional)
              </label>
              <label
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-6 transition',
                  screenshotPreview
                    ? 'border-green-500/50 bg-green-900/10'
                    : 'border-gray-600 bg-gray-800/30 hover:border-gray-500',
                )}
              >
                {screenshotPreview ? (
                  <img src={screenshotPreview} alt="Preview" className="mb-2 h-32 rounded-lg object-contain" />
                ) : (
                  <Upload size={24} className="mb-2 text-gray-500" />
                )}
                <p className="text-sm text-gray-400">
                  {screenshotPreview ? 'Tap to change' : 'Tap to upload'}
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotChange}
                  className="hidden"
                />
              </label>
            </div>

            {submitError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-900/30 p-3 text-sm text-red-300">
                <AlertCircle size={16} />
                {submitError}
              </div>
            )}

            {/* Summary */}
            <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 text-sm">
              <p className="mb-2 font-medium text-gray-300">Summary</p>
              <div className="space-y-1 text-gray-400">
                <div className="flex justify-between">
                  <span>Student</span>
                  <span className="text-white">{selectedStudent.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Centre</span>
                  <span className="text-white">{selectedCentre?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Month</span>
                  <span className="text-white">{formatMonth(month)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Method</span>
                  <span className="text-white">{method === 'BANK_TRANSFER' ? 'Bank Transfer' : method}</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-gray-700 pt-2">
                  <span className="font-medium text-white">Total</span>
                  <span className="text-lg font-bold text-brand-primary">
                    {formatINR(effectiveAmount * 100, { withDecimals: false })}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 font-semibold text-white transition hover:bg-green-500 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Receipt size={18} />
              )}
              {submitting ? 'Submitting...' : 'Submit Payment'}
            </button>
          </div>
        )}

        {/* ── Success ──────────────────────────────────────────────── */}
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
                <div className="flex justify-between">
                  <span className="text-gray-400">Student</span>
                  <span className="font-medium text-white">{result.studentName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Invoice No.</span>
                  <span className="font-mono font-medium text-brand-primary">
                    {result.externalInvoiceNo}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Student ID</span>
                  <span className="font-mono text-white">{result.externalStudentId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Month</span>
                  <span className="text-white">{formatMonth(month)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Amount</span>
                  <span className="font-semibold text-white">
                    {formatINR(effectiveAmount * 100, { withDecimals: false })}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              An invoice will be sent to your registered email shortly.
            </p>

            <button
              onClick={handleReset}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-800 py-3 font-semibold text-white transition hover:bg-gray-700"
            >
              Pay for Another Month
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-600">
          <p>{COMPANY.legalName}</p>
          <p className="mt-0.5">Questions? Email {COMPANY.supportEmail}</p>
        </div>
      </main>
    </div>
  );
}
