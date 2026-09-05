import { useState } from 'react';
import { X, History } from 'lucide-react';
import { StudentStatus, type StudentDocument } from '@bba/shared';
import { cn } from '@/lib/cn';

const STATUS_OPTIONS: { value: StudentStatus; label: string; desc: string; color: string }[] = [
  {
    value: 'ACTIVE',
    label: 'Active',
    desc: 'Currently attending, fees due each month',
    color: 'bg-green-50 border-green-200 text-green-700',
  },
  {
    value: 'DORMANT',
    label: 'Dormant',
    desc: 'Not paying right now — may return later. No fees generated.',
    color: 'bg-orange-50 border-orange-200 text-orange-700',
  },
  {
    value: 'ON_HOLD',
    label: 'On Hold',
    desc: 'Planned pause (injury / travel). No fees while on hold.',
    color: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  },
  {
    value: 'GRADUATED',
    label: 'Graduated',
    desc: 'Completed the programme.',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
  },
  {
    value: 'LEFT',
    label: 'Left',
    desc: 'Permanently exited the academy.',
    color: 'bg-gray-50 border-gray-200 text-gray-600',
  },
];

interface Props {
  student: StudentDocument;
  onClose: () => void;
  onConfirm: (newStatus: StudentStatus, reason: string) => Promise<void>;
}

export function StatusChangeDialog({ student, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<StudentStatus>(student.status);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const noChange = selected === student.status;

  const handleSubmit = async () => {
    if (noChange) return;
    setBusy(true);
    try {
      await onConfirm(selected, reason);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 p-4">
          <div>
            <h2 className="text-base font-semibold text-brand-secondary">Change Status</h2>
            <p className="mt-0.5 text-xs text-gray-500">{student.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-50">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2 p-4">
          {STATUS_OPTIONS.map((opt) => {
            const isCurrent = opt.value === student.status;
            const isSelected = opt.value === selected;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelected(opt.value)}
                disabled={busy}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg border-2 p-3 text-left transition',
                  isSelected
                    ? 'border-brand-primary bg-brand-primary/5'
                    : 'border-gray-100 hover:border-gray-200',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 rounded-full border px-2 py-0.5 text-[10px] font-bold',
                    opt.color,
                  )}
                >
                  {opt.label}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-brand-secondary">
                    {opt.label} {isCurrent && <span className="text-xs text-gray-400">(current)</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">{opt.desc}</p>
                </div>
              </button>
            );
          })}

          {!noChange && (
            <div className="pt-2">
              <label className="label">Reason (optional)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  selected === 'DORMANT'
                    ? 'e.g. Did not pay for June; may return'
                    : selected === 'ON_HOLD'
                      ? 'e.g. Travelling June 15 – July 10'
                      : 'Free-text note'
                }
                rows={2}
                className="input"
                disabled={busy}
              />
            </div>
          )}

          {student.statusHistory && student.statusHistory.length > 0 && (
            <details className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-gray-600">
                <History size={12} /> History ({student.statusHistory.length})
              </summary>
              <ul className="mt-2 space-y-1.5">
                {student.statusHistory
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <li key={i} className="text-xs text-gray-500">
                      <span className="font-medium text-gray-700">
                        {h.from} → {h.to}
                      </span>{' '}
                      · {new Date(h.changedAt).toLocaleDateString('en-IN')}
                      {h.reason && <span className="text-gray-400"> — {h.reason}</span>}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
          <button onClick={onClose} className="btn-secondary" disabled={busy}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy || noChange}
            className="btn-primary disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Update Status'}
          </button>
        </div>
      </div>
    </div>
  );
}
