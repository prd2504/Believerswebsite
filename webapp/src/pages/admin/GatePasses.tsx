/**
 * Gate passes — the day-pass queue, and standing passes for regular players.
 *
 * Two halves, because they are two different jobs:
 *
 *   - Day passes need a decision. A centre manager raises one, a super admin
 *     approves, and until then it renders at the gate as AWAITING APPROVAL
 *     rather than as a pass. The queue is at the top because a pass approved
 *     after the session has started is no use to anyone.
 *
 *   - Standing passes need nothing at all: they are a view of who has paid, so
 *     the only action is sending someone their link. The list doubles as a
 *     read on who is unpaid this month, which is the same question the gate
 *     is asking.
 *
 * Dadar only, for now — GATE_PASS_CENTRE_CODE. That's the one centre with an
 * actual gate and a guard checking it. This screen doesn't offer a centre
 * picker for that reason: showing one and then having the write get rejected
 * by the rules would just be confusing. The restriction lives in the rules
 * (see firestore.rules) and in the Cloud Functions that mint a standing pass —
 * this UI filter is a convenience on top of an enforcement that doesn't
 * depend on it.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Ticket, Check, X, Plus, Loader2, Send, Search, ShieldCheck, Clock, Copy, ExternalLink, Printer,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { getAllCentres } from '@/services/centreService';
import { getAllStudents } from '@/services/studentService';
import {
  createDayPass, approveDayPass, rejectDayPass, subscribeToDayPasses,
} from '@/services/dayPassService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import {
  UserRole, DAY_PASS_REASON_LABELS, monthColour, paymentCoversMonth, GATE_PASS_CENTRE_CODE,
  type DayPassDocument, type DayPassReason, type CentreDocument, type StudentDocument,
} from '@bba/shared';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

const REASONS: DayPassReason[] = ['TRIAL', 'GUEST', 'FEE_EXTENSION', 'MAKEUP', 'OTHER'];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

const STATUS_STYLE: Record<string, string> = {
  PENDING_APPROVAL: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-green-50 text-green-800 border-green-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
};

/**
 * Build marker, also hung off window so it can be checked from the console or
 * curled out of the bundle. Two deploys were spent unable to tell whether the
 * browser was running new code; a version string that can be read without
 * squinting at the page settles that in one step.
 */
const PASSES_BUILD = 'passes-v3';
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, string>).__BBA_PASSES_BUILD = PASSES_BUILD;
}

export default function GatePassesPage() {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === UserRole.SUPER_ADMIN;

  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());
  const [passes, setPasses] = useState<DayPassDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  const thisMonth = todayStr().slice(0, 7);
  const colour = monthColour(thisMonth);

  // The one centre this whole page operates on. Not a filter the user picks —
  // there is nowhere else for a gate pass to go.
  const dadCentre = useMemo(
    () => centres.find((c) => c.centreCode === GATE_PASS_CENTRE_CODE) ?? null,
    [centres],
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [y, m] = thisMonth.split('-').map(Number);
      const from = new Date(y, m - 3, 1);
      const fromMonth = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;

      const [cData, sData, paySnap] = await Promise.all([
        getAllCentres(),
        getAllStudents(),
        getDocs(query(
          collection(db, 'payments'),
          where('month', '>=', fromMonth),
          where('month', '<=', thisMonth),
        )),
      ]);
      setCentres(cData);
      const dad = cData.find((c) => c.centreCode === GATE_PASS_CENTRE_CODE);
      // Students at Dadar only. Every downstream list, count and dialog on
      // this page reads from this array, so restricting it here is what
      // keeps a Ruia or RBI student from ever showing up to be sent a pass.
      setStudents(sData.filter((s) => s.status === 'ACTIVE' && s.primaryCentreId === dad?.id));

      // Same coverage rule the pass itself uses, so this list and the gate can
      // never disagree about who is paid up.
      const paid = new Set<string>();
      paySnap.docs.forEach((d) => {
        const p = d.data();
        if (p.status === 'REFUNDED' || !p.studentId) return;
        if (!paymentCoversMonth(
          { month: p.month, coverageMonths: p.coverageMonths, coverageEndMonth: p.coverageEndMonth },
          thisMonth,
        )) return;
        paid.add(String(p.studentId));
      });
      setPaidIds(paid);

    } catch (err) {
      console.error(err);
      toast.error('Failed to load passes');
    } finally {
      setLoading(false);
    }
  }, [thisMonth]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeToDayPasses(todayStr(), setPasses), []);

  const pending = useMemo(() => passes.filter((p) => p.status === 'PENDING_APPROVAL'), [passes]);
  const upcoming = useMemo(() => passes.filter((p) => p.status !== 'PENDING_APPROVAL'), [passes]);

  // `students` is already Dadar-only (filtered on load), so this is just
  // search and ordering, not a second centre filter.
  const centreStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.phone ?? '').includes(q))
      .sort((a, b) => {
        // Unpaid first — the ones the gate will turn away are the ones worth
        // looking at.
        const ap = paidIds.has(a.id) ? 1 : 0;
        const bp = paidIds.has(b.id) ? 1 : 0;
        return ap - bp || a.name.localeCompare(b.name);
      });
  }, [students, studentSearch, paidIds]);

  async function handleApprove(p: DayPassDocument) {
    if (!profile) return;
    setBusy(true);
    try {
      await approveDayPass(p.id, profile.id, profile.name);
      toast.success(`Approved — ${p.personName} can enter on ${dayLabel(p.validDate)}`);
    } catch (err) {
      console.error(err);
      toast.error('Could not approve. Only a super admin can.');
    } finally { setBusy(false); }
  }

  async function handleReject(p: DayPassDocument) {
    if (!profile) return;
    const reason = prompt(`Decline the pass for ${p.personName}?\n\nReason (shown to whoever raised it):`);
    if (reason === null) return;
    setBusy(true);
    try {
      await rejectDayPass(p.id, profile.id, profile.name, reason);
      toast.success('Declined');
    } catch (err) {
      console.error(err);
      toast.error('Could not decline. Only a super admin can.');
    } finally { setBusy(false); }
  }

  const passUrl = (token: string, id: string, kind: 'day' | 'standing') =>
    `${window.location.origin}/pass/${kind === 'day' ? `d:${id}` : token}`;

  async function copyLink(url: string) {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
    catch { toast.error('Could not copy'); }
  }

  if (loading) {
    return <div><h1 className="mb-6 text-xl font-bold text-brand-secondary">Gate Passes</h1><CardSkeleton count={2} /></div>;
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Gate Passes</h1>
          <p className="text-xs font-medium text-gray-400">
            {dadCentre?.name ?? 'Dadar Railway Officers Colony'} only
            {/* Build marker. The pass buttons failed twice while the browser
                was still running an older bundle, and there was no way to tell
                from the page which code was live. If this tag is missing, the
                deploy hasn't reached this browser — hard-refresh. */}
            <span className="ml-1.5 rounded bg-brand-primary px-1.5 py-0.5 font-mono text-[11px] font-bold text-white">
              {PASSES_BUILD}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-gray-500">
            This month&rsquo;s colour is{' '}
            <span
              className="ml-0.5 inline-block rounded px-1.5 py-0.5 text-xs font-bold"
              style={{ background: colour.bg, color: colour.fg }}
            >
              {colour.name.toUpperCase()}
            </span>
            {' '}&mdash; tell security to admit only this colour.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/gate-passes/print"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            title="Every paid pass at this centre, laid out to print and cut"
          >
            <Printer size={15} /> Print all
          </Link>
          <button onClick={() => setShowIssue(true)} className="btn-primary text-sm">
            <Plus size={15} /> Issue day pass
          </button>
        </div>
      </div>

      {/* Approval queue */}
      {pending.length > 0 && (
        <div className="card mb-5 border-amber-200 bg-amber-50/40">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-amber-900">
            <Clock size={14} /> Waiting for approval · {pending.length}
          </h2>
          <div className="space-y-2">
            {pending.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-brand-secondary">{p.personName}</p>
                  <p className="text-xs text-gray-500">
                    {dayLabel(p.validDate)} · {DAY_PASS_REASON_LABELS[p.reason]} · {p.centreName}
                    {p.notes ? ` · ${p.notes}` : ''}
                  </p>
                  <p className="text-[11px] text-gray-400">Raised by {p.requestedByName}</p>
                </div>
                {isSuperAdmin ? (
                  <div className="flex gap-2">
                    <button onClick={() => handleApprove(p)} disabled={busy}
                      className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                      <Check size={13} /> Approve
                    </button>
                    <button onClick={() => handleReject(p)} disabled={busy}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-50">
                      <X size={13} /> Decline
                    </button>
                  </div>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                    A super admin must approve
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved / declined, today onward */}
      <div className="card mb-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-secondary">
          <Ticket size={14} /> Day passes from today
        </h2>
        {upcoming.length === 0 ? (
          <p className="py-5 text-center text-sm text-gray-400">None yet.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((p) => (
              <div key={p.id} className={cn('flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5', STATUS_STYLE[p.status])}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{p.personName}</p>
                  <p className="text-xs opacity-80">
                    {dayLabel(p.validDate)} · {DAY_PASS_REASON_LABELS[p.reason]}
                    {p.approvedByName ? ` · ${p.status === 'APPROVED' ? 'approved' : 'declined'} by ${p.approvedByName}` : ''}
                  </p>
                  {p.rejectionReason && <p className="text-[11px] opacity-80">{p.rejectionReason}</p>}
                </div>
                {p.status === 'APPROVED' && (
                  <div className="flex gap-1.5">
                    <button onClick={() => copyLink(passUrl(p.token, p.id, 'day'))}
                      className="flex items-center gap-1 rounded border border-current/20 bg-white/60 px-2 py-1 text-[11px] font-medium">
                      <Copy size={11} /> Link
                    </button>
                    <a href={passUrl(p.token, p.id, 'day')} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 rounded border border-current/20 bg-white/60 px-2 py-1 text-[11px] font-medium">
                      <ExternalLink size={11} /> Open
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Standing passes */}
      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-brand-secondary">
            <ShieldCheck size={14} /> Standing passes
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search name or phone" className="input w-52 py-1.5 pl-7 text-xs" />
            </div>
          </div>
        </div>

        <p className="mb-3 text-xs text-gray-500">
          A standing pass is valid because fees cover the month &mdash; there is nothing to issue or
          revoke. Sending only mails someone their link.
        </p>

        <div className="max-h-[26rem] space-y-1.5 overflow-y-auto">
          {centreStudents.slice(0, 200).map((s) => {
            const paid = paidIds.has(s.id);
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-brand-secondary">{s.name}</p>
                  <p className="text-[11px] text-gray-400">
                    {s.externalStudentId ?? '—'}{s.email ? ` · ${s.email}` : ' · no email on file'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    paid ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
                  )}>
                    {paid ? 'Valid' : 'Unpaid'}
                  </span>
                  <PreviewPassButton studentId={s.id} />
                  {/* One laminatable card, for a child without a phone. Same
                      85.6 × 54 mm layout as the full sheet. */}
                  <Link
                    to={`/admin/gate-passes/print?student=${encodeURIComponent(s.id)}`}
                    title="Print this student's ID card"
                    className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600"
                  >
                    <Printer size={11} /> ID card
                  </Link>
                  <SendPassButton studentId={s.id} disabled={!s.email} />
                </div>
              </div>
            );
          })}
          {centreStudents.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">No students match.</p>
          )}
        </div>
      </div>

      {showIssue && profile && dadCentre && (
        <IssueDayPassDialog
          centre={dadCentre}
          students={students}
          onClose={() => setShowIssue(false)}
          onCreate={async (input) => {
            setBusy(true);
            try {
              await createDayPass(input, profile.id, profile.name);
              toast.success(
                isSuperAdmin
                  ? 'Raised — approve it below to make it valid'
                  : 'Raised — a super admin will approve it',
              );
              setShowIssue(false);
            } catch (err) {
              console.error(err);
              toast.error('Could not raise the pass');
            } finally { setBusy(false); }
          }}
        />
      )}
    </div>
  );
}

const FN_BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL
  || `https://${import.meta.env.VITE_FUNCTIONS_REGION || 'asia-south1'}-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

/**
 * Call sendStandingPass as the signed-in admin.
 *
 * The endpoint used to demand the shared x-api-key, which the browser has no
 * business holding — that key also authorises backfills and enrolment-counter
 * rewrites, and anything in a JS bundle is public. It now accepts a Firebase
 * ID token and checks the caller's role server-side, which is the same thing
 * the Firestore rules do.
 *
 * Errors are returned rather than swallowed so the caller can show what
 * actually went wrong: "your session expired" and "no email on file" need
 * different responses from whoever clicked.
 */
async function callSendPass(studentId: string, preview: boolean): Promise<{
  ok: boolean; url?: string; emailed?: boolean; error?: string;
}> {
  // Every failure path below names WHICH step failed and carries the HTTP
  // status. A pass button that reports one generic sentence for a signed-out
  // session, a blocked request and a server error costs a deploy cycle per
  // guess — this one says which it was the first time.
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'Signed out — reload the page and sign in again.' };
  if (!FN_BASE.includes('cloudfunctions.net') && !FN_BASE.startsWith('http')) {
    return { ok: false, error: `Functions URL is misconfigured: "${FN_BASE}"` };
  }

  let token: string;
  try {
    token = await user.getIdToken();
  } catch (err) {
    console.error('[gatePass] getIdToken failed', err);
    return { ok: false, error: 'Could not refresh your login. Sign out and back in.' };
  }

  const url = `${FN_BASE}/sendStandingPass${preview ? '?preview=1' : ''}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ studentId }),
    });
  } catch (err) {
    // fetch only throws for network-level failures, and a blocked CORS
    // preflight is one of them — so name that possibility rather than
    // blaming the connection.
    console.error('[gatePass] network/CORS failure calling', url, err);
    return { ok: false, error: `Request blocked before it reached the server. Is sendStandingPass deployed? (${url})` };
  }

  const raw = await res.text();
  let body: { ok?: boolean; error?: string; url?: string; emailed?: boolean } | null = null;
  try { body = JSON.parse(raw); } catch { /* not JSON — infrastructure error page */ }

  if (!res.ok || !body?.ok) {
    console.error('[gatePass] server said', res.status, raw.slice(0, 300));
    if (body?.error) return { ok: false, error: `${body.error} (HTTP ${res.status})` };
    // A non-JSON body means Cloud Run answered, not our code — almost always
    // a function that isn't deployed, or one that isn't publicly invokable.
    return {
      ok: false,
      error: res.status === 404
        ? 'sendStandingPass is not deployed — run npm run deploy:functions.'
        : `Server returned HTTP ${res.status} before reaching the function.`,
    };
  }
  return { ok: true, url: body.url, emailed: body.emailed };
}

/**
 * Sending is a Cloud Function, not a client write: it has to read payments to
 * decide what the pass says, and mint a token onto the student document —
 * neither of which the browser is allowed to do.
 */
function SendPassButton({ studentId, disabled }: { studentId: string; disabled: boolean }) {
  const [sending, setSending] = useState(false);

  return (
    <button
      disabled={disabled || sending}
      title={disabled ? 'No email on file for this student' : 'Email their pass link'}
      onClick={async () => {
        setSending(true);
        const r = await callSendPass(studentId, false);
        setSending(false);
        if (!r.ok) { toast.error(r.error ?? 'Could not send the pass'); return; }
        toast.success(r.emailed ? 'Pass emailed' : `No email on file — link copied below: ${r.url}`);
      }}
      className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 disabled:opacity-40"
    >
      {sending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Send
    </button>
  );
}

/**
 * Open someone's pass without mailing them.
 *
 * Testing a pass should never mean sending a real parent an email, and seeing
 * what the gate sees is the only way to know the pass is right.
 */
export function PreviewPassButton({ studentId }: { studentId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      title="Open this pass without emailing anyone"
      onClick={async () => {
        // The tab is opened BEFORE the await, while the click is still on the
        // stack. Opening it after the fetch resolves is a popup a browser
        // blocks, because by then it is no longer attributable to a gesture.
        const tab = window.open('', '_blank', 'noopener');
        setBusy(true);
        const r = await callSendPass(studentId, true);
        setBusy(false);

        if (!r.ok || !r.url) {
          tab?.close();
          toast.error(r.error ?? 'Could not open the pass');
          return;
        }
        if (tab) tab.location.href = r.url;
        else window.location.href = r.url;   // popups blocked — go there instead
      }}
      className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 disabled:opacity-40"
    >
      <ExternalLink size={11} /> View
    </button>
  );
}

interface IssueProps {
  /** The only centre a day pass can be raised for — see GATE_PASS_CENTRE_CODE. */
  centre: CentreDocument;
  students: StudentDocument[];
  onClose: () => void;
  onCreate: (input: Parameters<typeof createDayPass>[0]) => void;
}

function IssueDayPassDialog({ centre, students, onClose, onCreate }: IssueProps) {
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState<DayPassReason>('GUEST');
  const [notes, setNotes] = useState('');
  const [validDate, setValidDate] = useState(todayStr);
  const [search, setSearch] = useState('');

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return students.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [students, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <div>
            <h3 className="text-sm font-semibold text-brand-secondary">Issue a one-day pass</h3>
            <p className="text-xs text-gray-400">A super admin has to approve it before it works</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <div className="space-y-3 p-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Centre</p>
            <p className="text-sm font-medium text-brand-secondary">{centre.name}</p>
          </div>

          <div>
            <label className="label">Date</label>
            <input type="date" value={validDate} min={todayStr()}
              onChange={(e) => setValidDate(e.target.value)} className="input text-sm" />
          </div>

          <div>
            <label className="label">Reason</label>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)}
                  className={cn('rounded-full border px-2.5 py-1 text-xs font-medium',
                    reason === r ? 'border-brand-primary bg-brand-primary text-white' : 'border-gray-200 text-gray-600')}>
                  {DAY_PASS_REASON_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Existing student? <span className="text-gray-400">(optional)</span></label>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search to link an existing student" className="input text-sm" />
            {matches.length > 0 && (
              <div className="mt-1 space-y-0.5 rounded-lg border border-gray-100 p-1">
                {matches.map((s) => (
                  <button key={s.id} type="button"
                    onClick={() => {
                      setStudentId(s.id); setName(s.name);
                      setPhone(s.phone ?? ''); setEmail(s.email ?? ''); setSearch('');
                    }}
                    className="w-full rounded p-1.5 text-left text-xs hover:bg-gray-50">
                    <span className="font-medium text-brand-secondary">{s.name}</span>
                    <span className="text-gray-400"> · {s.phone ?? 'no phone'}</span>
                  </button>
                ))}
              </div>
            )}
            {studentId && (
              <p className="mt-1 text-[11px] text-green-700">
                Linked to an existing student — the pass will show on their record.
              </p>
            )}
          </div>

          <div>
            <label className="label">Name on the pass</label>
            <input value={name} onChange={(e) => { setName(e.target.value); setStudentId(null); }}
              className="input text-sm" placeholder="As security should read it" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Phone</label>
              <input value={phone} inputMode="numeric"
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="input text-sm" />
            </div>
            <div>
              <label className="label">Email</label>
              <input value={email} type="email" onChange={(e) => setEmail(e.target.value)}
                className="input text-sm" placeholder="to send the pass" />
            </div>
          </div>

          <div>
            <label className="label">Notes <span className="text-gray-400">(optional)</span></label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              className="input text-sm" placeholder="e.g. paying tomorrow, cleared with coach" />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
          <button onClick={onClose} className="btn-secondary text-xs">Cancel</button>
          <button
            className="btn-primary text-xs"
            disabled={name.trim().length < 2 || !validDate}
            onClick={() => onCreate({
              centreId: centre.id,
              centreCode: centre.centreCode ?? '',
              centreName: centre.name,
              personName: name.trim(),
              studentId: studentId ?? undefined,
              phone: phone || null,
              email: email.trim() || null,
              reason,
              notes,
              validDate,
            })}
          >
            Raise for approval
          </button>
        </div>
      </div>
    </div>
  );
}
