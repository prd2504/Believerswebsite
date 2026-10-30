/**
 * Admin Dashboard — summary cards, centre occupancy, quick actions.
 * This is the first real page replacing the placeholder from Step 1.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Layers, Users, TrendingUp, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { getAllCentres } from '@/services/centreService';
import { getAllBatches } from '@/services/batchService';
import { paths } from '@/router/paths';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { cn } from '@/lib/cn';
import type { CentreDocument, BatchDocument } from '@bba/shared';

interface CentreOccupancy {
  centre: CentreDocument;
  totalCapacity: number;
  totalEnrolled: number;
  batchCount: number;
  occupancyPct: number;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [c, b] = await Promise.all([getAllCentres(), getAllBatches()]);
      setCentres(c);
      setBatches(b);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived data
  const activeCentres = centres.filter((c) => c.active).length;
  const activeBatches = batches.filter((b) => b.status === 'ACTIVE').length;
  const totalEnrolled = batches.reduce((sum, b) => sum + b.currentEnrolment, 0);
  const totalCapacity = batches.reduce((sum, b) => sum + b.maxCapacity, 0);
  const overallOccupancy = totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;

  const centreOccupancies: CentreOccupancy[] = centres.map((centre) => {
    const centreBatches = batches.filter((b) => b.centreId === centre.id);
    const cap = centreBatches.reduce((s, b) => s + b.maxCapacity, 0);
    const enr = centreBatches.reduce((s, b) => s + b.currentEnrolment, 0);
    return {
      centre,
      totalCapacity: cap,
      totalEnrolled: enr,
      batchCount: centreBatches.length,
      occupancyPct: cap > 0 ? Math.round((enr / cap) * 100) : 0,
    };
  });

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Dashboard</h1>
        <CardSkeleton count={4} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-secondary">Dashboard</h1>
        <p className="text-sm text-gray-400">BBA Sports Admin</p>
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard icon={<MapPin size={20} />} label="Active Centres" value={activeCentres} color="text-blue-600 bg-blue-50" />
        <SummaryCard icon={<Layers size={20} />} label="Active Batches" value={activeBatches} color="text-purple-600 bg-purple-50" />
        <SummaryCard icon={<Users size={20} />} label="Total Enrolled" value={totalEnrolled} color="text-green-600 bg-green-50" />
        <SummaryCard icon={<TrendingUp size={20} />} label="Overall Occupancy" value={`${overallOccupancy}%`} color="text-brand-primary bg-brand-primary-light" />
      </div>

      {/* Quick actions */}
      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate(paths.admin.centres)} className="btn-secondary">
            <Plus size={14} /> Add Centre
          </button>
          <button onClick={() => navigate(paths.admin.batches)} className="btn-secondary">
            <Plus size={14} /> Add Batch
          </button>
          <button onClick={() => navigate(paths.admin.students)} className="btn-secondary">
            <Plus size={14} /> Add Student
          </button>
        </div>
      </div>

      {/* Centre-wise occupancy */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">Centre-wise Occupancy</h2>
        {centreOccupancies.length === 0 ? (
          <div className="card text-center text-sm text-gray-500 py-8">
            No centres yet. <button onClick={() => navigate(paths.admin.centres)} className="text-brand-primary hover:underline">Add your first centre</button>
          </div>
        ) : (
          <div className="space-y-3">
            {centreOccupancies.map((co) => (
              <div key={co.centre.id} className="card flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-brand-secondary">{co.centre.name}</h3>
                    <span className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                      co.centre.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500',
                    )}>
                      {co.centre.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {co.batchCount} batch{co.batchCount !== 1 ? 'es' : ''} &middot; {co.totalEnrolled}/{co.totalCapacity} students
                  </p>
                </div>
                <div className="w-32 shrink-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Occupancy</span>
                    <span className="font-semibold text-brand-secondary">{co.occupancyPct}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                    <div
                      className={cn(
                        'h-2 rounded-full transition-all',
                        co.occupancyPct >= 90 ? 'bg-red-400' : co.occupancyPct >= 70 ? 'bg-yellow-400' : 'bg-green-400',
                      )}
                      style={{ width: `${Math.min(co.occupancyPct, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="card flex items-center gap-3">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', color)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-brand-secondary">{value}</p>
        <p className="truncate text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}
