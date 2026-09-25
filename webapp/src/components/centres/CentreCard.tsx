/**
 * Card display for a single centre in the list view.
 */

import { MapPin, Grid3X3, Clock, Pencil, Trash2 } from 'lucide-react';
import type { CentreDocument } from '@bba/shared';
import { cn } from '@/lib/cn';

interface CentreCardProps {
  centre: CentreDocument;
  onEdit: (centre: CentreDocument) => void;
  onDelete: (centre: CentreDocument) => void;
}

export function CentreCard({ centre, onEdit, onDelete }: CentreCardProps) {
  const activeDays = centre.operatingHours.filter((h) => !h.closed).length;

  return (
    <div className="card group relative transition-shadow hover:shadow-card-hover">
      {/* Status badge */}
      <div className="mb-3 flex items-center justify-between">
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-medium',
            centre.active
              ? 'bg-green-50 text-green-700'
              : 'bg-gray-100 text-gray-500',
          )}
        >
          {centre.active ? 'Active' : 'Inactive'}
        </span>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => onEdit(centre)}
            className="btn-ghost p-1.5"
            aria-label="Edit centre"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(centre)}
            className="btn-ghost p-1.5 text-red-500 hover:bg-red-50"
            aria-label="Delete centre"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Name & address */}
      <h3 className="text-base font-semibold text-brand-secondary">{centre.name}</h3>
      <p className="mt-1 flex items-start gap-1.5 text-sm text-gray-500">
        <MapPin size={14} className="mt-0.5 shrink-0" />
        <span>{centre.address}, {centre.city} — {centre.pincode}</span>
      </p>

      {/* Stats row */}
      <div className="mt-4 flex items-center gap-4 border-t border-gray-50 pt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Grid3X3 size={13} />
          {centre.courtCount} court{centre.courtCount !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={13} />
          {activeDays} day{activeDays !== 1 ? 's' : ''}/week
        </span>
        <span className="rounded bg-brand-primary-light px-1.5 py-0.5 text-xs font-medium text-brand-primary">
          {centre.sportTypes.join(', ')}
        </span>
      </div>

      {/* Google Maps link */}
      {centre.googleMapsUrl && (
        <a
          href={centre.googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs font-medium text-brand-primary hover:underline"
        >
          Get Directions &rarr;
        </a>
      )}
    </div>
  );
}
