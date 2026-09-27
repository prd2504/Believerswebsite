/**
 * Every Dadar pass, printed as ID cards.
 *
 * Sized CR80 — 85.6 × 54 mm, the credit-card standard — because that is the
 * size laminating pouches are made in. Anything else means trimming pouches by
 * hand for every student. Eight to an A4 sheet, cut guides between them, and
 * page breaks that never fall through the middle of a card.
 *
 * At 54 mm tall there is room for exactly three things, so the card carries
 * only those: the colour band with the month, the name, and the validity. The
 * pass code goes on too, small, because it is what the office quotes back when
 * somebody rings about a card. Everything else that appears on the on-screen
 * pass is deliberately dropped — a laminated card that needs squinting at is
 * worse than no card.
 *
 * Unpaid students are left out by default: a NOT VALID card admits nobody, so
 * printing and laminating one wastes a pouch and invites an argument at the
 * gate. The toggle exists because knowing who is missing is sometimes the
 * point.
 *
 * The data comes from one request. Building this from the per-student endpoint
 * would be three Firestore reads per person every time the sheet is printed.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Printer, ArrowLeft, AlertCircle } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { cn } from '@/lib/cn';
import type { PassPayload } from '@/lib/pass/types';
import { istNow, nextMonth, passSheetMonth } from '@bba/shared';

type SheetPass = PassPayload & { studentId?: string };

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const monthName = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

const FN_BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL
  || `https://${import.meta.env.VITE_FUNCTIONS_REGION || 'asia-south1'}-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

const ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthChip = (ym: string) => `${ABBR[Number(ym.slice(5, 7)) - 1] ?? ''} ${ym.slice(2, 4)}`;

export default function GatePassSheet() {
  const [params] = useSearchParams();
  /** Set when opened from one student's "ID card" link — print just theirs. */
  const onlyStudent = params.get('student');

  const today = istNow();
  const thisMonth = today.date.slice(0, 7);
  // Cards are for the month they'll be carried in: next month from the 25th,
  // same rule as the fees form. Both months are offered so a reprint for the
  // current month is still one click.
  const [month, setMonth] = useState(passSheetMonth(today));

  const [passes, setPasses] = useState<SheetPass[]>([]);
  const [colour, setColour] = useState({ bg: '#0A0A0A', fg: '#FFFFFF', name: '' });
  const [centreName, setCentreName] = useState('');
  const [includeUnpaid, setIncludeUnpaid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const user = auth.currentUser;
    if (!user) { setError('Signed out — reload and sign in again.'); setLoading(false); return; }
    try {
      const token = await user.getIdToken();
      const qs = new URLSearchParams({ month });
      if (includeUnpaid) qs.set('includeUnpaid', '1');
      const res = await fetch(
        `${FN_BASE}/bulkStandingPasses?${qs.toString()}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      );
      const raw = await res.text();
      let body: { ok?: boolean; error?: string; passes?: SheetPass[]; colour?: typeof colour; centreName?: string } | null = null;
      try { body = JSON.parse(raw); } catch { /* infrastructure error page */ }
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error ?? `Request failed (HTTP ${res.status})`);
      }
      const all = body.passes ?? [];
      setPasses(onlyStudent ? all.filter((x) => x.studentId === onlyStudent) : all);
      if (body.colour) setColour(body.colour);
      setCentreName(body.centreName ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the passes');
    } finally {
      setLoading(false);
    }
  }, [includeUnpaid, month, onlyStudent]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <style>{`
        /* Physical units, so a card comes out of the printer the size of the
           laminating pouch it is going into — not "about right". */
        .sheet {
          display: grid;
          grid-template-columns: repeat(2, 85.6mm);
          gap: 4mm;
          justify-content: center;
        }
        .pass-card {
          width: 85.6mm;
          height: 54mm;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          .no-print { display: none !important; }
          /* The colour band is the whole point — keep it on paper. */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .pass-card { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin/gate-passes" className="mb-1 flex items-center gap-1 text-xs text-gray-500 hover:text-brand-primary">
            <ArrowLeft size={13} /> Back to Gate Passes
          </Link>
          <h1 className="text-xl font-bold text-brand-secondary">
            Print sheet — {monthName(month)}
            {onlyStudent && <span className="ml-2 text-sm font-medium text-gray-500">(one student)</span>}
          </h1>
          <p className="text-sm text-gray-500">
            {loading ? 'Loading…' : `${passes.length} pass${passes.length === 1 ? '' : 'es'} · ${centreName}`}
            {!loading && (
              <span
                className="ml-2 inline-block rounded px-1.5 py-0.5 text-[11px] font-bold"
                style={{ background: colour.bg, color: colour.fg }}
              >
                {colour.name.toUpperCase()}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            {[thisMonth, nextMonth(thisMonth)].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonth(m)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                  month === m ? 'bg-brand-secondary text-white' : 'text-gray-500 hover:bg-gray-50',
                )}
              >
                {monthName(m)}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={includeUnpaid}
              onChange={(e) => setIncludeUnpaid(e.target.checked)}
            />
            Include unpaid
          </label>
          <button
            onClick={() => window.print()}
            disabled={loading || passes.length === 0}
            className="btn-primary text-sm disabled:opacity-50"
          >
            <Printer size={15} /> Print {passes.length > 0 ? `(${passes.length})` : ''}
          </button>
        </div>
      </div>

      {error && (
        <div className="no-print mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <p className="text-xs font-semibold text-red-800">Could not load the passes</p>
            <p className="mt-0.5 text-xs text-red-700">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-gray-400" /></div>
      ) : passes.length === 0 && !error ? (
        <p className="py-16 text-center text-sm text-gray-400">
          Nobody at {centreName || 'this centre'} has fees covering {monthName(month)} yet.
        </p>
      ) : (
        <div className="sheet">
          {passes.map((p) => {
            const valid = p.state === 'VALID';
            const band = valid ? colour.bg : '#B91C1C';
            const fg = valid ? colour.fg : '#FFFFFF';
            return (
              <div
                key={p.code}
                className="pass-card rounded-[2mm] border border-dashed border-gray-300 bg-white"
              >
                {/* Academy strip — 8mm */}
                <div
                  className="flex shrink-0 items-center gap-[1.5mm] bg-brand-secondary px-[2.5mm]"
                  style={{ height: '8mm' }}
                >
                  <img src="/logo.png" alt="" className="h-[5mm] w-[5mm] rounded-[0.5mm] object-contain" />
                  <p className="text-[5pt] font-bold tracking-wide text-white">BBA SPORTS ACADEMY</p>
                  <p className="ml-auto truncate text-[4.5pt] text-gray-400">{p.centreName}</p>
                </div>

                {/* The band. Everything a guard checks is in these 17mm. */}
                <div
                  className="flex shrink-0 flex-col items-center justify-center"
                  style={{ height: '21mm', background: band, color: fg }}
                >
                  <p className="text-[4.5pt] font-bold tracking-[0.2em] opacity-80">
                    {valid ? 'ENTRY PASS' : 'NOT VALID'}
                  </p>
                  <p className="text-[17pt] font-extrabold leading-none">{p.validLabel}</p>
                  {p.coversMonths.length > 1 && (
                    <div className="mt-[1mm] flex gap-[1mm]">
                      {p.coversMonths.map((m) => (
                        <span
                          key={m}
                          className="rounded-full px-[1.2mm] text-[4.5pt] font-semibold"
                          style={{
                            background: 'rgba(255,255,255,.22)',
                            outline: m === p.colourMonth ? `0.3mm solid ${fg}` : 'none',
                          }}
                        >
                          {monthChip(m)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Name, then validity and code sharing a line.
                    Stacked tight and centred rather than pushed to the top and
                    bottom edges: a card with a hole in the middle of it reads
                    as something that failed to print. */}
                <div className="flex flex-1 flex-col justify-center px-[3mm]">
                  <p className="truncate text-[12pt] font-bold leading-tight text-brand-secondary">
                    {p.personName}
                  </p>
                  <div className="mt-[1mm] flex items-baseline justify-between gap-[2mm]">
                    <p className={cn(
                      'truncate text-[6pt]',
                      valid ? 'text-gray-500' : 'font-semibold text-red-700',
                    )}>
                      {p.validUntilLabel}
                    </p>
                    <p className="shrink-0 font-mono text-[5.5pt] font-bold text-gray-400">{p.code}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="no-print mt-4 max-w-xl text-xs leading-relaxed text-gray-400">
        Cards print at 85.6 × 54 mm — standard credit-card size, so they fit an
        off-the-shelf laminating pouch without trimming. Eight to an A4 sheet;
        cut along the dashed edges. Print at 100% scale, not &ldquo;fit to page&rdquo;,
        or they will come out the wrong size for the pouches.
        <br />
        Tell security this month&rsquo;s colour is <strong>{colour.name}</strong> — anything
        else is last month&rsquo;s card.
      </p>
    </div>
  );
}
