/**
 * Coach dashboard — today's batches, quick stats, recent activity.
 */

import { useState, useEffect, useCallback } from 'react';
import { Users, ClipboardCheck, BarChart3, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getBatchesByCoach } from '@/services/batchService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import type { BatchDocument } from '@bba/shared';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CoachDashboard() {
  const { profile } = useAuth();
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const data = await getBatchesByCoach(profile.id);
      setBatches(data.filter((b) => b.status === 'ACTIVE'));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const todayDow = new Date().getDay();
  const todayBatches = batches.filter((b) =>
    b.schedule.some((s) => s.dayOfWeek === todayDow),
  );
  const totalStudents = batches.reduce((sum, b) => sum + b.currentEnrolment, 0);

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
        Welcome, {profile?.name?.split(' ')[0] ?? 'Coach'}
      </h1>
      <p className="mb-5 text-xs text-gray-400">{DAY_SHORT[todayDow]}, {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2"><Users size={18} className="text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-500">My Students</p>
            <p className="text-lg font-bold text-brand-secondary">{totalStudents}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-green-50 p-2"><ClipboardCheck size={18} className="text-green-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Active Batches</p>
            <p className="text-lg font-bold text-brand-secondary">{batches.length}</p>
          </div>
        </div>
      </div>

      {/* Today's sessions */}
      <h2 className="mb-3 text-sm font-semibold text-brand-secondary">Today's Sessions</h2>
      {todayBatches.length === 0 ? (
        <p className="mb-6 text-xs text-gray-400">No sessions scheduled for today.</p>
      ) : (
        <div className="mb-6 space-y-2">
          {todayBatches.map((batch) => {
            const todaySlots = batch.schedule.filter((s) => s.dayOfWeek === todayDow);
            return todaySlots.map((slot, idx) => (
              <div key={`${batch.id}-${idx}`} className="card flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-brand-secondary">{batch.name}</p>
                  <p className="text-xs text-gray-400">{batch.currentEnrolment} students</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Calendar size={12} />
                  {slot.startTime} – {slot.endTime}
                </div>
              </div>
            ));
          })}
        </div>
      )}

      {/* Quick actions */}
      <h2 className="mb-3 text-sm font-semibold text-brand-secondary">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-3">
        <a href="/coach/attendance" className="card flex items-center gap-2 text-sm font-medium text-brand-primary hover:shadow-card-hover">
          <ClipboardCheck size={16} /> Mark Attendance
        </a>
        <a href="/coach/progress" className="card flex items-center gap-2 text-sm font-medium text-brand-primary hover:shadow-card-hover">
          <BarChart3 size={16} /> Enter Scores
        </a>
      </div>
    </div>
  );
}
