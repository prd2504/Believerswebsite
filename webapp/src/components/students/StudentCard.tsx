/**
 * Card display for a single student in the list view.
 */

import { Phone, Mail, Pencil, Trash2, Calendar, RefreshCw } from 'lucide-react';
import type { StudentDocument } from '@bba/shared';
import { ageFromDob } from '@bba/shared';
import { cn } from '@/lib/cn';

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-50 text-green-700',
  ON_HOLD: 'bg-yellow-50 text-yellow-700',
  DORMANT: 'bg-orange-50 text-orange-700',
  GRADUATED: 'bg-blue-50 text-blue-700',
  LEFT: 'bg-gray-100 text-gray-500',
};

const LEVEL_STYLES: Record<string, string> = {
  BEGINNER: 'bg-blue-50 text-blue-700',
  INTERMEDIATE: 'bg-purple-50 text-purple-700',
  ADVANCED: 'bg-red-50 text-red-700',
};

const GENDER_LABEL: Record<string, string> = {
  M: 'Male',
  F: 'Female',
  OTHER: 'Other',
  UNDISCLOSED: '',
};

interface StudentCardProps {
  student: StudentDocument;
  centreName?: string;
  batchNames?: string[];
  onEdit: (student: StudentDocument) => void;
  onDelete: (student: StudentDocument) => void;
  onChangeStatus?: (student: StudentDocument) => void;
}

export function StudentCard({ student, centreName, batchNames, onEdit, onDelete, onChangeStatus }: StudentCardProps) {
  const age = ageFromDob(student.dateOfBirth);

  return (
    <div className="card group relative transition-shadow hover:shadow-card-hover">
      {/* Status + level badges & actions */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onChangeStatus ? () => onChangeStatus(student) : undefined}
            disabled={!onChangeStatus}
            title={onChangeStatus ? 'Click to change status' : student.status.replace('_', ' ')}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium',
              STATUS_STYLES[student.status] ?? STATUS_STYLES.LEFT,
              onChangeStatus && 'cursor-pointer hover:ring-2 hover:ring-offset-1 transition',
            )}
          >
            {student.status.replace('_', ' ')}
            {onChangeStatus && <RefreshCw size={9} className="ml-1 inline" />}
          </button>
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', LEVEL_STYLES[student.level] ?? LEVEL_STYLES.BEGINNER)}>
            {student.level}
          </span>
        </div>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={() => onEdit(student)} className="btn-ghost p-1.5" aria-label="Edit student">
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(student)} className="btn-ghost p-1.5 text-red-500 hover:bg-red-50" aria-label="Delete student">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Name & meta */}
      <h3 className="text-base font-semibold text-brand-secondary">{student.name}</h3>
      <p className="mt-0.5 text-xs text-gray-400">
        {age > 0 && `${age} yrs`}
        {age > 0 && GENDER_LABEL[student.gender] && ' · '}
        {GENDER_LABEL[student.gender]}
        {(age > 0 || GENDER_LABEL[student.gender]) && student.guardianName && ' · '}
        {student.guardianName && `Guardian: ${student.guardianName}`}
      </p>

      {/* Centre & batches */}
      {centreName && <p className="mt-1.5 text-xs text-gray-500">{centreName}</p>}
      {batchNames && batchNames.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {batchNames.map((name) => (
            <span key={name} className="rounded bg-brand-surface px-1.5 py-0.5 text-[11px] text-gray-600">
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Contact & joined */}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-50 pt-3 text-xs text-gray-500">
        {student.phone && (
          <span className="flex items-center gap-1">
            <Phone size={12} />
            {student.phone}
          </span>
        )}
        {student.email && (
          <span className="flex items-center gap-1">
            <Mail size={12} />
            {student.email}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Calendar size={12} />
          Joined {student.joinedDate}
        </span>
      </div>
    </div>
  );
}
