/**
 * Financial Analytics — month-on-month revenue, collection rates, and centre-wise
 * performance for the super admin. Reads from the payments collection directly;
 * no pre-aggregated summaries required.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { IndianRupee, TrendingUp, TrendingDown, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { getAllPayments } from '@/services/paymentService';
import { getAllCentres } from '@/services/centreService';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { formatINR } from '@bba/shared';
import type { PaymentDocument, CentreDocument } from '@bba/shared';

const BRAND_PRIMARY = '#E8593C';
const CHART_COLORS = ['#E8593C', '#1A1A2E', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

function paiseToLakh(paise: number) {
  return +(paise / 10_000_000).toFixed(2);
}

function paiseToK(paise: number) {
  return +(paise / 100_000).toFixed(1);
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function collectionRate(collected: number, billed: number) {
  return billed > 0 ? Math.round((collected / billed) * 100) : 0;
}

export default function AnalyticsPage() {
  const [payments, setPayments] = useState<PaymentDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthRange, setMonthRange] = useState(6); // last N months

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [pData, cData] = await Promise.all([getAllPayments(), getAllCentres()]);
      setPayments(pData);
      setCentres(cData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  // Build sorted list of all months present in payments
  const allMonths = useMemo(() => {
    const s = new Set(payments.map((p) => p.month));
    return [...s].sort();
  }, [payments]);

  // Last N months to display
  const displayMonths = allMonths.slice(-monthRange);

  // Month-on-month revenue data
  const monthlyData = useMemo(() => {
    return displayMonths.map((month) => {
      const monthPayments = payments.filter((p) => p.month === month);
      const billed = monthPayments.reduce((s, p) => s + p.totalAmountPaise, 0);
      const collected = monthPayments.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.totalAmountPaise, 0);
      const pending = monthPayments.filter((p) => p.status === 'PENDING').reduce((s, p) => s + p.totalAmountPaise, 0);
      const overdue = monthPayments.filter((p) => p.status === 'OVERDUE').reduce((s, p) => s + p.totalAmountPaise, 0);
      return {
        month: monthLabel(month),
        raw: month,
        billedK: paiseToK(billed),
        collectedK: paiseToK(collected),
        pendingK: paiseToK(pending),
        overdueK: paiseToK(overdue),
        rate: collectionRate(collected, billed),
        billedPaise: billed,
        collectedPaise: collected,
      };
    });
  }, [displayMonths, payments]);

  // Centre-wise breakdown for latest month with data
  const latestMonth = displayMonths[displayMonths.length - 1];
  const centreData = useMemo(() => {
    if (!latestMonth) return [];
    const monthPayments = payments.filter((p) => p.month === latestMonth);
    const centreIds = [...new Set(monthPayments.map((p) => p.centreId))];
    return centreIds.map((cid, i) => {
      const cp = monthPayments.filter((p) => p.centreId === cid);
      const billed = cp.reduce((s, p) => s + p.totalAmountPaise, 0);
      const collected = cp.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.totalAmountPaise, 0);
      return {
        name: centreMap.get(cid) ?? cid,
        collectedK: paiseToK(collected),
        billedK: paiseToK(billed),
        rate: collectionRate(collected, billed),
        color: CHART_COLORS[i % CHART_COLORS.length],
      };
    }).sort((a, b) => b.collectedK - a.collectedK);
  }, [latestMonth, payments, centreMap]);

  // Collection status breakdown for latest month (pie chart data)
  const statusData = useMemo(() => {
    if (!latestMonth) return [];
    const mp = payments.filter((p) => p.month === latestMonth);
    const byStatus: Record<string, number> = {};
    mp.forEach((p) => {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + p.totalAmountPaise;
    });
    const colors: Record<string, string> = {
      PAID: '#10B981',
      PENDING: '#F59E0B',
      OVERDUE: '#EF4444',
      WAIVED: '#8B5CF6',
      REFUNDED: '#6B7280',
    };
    return Object.entries(byStatus).map(([status, paise]) => ({
      name: status.charAt(0) + status.slice(1).toLowerCase(),
      value: paiseToK(paise),
      color: colors[status] ?? '#9CA3AF',
    }));
  }, [latestMonth, payments]);

  // Summary stats for the latest month
  const latestMonthRow = monthlyData[monthlyData.length - 1];
  const prevMonthRow = monthlyData[monthlyData.length - 2];
  const revenueChange = latestMonthRow && prevMonthRow
    ? latestMonthRow.collectedPaise - prevMonthRow.collectedPaise
    : null;

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Analytics</h1>
        <CardSkeleton count={4} />
      </div>
    );
  }

  if (allMonths.length === 0) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Analytics</h1>
        <div className="card py-16 text-center text-sm text-gray-500">
          No payment data yet. Generate monthly fees to see analytics.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Analytics</h1>
          <p className="text-sm text-gray-500">Financial performance across all centres</p>
        </div>
        <select
          value={monthRange}
          onChange={(e) => setMonthRange(Number(e.target.value))}
          className="input w-auto py-2 text-sm"
        >
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
          <option value={999}>All time</option>
        </select>
      </div>

      {/* KPI cards */}
      {latestMonthRow && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            icon={<IndianRupee size={18} />}
            label="Collected (latest month)"
            value={formatINR(latestMonthRow.collectedPaise, { withDecimals: false })}
            color="bg-green-50 text-green-600"
            sub={revenueChange !== null
              ? (revenueChange >= 0 ? '+' : '') + formatINR(Math.abs(revenueChange), { withDecimals: false }) + ' vs prev'
              : undefined}
            trend={revenueChange !== null ? (revenueChange >= 0 ? 'up' : 'down') : undefined}
          />
          <KpiCard
            icon={<IndianRupee size={18} />}
            label="Billed (latest month)"
            value={formatINR(latestMonthRow.billedPaise, { withDecimals: false })}
            color="bg-blue-50 text-blue-600"
          />
          <KpiCard
            icon={<Percent size={18} />}
            label="Collection rate"
            value={`${latestMonthRow.rate}%`}
            color="bg-brand-primary-light text-brand-primary"
            sub={prevMonthRow ? `Was ${prevMonthRow.rate}% last month` : undefined}
            trend={prevMonthRow ? (latestMonthRow.rate >= prevMonthRow.rate ? 'up' : 'down') : undefined}
          />
          <KpiCard
            icon={<IndianRupee size={18} />}
            label="Pending + Overdue"
            value={formatINR((latestMonthRow.pendingK + latestMonthRow.overdueK) * 100_000, { withDecimals: false })}
            color="bg-yellow-50 text-yellow-600"
          />
        </div>
      )}

      {/* Month-on-month revenue bar chart */}
      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-brand-secondary">Revenue — Month on Month (₹ thousands)</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit="K" />
            <Tooltip
              formatter={(v: unknown, name: unknown) => [`₹${v}K`, String(name)]}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="collectedK" name="Collected" fill={BRAND_PRIMARY} radius={[3, 3, 0, 0]} />
            <Bar dataKey="pendingK" name="Pending" fill="#F59E0B" radius={[3, 3, 0, 0]} />
            <Bar dataKey="overdueK" name="Overdue" fill="#EF4444" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Collection rate trend line chart */}
      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-brand-secondary">Collection Rate Trend (%)</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
            <Tooltip formatter={(v: unknown) => [`${v}%`, 'Collection Rate']} contentStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="rate"
              name="Collection Rate"
              stroke={BRAND_PRIMARY}
              strokeWidth={2}
              dot={{ r: 4, fill: BRAND_PRIMARY }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom row: centre breakdown + status pie */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Centre-wise bar chart */}
        <div className="card">
          <h2 className="mb-1 text-sm font-semibold text-brand-secondary">Centre-wise Performance</h2>
          <p className="mb-4 text-xs text-gray-400">{latestMonth ? monthLabel(latestMonth) : ''}</p>
          {centreData.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-400">No data for this month.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={centreData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} unit="K" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} />
                <Tooltip formatter={(v: unknown, name: unknown) => [`₹${v}K`, String(name)]} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="collectedK" name="Collected" fill={BRAND_PRIMARY} radius={[0, 3, 3, 0]} />
                <Bar dataKey="billedK" name="Billed" fill="#D1D5DB" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status breakdown pie */}
        <div className="card">
          <h2 className="mb-1 text-sm font-semibold text-brand-secondary">Payment Status Breakdown</h2>
          <p className="mb-4 text-xs text-gray-400">{latestMonth ? monthLabel(latestMonth) : ''} · by amount (₹ thousands)</p>
          {statusData.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-400">No data for this month.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                  labelLine={false}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: unknown) => [`₹${v}K`]} contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Centre collection rate table */}
      {centreData.length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="mb-3 text-sm font-semibold text-brand-secondary">Centre Collection Summary — {latestMonth ? monthLabel(latestMonth) : ''}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="pb-2 pr-4 font-medium">Centre</th>
                <th className="pb-2 pr-4 font-medium text-right">Billed</th>
                <th className="pb-2 pr-4 font-medium text-right">Collected</th>
                <th className="pb-2 font-medium text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {centreData.map((c) => (
                <tr key={c.name} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-4 font-medium text-brand-secondary">{c.name}</td>
                  <td className="py-2 pr-4 text-right text-gray-600">₹{c.billedK}K</td>
                  <td className="py-2 pr-4 text-right text-gray-600">₹{c.collectedK}K</td>
                  <td className="py-2 text-right">
                    <span className={`font-semibold ${c.rate >= 80 ? 'text-green-600' : c.rate >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
                      {c.rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  sub?: string;
  trend?: 'up' | 'down';
}

function KpiCard({ icon, label, value, color, sub, trend }: KpiCardProps) {
  return (
    <div className="card flex items-start gap-3">
      <div className={`rounded-lg p-2 ${color}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold text-brand-secondary">{value}</p>
        <p className="truncate text-xs text-gray-500">{label}</p>
        {sub && (
          <p className={`mt-0.5 flex items-center gap-0.5 text-xs ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
            {trend === 'up' ? <TrendingUp size={11} /> : trend === 'down' ? <TrendingDown size={11} /> : null}
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}
