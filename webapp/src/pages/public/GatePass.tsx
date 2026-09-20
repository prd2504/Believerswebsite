/**
 * The gate pass, as the guard sees it.
 *
 * Designed to be judged in about one second, from arm's length, by someone
 * checking forty people at 6 AM who will not scan anything:
 *
 *   - A full-bleed colour band that CHANGES EVERY MONTH. This is the real
 *     check. Nobody reads forty dates, but nobody misses that today's passes
 *     are amber and this one is last month's teal.
 *   - The month in the largest type on the screen.
 *   - The name second, large.
 *   - Everything else small, because it is for the office, not the gate.
 *
 * An invalid pass does not fail quietly: the whole screen turns red and says
 * NOT VALID before it says anything else. A pass that merely looked dull when
 * expired would be waved through.
 *
 * Printable at A6 via the print stylesheet, for anyone without a phone — the
 * colour band survives, and the month word is set large enough to read on
 * paper across a gate.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertCircle, Printer, RefreshCw, Download } from 'lucide-react';
import { cn } from '@/lib/cn';
import { renderPassPng } from '@/lib/pass/renderPassPng';
import type { PassPayload } from '@/lib/pass/types';

const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL
  || `https://${import.meta.env.VITE_FUNCTIONS_REGION || 'asia-south1'}-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`;


const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(ym: string): string {
  return `${MONTH_ABBR[Number(ym.slice(5, 7)) - 1] ?? ''} ${ym.slice(2, 4)}`;
}

export default function GatePass() {
  const { token } = useParams<{ token: string }>();
  const [pass, setPass] = useState<PassPayload | null>(null);
  const [colour, setColour] = useState({ bg: '#0A0A0A', fg: '#FFFFFF', name: '' });
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  // Never indexed. A pass carries a person's name and where they train.
  useEffect(() => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex, nofollow';
    document.head.appendChild(tag);
    return () => { document.head.removeChild(tag); };
  }, []);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${FUNCTIONS_BASE}/getPass?token=${encodeURIComponent(token)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? 'Could not load this pass');
      setPass(body.pass);
      setColour(body.colour);
      setToday(body.today);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this pass');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  // A pass left open overnight must not still claim to be valid in the
  // morning. Re-checking when the tab is brought back to the front costs one
  // request and removes a whole class of stale-screen problem.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <Loader2 size={30} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !pass) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 px-6">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto text-gray-300" />
          <h1 className="mt-4 text-lg font-bold text-gray-700">Pass not found</h1>
          <p className="mt-1 text-sm text-gray-500">{error || 'Please check the link you were given.'}</p>
        </div>
      </div>
    );
  }

  const valid = pass.state === 'VALID';
  // Upcoming gets its own colour: the month it will be valid in, dimmed —
  // never red. Somebody who has just paid for next month must not be shown the
  // same card as somebody who has not paid at all.
  const upcoming = pass.state === 'UPCOMING';
  const band = valid ? colour.bg : upcoming ? '#334155' : '#B91C1C';
  const bandFg = valid || upcoming ? colour.fg : '#FFFFFF';

  const headline =
    pass.state === 'VALID' ? 'ENTRY PASS'
      : pass.state === 'UPCOMING' ? 'NOT YET ACTIVE'
        : pass.state === 'PENDING' ? 'AWAITING APPROVAL'
          : pass.state === 'REJECTED' ? 'DECLINED'
            : 'NOT VALID';

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-6 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A6 portrait; margin: 6mm; }
          .no-print { display: none !important; }
          /* Colour is the whole point of the pass — keep it on paper. */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="mx-auto max-w-sm overflow-hidden rounded-2xl bg-white shadow-lg print:max-w-none print:rounded-none print:shadow-none">
        {/* Academy strip */}
        <div className="flex items-center gap-2.5 bg-brand-secondary px-4 py-3">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded object-contain" />
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wide text-white">BBA SPORTS ACADEMY</p>
            <p className="truncate text-[11px] text-gray-400">{pass.centreName}</p>
          </div>
        </div>

        {/* The band — read from across a gate */}
        <div className="px-5 py-7 text-center" style={{ background: band, color: bandFg }}>
          <p className="text-[11px] font-bold tracking-[0.25em] opacity-80">{headline}</p>
          <p className="mt-2 text-[34px] font-extrabold leading-none">{pass.validLabel}</p>
          {pass.coversMonths.length > 1 && (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {pass.coversMonths.map((m) => (
                <span
                  key={m}
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    background: 'rgba(255,255,255,.2)',
                    color: bandFg,
                    outline: m === pass.colourMonth ? `1.5px solid ${bandFg}` : 'none',
                  }}
                >
                  {monthLabel(m)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Name */}
        <div className="px-5 pt-5">
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Name</p>
          <p className="mt-0.5 text-2xl font-bold leading-tight text-brand-secondary">
            {pass.personName}
          </p>
        </div>

        <div className="px-5 pb-5 pt-4">
          <dl className="divide-y divide-gray-100 text-sm">
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-gray-500">Validity</dt>
              <dd className={`text-right font-semibold ${valid || upcoming ? 'text-brand-secondary' : 'text-red-700'}`}>
                {pass.validUntilLabel}
              </dd>
            </div>
            {pass.reasonLabel && (
              <div className="flex justify-between gap-3 py-2">
                <dt className="text-gray-500">Type</dt>
                <dd className="text-right text-brand-secondary">{pass.reasonLabel}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-gray-500">Pass code</dt>
              <dd className="text-right font-mono font-bold text-brand-secondary">{pass.code}</dd>
            </div>
            {today && (
              <div className="flex justify-between gap-3 py-2">
                <dt className="text-gray-500">Checked</dt>
                <dd className="text-right text-xs text-gray-400">{today}</dd>
              </div>
            )}
          </dl>

          {pass.message && (
            <div className={cn(
              'mt-3 rounded-lg border p-3',
              upcoming ? 'border-slate-200 bg-slate-50' : 'border-red-200 bg-red-50',
            )}>
              <p className={cn('text-xs leading-relaxed', upcoming ? 'text-slate-700' : 'text-red-800')}>
                {pass.message}
              </p>
            </div>
          )}
        </div>

        {/* Guard-facing footer, on the printed card too */}
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 text-center">
          <p className="text-[10px] leading-relaxed text-gray-500">
            Admit only if the colour band matches the current month.
            Queries: {import.meta.env.VITE_SUPPORT_PHONE || 'the centre manager'}.
          </p>
        </div>
      </div>

      <div className="no-print mx-auto mt-4 flex max-w-sm gap-2">
        <button
          onClick={async () => {
            setDownloading(true);
            try {
              const blob = await renderPassPng(pass, colour);
              if (!blob) throw new Error('render failed');
              // A blob URL rather than a canvas data URL: a data URL for an
              // image this size is a megabyte-long string, and Safari refuses
              // to download one past a certain length.
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `BBA-pass-${pass.personName.replace(/[^a-zA-Z0-9]+/g, '-')}-${pass.colourMonth}.png`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              // Revoked on the next tick — revoking immediately can cancel the
              // download in Firefox before it has started reading the blob.
              setTimeout(() => URL.revokeObjectURL(url), 10_000);
            } catch {
              // Falling back to print is better than a dead button: the pass
              // is still obtainable, just via one more step.
              window.print();
            } finally {
              setDownloading(false);
            }
          }}
          disabled={downloading}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-secondary py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {downloading
            ? <><Loader2 size={15} className="animate-spin" /> Preparing…</>
            : <><Download size={15} /> Download</>}
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700"
        >
          <Printer size={15} /> Print
        </button>
        <button
          onClick={load}
          title="Re-check this pass"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700"
        >
          <RefreshCw size={15} />
        </button>
      </div>
    </div>
  );
}
