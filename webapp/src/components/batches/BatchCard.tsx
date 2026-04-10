/**
 * Card display for a single batch in the list view.
 */

import { Users, Clock, Pencil, Trash2 } from 'lucide-react';
import type { BatchDocument } from '@bba/shared';
import { paiseToRupees, formatINR } from '@bba/shared';
import { cn } from '@/lib/cn';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-50 text-green-700',
  PAUSED: 'bg-yellow-50 text-yellow-700',
  INACTIVE: 'bg-gray-100 text-gray-500',
};

const LEVEL_STYLES: Record<string, string> = {
  BEGINNER: 'bg-blue-50 text-blue-700',
  INTERMEDIATE: 'bg-purple-50 text-purple-700',
  ADVANCED: 'bg-red-50 text-red-700',
};

interface BatchCardProps {
  batch: BatchDocument;
  centreName?: string;
  onEdit: (batch: BatchDocument) => void;
  onDelete: (batch: BatchDocument) => void;
}

export function BatchCard({ batch, centreName, onEdit, onDelete }: BatchCardProps) {
  const occupancyPct = batch.maxCapacity > 0
    ? Math.round((batch.currentEnrolment / batch.maxCapacity) * 100)
    : 0;

  const scheduleText = batch.schedule
    .map((s) => `${DAY_SHORT[s.dayOfWeek]} ${s.startTime}–${s.endTime}`)
    .join(', ');

  return (
    <div className="card group relative transition-shadow hover:shadow-card-hover">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[batch.status] ?? STATUS_STYLES.INACTIVE)}>
            {batch.status}
          </span>
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', LEVEL_STYLES[batch.level] ?? LEVEL_STYLES.BEGINNER)}>
            {batch.level}
          </span>
        </div>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={() => onEdit(batch)} className="btn-ghost p-1.5" aria-label="Edit batch">
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(batch)} className="btn-ghost p-1.5 text-red-500 hover:bg-red-50" aria-label="Delete batch">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <h3 className="text-base font-semibold text-brand-secondary">{batch.name}</h3>
      {centreName && <p className="text-xs text-gray-400">{centreName}</p>}

      {/* Schedule */}
      <p className="mt-2 flex items-start gap-1.5 text-sm text-gray-500">
        <Clock size={14} className="mt-0.5 shrink-0" />
        <span>{scheduleText || 'No schedule set'}</span>
      </p>

      {/* Stats */}
      <div className="mt-4 flex items-center justify-between border-t border-gray-50 pt-3">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Users size={13} />
          <span>{batch.currentEnrolment}/{batch.maxCapacity}</span>
          <span className="text-gray-300">({occupancyPct}%)</span>
        </div>
        <span className="text-sm font-semibold text-brand-secondary">
          {formatINR(batch.monthlyFeePaise, { withDecimals: false })}/mo
        </span>
      </div>

      {/* Occupancy bar */}
      <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
        <div
          className={cn(
            'h-1.5 rounded-full transition-all',
            occupancyPct >= 90 ? 'bg-red-400' : occupancyPct >= 70 ? 'bg-yellow-400' : 'bg-green-400',
          )}
          style={{ width: `${Math.min(occupancyPct, 100)}%` }}
        />
      </div>
    </div>
  );
}
