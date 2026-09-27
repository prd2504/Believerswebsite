/**
 * Student/Parent fees page — view payment history and pending fees.
 */

import { useState, useEffect, useCallback } from 'react';
import { IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getPaymentsByStudent } from '@/services/paymentService';
import { PaymentCard } from '@/components/payments/PaymentCard';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { formatINR } from '@bba/shared';
import type { PaymentDocument } from '@bba/shared';

export default function FeesPage() {
  const { profile } = useAuth();
  const [payments, setPayments] = useState<PaymentDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      // For students: fetch by their linked student ids. For now use profile.id.
      const studentIds = profile.linkedStudentIds?.length
        ? profile.linkedStudentIds
        : [profile.id];
      const allPayments: PaymentDocument[] = [];
      for (const sid of studentIds) {
        const data = await getPaymentsByStudent(sid);
        allPayments.push(...data);
      }
      setPayments(allPayments);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load fees');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const pending = payments.filter((p) => p.status === 'PENDING' || p.status === 'OVERDUE');
  const paid = payments.filter((p) => p.status === 'PAID');
  const totalDue = pending.reduce((sum, p) => sum + p.totalAmountPaise, 0);

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Fees</h1>
        <CardSkeleton count={3} />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Fees</h1>

      {/* Due summary */}
      {totalDue > 0 && (
        <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-xs text-yellow-600">Total Due</p>
          <p className="text-2xl font-bold text-yellow-800">
            {formatINR(totalDue, { withDecimals: false })}
          </p>
          <p className="text-xs text-yellow-600">
            {pending.length} pending payment{pending.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {payments.length === 0 ? (
        <EmptyState
          icon={<IndianRupee size={48} />}
          title="No fee records"
          description="Your fee history will appear here once your academy records payments."
        />
      ) : (
        <div className="space-y-6">
          {/* Pending */}
          {pending.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-brand-secondary">Pending</h2>
              <div className="grid grid-cols-1 gap-3">
                {pending.map((p) => (
                  <PaymentCard key={p.id} payment={p} />
                ))}
              </div>
            </div>
          )}

          {/* Paid */}
          {paid.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-brand-secondary">Paid</h2>
              <div className="grid grid-cols-1 gap-3">
                {paid.map((p) => (
                  <PaymentCard key={p.id} payment={p} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
