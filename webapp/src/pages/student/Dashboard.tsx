/**
 * Student/Parent dashboard — upcoming sessions, quick stats, recent activity.
 */

import { useState, useEffect, useCallback } from 'react';
import { Calendar, IndianRupee, BarChart3, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getAllBatches } from '@/services/batchService';
import { getPaymentsByStudent } from '@/services/paymentService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { formatINR } from '@bba/shared';
import type { BatchDocument, PaymentDocument } from '@bba/shared';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function StudentDashboard() {
  const { profile } = useAuth();
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [payments, setPayments] = useState<PaymentDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const studentIds = profile.linkedStudentIds?.length
        ? profile.linkedStudentIds
        : [profile.id];

      const [bData] = await Promise.all([getAllBatches()]);
      // Filter to batches the student is in
      const myBatches = bData.filter((b) =>
        b.studentIds.some((sid) => studentIds.includes(sid)),
      );
      setBatches(myBatches);

      const allPayments: PaymentDocument[] = [];
      for (const sid of studentIds) {
        const p = await getPaymentsByStudent(sid);
        allPayments.push(...p);
      }
      setPayments(allPayments);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const todayDow = new Date().getDay();
  // Note: this shows batches the student is enrolled in that *run* today. The student's
  // own selectedDays filter happens at the EnrollmentDocument level — see Schedule.tsx
  // for the per-day expansion. This dashboard is a coarse "today's possible sessions" view.
  const todaySessions = batches
    .filter((b) => b.offeredDays.includes(todayDow as never))
    .map((b) => ({ batchName: b.name, startTime: b.startTime, endTime: b.endTime }));

  const pendingPayments = payments.filter((p) => p.status === 'PENDING' || p.status === 'OVERDUE');
  const totalDue = pendingPayments.reduce((sum, p) => sum + p.totalAmountPaise, 0);

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">Dashboard</h1>
        <CardSkeleton count={3} />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="mb-1 text-lg font-bold text-brand-secondary">
        Welcome, {profile?.name?.split(' ')[0] ?? 'Player'}
      </h1>
      <p className="mb-5 text-xs text-gray-400">{DAY_SHORT[todayDow]}, {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2"><Calendar size={18} className="text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-500">My Batches</p>
            <p className="text-lg font-bold text-brand-secondary">{batches.length}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className={`rounded-lg p-2 ${totalDue > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
            <IndianRupee size={18} className={totalDue > 0 ? 'text-red-600' : 'text-green-600'} />
          </div>
          <div>
            <p className="text-xs text-gray-500">Due Amount</p>
            <p className="text-lg font-bold text-brand-secondary">
              {totalDue > 0 ? formatINR(totalDue, { withDecimals: false }) : 'Nil'}
            </p>
          </div>
        </div>
      </div>

      {/* Today's sessions */}
      <h2 className="mb-3 text-sm font-semibold text-brand-secondary">Today's Sessions</h2>
      {todaySessions.length === 0 ? (
        <p className="mb-6 text-xs text-gray-400">No sessions today. Enjoy your rest day!</p>
      ) : (
        <div className="mb-6 space-y-2">
          {todaySessions.map((s, i) => (
            <div key={i} className="card flex items-center justify-between">
              <p className="text-sm font-medium text-brand-secondary">{s.batchName}</p>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Calendar size={12} />
                {s.startTime} – {s.endTime}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending fees alert */}
      {pendingPayments.length > 0 && (
        <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 p-3">
          <p className="text-xs font-medium text-yellow-700">
            You have {pendingPayments.length} pending payment{pendingPayments.length !== 1 ? 's' : ''} totalling {formatINR(totalDue, { withDecimals: false })}
          </p>
          <a href="/me/fees" className="mt-1 inline-block text-xs font-semibold text-yellow-800 underline">
            View Fees →
          </a>
        </div>
      )}

      {/* Quick actions */}
      <h2 className="mb-3 text-sm font-semibold text-brand-secondary">Quick Links</h2>
      <div className="grid grid-cols-2 gap-3">
        <a href="/me/attendance" className="card flex items-center gap-2 text-sm font-medium text-brand-primary hover:shadow-card-hover">
          <ClipboardCheck size={16} /> Attendance
        </a>
        <a href="/me/progress" className="card flex items-center gap-2 text-sm font-medium text-brand-primary hover:shadow-card-hover">
          <BarChart3 size={16} /> Progress
        </a>
      </div>
    </div>
  );
}
