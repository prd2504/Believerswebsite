/**
 * Card display for a single payment record.
 */

import { IndianRupee, Calendar, Pencil, Trash2, CheckCircle, XCircle } from 'lucide-react';
import type { PaymentDocument } from '@bba/shared';
import { formatINR } from '@bba/shared';
import { cn } from '@/lib/cn';

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-700',
  PAID: 'bg-green-50 text-green-700',
  OVERDUE: 'bg-red-50 text-red-700',
  WAIVED: 'bg-blue-50 text-blue-700',
  REFUNDED: 'bg-gray-100 text-gray-500',
};

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  RAZORPAY: 'Razorpay',
  BANK_TRANSFER: 'Bank Transfer',
  CHEQUE: 'Cheque',
  NONE: '—',
};

interface PaymentCardProps {
  payment: PaymentDocument;
  studentName?: string;
  batchName?: string;
  onEdit?: (payment: PaymentDocument) => void;
  onDelete?: (payment: PaymentDocument) => void;
  onMarkPaid?: (payment: PaymentDocument) => void;
  onWaive?: (payment: PaymentDocument) => void;
}

export function PaymentCard({
  payment,
  studentName,
  batchName,
  onEdit,
  onDelete,
  onMarkPaid,
  onWaive,
}: PaymentCardProps) {
  const isPending = payment.status === 'PENDING' || payment.status === 'OVERDUE';

  return (
    <div className="card group relative transition-shadow hover:shadow-card-hover">
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[payment.status] ?? STATUS_STYLES.PENDING)}>
            {payment.status}
          </span>
          <span className="text-xs text-gray-400">{METHOD_LABEL[payment.method]}</span>
        </div>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {isPending && onMarkPaid && (
            <button onClick={() => onMarkPaid(payment)} className="btn-ghost p-1.5 text-green-600 hover:bg-green-50" aria-label="Mark paid">
              <CheckCircle size={14} />
            </button>
          )}
          {isPending && onWaive && (
            <button onClick={() => onWaive(payment)} className="btn-ghost p-1.5 text-blue-600 hover:bg-blue-50" aria-label="Waive">
              <XCircle size={14} />
            </button>
          )}
          {onEdit && (
            <button onClick={() => onEdit(payment)} className="btn-ghost p-1.5" aria-label="Edit payment">
              <Pencil size={14} />
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(payment)} className="btn-ghost p-1.5 text-red-500 hover:bg-red-50" aria-label="Delete payment">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Student & batch */}
      {studentName && <h3 className="text-sm font-semibold text-brand-secondary">{studentName}</h3>}
      {batchName && <p className="text-xs text-gray-400">{batchName}</p>}

      {/* Amount & month */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1 text-lg font-bold text-brand-secondary">
          <IndianRupee size={16} />
          {formatINR(payment.totalAmountPaise, { withDecimals: false })}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Calendar size={12} />
          {payment.month}
        </div>
      </div>

      {/* Notes */}
      {payment.notes && (
        <p className="mt-2 text-xs italic text-gray-400">{payment.notes}</p>
      )}
    </div>
  );
}
