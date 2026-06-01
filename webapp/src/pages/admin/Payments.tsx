/**
 * Admin payments page — create fees, record cash payments, track overdue.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  IndianRupee,
  Download,
  Search,
  RefreshCw,
  LayoutGrid,
  LayoutList,
  Columns3,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Ticket,
  Clock,
  ExternalLink,
  Trash2,
  Settings,
  Lock,
  ChevronLeft,
  ChevronRight,
  Archive,
  Unlock,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { exportPaymentsCsv } from '@/lib/csv';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  getAllPayments,
  createPayment,
  updatePayment,
  deletePayment,
  markPaymentPaid,
  waivePayment,
  generateMonthlyFees,
} from '@/services/paymentService';
import {
  getBookingsForMonth,
  verifyBooking,
  rejectBooking,
  deleteBooking,
  subscribeToConfig,
  updateBookingConfig,
} from '@/services/slotBookingService';
import {
  getMonthlySummary,
  closeMonth,
  reopenMonth,
} from '@/services/monthCloseoutService';
import { getAllCentres } from '@/services/centreService';
import { getAllBatches } from '@/services/batchService';
import { getAllStudents } from '@/services/studentService';
import { PaymentCard } from '@/components/payments/PaymentCard';
import { PaymentForm } from '@/components/payments/PaymentForm';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import {
  formatINR,
  paiseToRupees,
  SlotBookingStatus,
  SLOT_PLANS,
  DEFAULT_SLOT_CONFIG,
} from '@bba/shared';
import type {
  PaymentDocument,
  CentreDocument,
  BatchDocument,
  StudentDocument,
  SlotBookingDocument,
  SlotBookingConfig,
  PaymentMonthlySummary,
} from '@bba/shared';
import type { PaymentFormValues } from '@/lib/schemas/paymentSchema';

type PageTab = 'payments' | 'slotBookings';
type Mode = 'list' | 'create' | 'edit';
type ViewMode = 'card' | 'table' | 'detail';
type SortField = 'month' | 'status' | 'total' | 'dueDate' | 'student';
type SortDir = 'asc' | 'desc';

const VIEW_OPTIONS: { id: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'card', label: 'Cards', icon: LayoutGrid },
  { id: 'table', label: 'Table', icon: Columns3 },
  { id: 'detail', label: 'Details', icon: LayoutList },
];

function fmtMonth(m: string) {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  const d = new Date(Number(y), Number(mo) - 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function fmtMonthLong(m: string) {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  const d = new Date(Number(y), Number(mo) - 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_PILL: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-700',
  PAID: 'bg-green-50 text-green-700',
  OVERDUE: 'bg-red-50 text-red-700',
  WAIVED: 'bg-blue-50 text-blue-700',
  REFUNDED: 'bg-gray-100 text-gray-500',
};

// ─── Sort header for table view ───────────────────────────────────────────────

function SortButton({
  field,
  label,
  current,
  dir,
  onSort,
}: {
  field: SortField;
  label: string;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = current === field;
  return (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
    >
      {label}
      {active && (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  );
}

// ─── Expandable detail row ────────────────────────────────────────────────────

function DetailRow({
  payment: p,
  studentName,
  batchName,
  centreName,
  onMarkPaid,
  onWaive,
  onEdit,
}: {
  payment: PaymentDocument;
  studentName: string;
  batchName: string;
  centreName: string;
  onMarkPaid: () => void;
  onWaive: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isPending = p.status === 'PENDING' || p.status === 'OVERDUE';

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-brand-secondary truncate">{studentName}</p>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_PILL[p.status])}>
              {p.status}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{fmtMonth(p.month)} · {batchName}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-brand-secondary">{formatINR(p.totalAmountPaise, { withDecimals: false })}</p>
          <p className="text-xs text-gray-400">{fmtDate(p.dueDate)}</p>
        </div>
        {open ? <ChevronUp size={16} className="shrink-0 text-gray-400" /> : <ChevronDown size={16} className="shrink-0 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-50 bg-gray-50/50 px-4 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-gray-400">Base Amount</span>
              <p className="font-medium text-gray-700">{formatINR(p.baseAmountPaise, { withDecimals: false })}</p>
            </div>
            <div>
              <span className="text-gray-400">GST ({p.gstRatePercentSnapshot}%)</span>
              <p className="font-medium text-gray-700">{formatINR(p.gstAmountPaise, { withDecimals: false })}</p>
            </div>
            <div>
              <span className="text-gray-400">Method</span>
              <p className="font-medium text-gray-700">{p.method === 'NONE' ? '—' : p.method.replace('_', ' ')}</p>
            </div>
            <div>
              <span className="text-gray-400">Paid Date</span>
              <p className="font-medium text-gray-700">{fmtDate(p.paidAt)}</p>
            </div>
            <div>
              <span className="text-gray-400">Receipt</span>
              <p className="font-medium text-gray-700">{p.receiptNumber ?? '—'}</p>
            </div>
            <div>
              <span className="text-gray-400">Centre</span>
              <p className="font-medium text-gray-700 truncate">{centreName}</p>
            </div>
            {p.notes && (
              <div className="col-span-2">
                <span className="text-gray-400">Notes</span>
                <p className="font-medium text-gray-700">{p.notes}</p>
              </div>
            )}
          </div>
          {isPending && (
            <div className="mt-3 flex gap-2">
              <button onClick={onMarkPaid} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                Mark Paid
              </button>
              <button onClick={onWaive} className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100">
                Waive
              </button>
              <button onClick={onEdit} className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                Edit
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Slot Bookings Tab ────────────────────────────────────────────────────────

const BOOKING_STATUS_PILL: Record<string, string> = {
  PENDING_PAYMENT: 'bg-gray-100 text-gray-600',
  PENDING_VERIFICATION: 'bg-yellow-50 text-yellow-700',
  CONFIRMED: 'bg-green-50 text-green-700',
  REJECTED: 'bg-red-50 text-red-700',
  EXPIRED: 'bg-gray-100 text-gray-400',
};

const BOOKING_CENTRES = [
  { id: 'ruia-college', name: 'Ruia College (Booking Portal)' },
];

const WEEKDAY_SLOTS = ['06:00-07:00', '07:00-08:00', '08:00-09:00'] as const;
const SATURDAY_SLOT = '07:00-09:00';
const ALL_SLOTS = [...WEEKDAY_SLOTS, SATURDAY_SLOT];
const SLOT_DISPLAY: Record<string, string> = {
  '06:00-07:00': '6–7 AM (MWF)',
  '07:00-08:00': '7–8 AM (MWF)',
  '08:00-09:00': '8–9 AM (MWF)',
  '07:00-09:00': '7–9 AM (Sat)',
};

function bookingSlotCount(bookings: SlotBookingDocument[], slot: string): number {
  if (slot === SATURDAY_SLOT) {
    return bookings.filter(
      (b) => b.planType === 'COMPLETE_BUNDLE' || b.planType === 'GAMES_DAY',
    ).length;
  }
  return bookings.filter(
    (b) =>
      b.timeSlot === slot &&
      (b.planType === 'TWO_DAY' || b.planType === 'THREE_DAY' || b.planType === 'COMPLETE_BUNDLE'),
  ).length;
}

function SlotBookingsTab({ centres, profile }: { centres: CentreDocument[]; profile: { id: string } | null }) {
  const [bookings, setBookings] = useState<SlotBookingDocument[]>([]);
  const [portalConfig, setPortalConfig] = useState<SlotBookingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCentre, setSelectedCentre] = useState('ruia-college');
  const [statusFilter, setStatusFilter] = useState('');
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [configDraft, setConfigDraft] = useState({
    weekdayCapacity: DEFAULT_SLOT_CONFIG.weekdayCapacity,
    saturdayCapacity: DEFAULT_SLOT_CONFIG.saturdayCapacity,
    isOpen: DEFAULT_SLOT_CONFIG.isOpen,
    closedSlots: [] as string[],
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    const target = d.getDate() >= 25
      ? new Date(d.getFullYear(), d.getMonth() + 1, 1)
      : new Date(d.getFullYear(), d.getMonth(), 1);
    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
  });

  const allCentreOptions = useMemo(() => {
    const existing = centres.map((c) => ({ id: c.id, name: c.name }));
    const bookingIds = new Set(existing.map((c) => c.id));
    const extra = BOOKING_CENTRES.filter((c) => !bookingIds.has(c.id));
    return [...extra, ...existing];
  }, [centres]);

  // Real-time config subscription
  useEffect(() => {
    if (!selectedCentre) return;
    return subscribeToConfig(selectedCentre, (cfg) => {
      setPortalConfig(cfg);
      setConfigDraft({
        weekdayCapacity: cfg.weekdayCapacity,
        saturdayCapacity: cfg.saturdayCapacity,
        isOpen: cfg.isOpen,
        closedSlots: cfg.closedSlots ?? [],
      });
    });
  }, [selectedCentre]);

  const load = useCallback(async () => {
    if (!selectedCentre) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getBookingsForMonth(selectedCentre, month);
      setBookings(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load slot bookings');
    } finally {
      setLoading(false);
    }
  }, [selectedCentre, month]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!statusFilter) return bookings;
    return bookings.filter((b) => b.status === statusFilter);
  }, [bookings, statusFilter]);

  const pendingCount = bookings.filter(
    (b) => b.status === SlotBookingStatus.PENDING_VERIFICATION || b.status === SlotBookingStatus.PENDING_PAYMENT,
  ).length;
  const confirmedCount = bookings.filter((b) => b.status === SlotBookingStatus.CONFIRMED).length;

  const weekdayCap = portalConfig?.weekdayCapacity ?? DEFAULT_SLOT_CONFIG.weekdayCapacity;
  const saturdayCap = portalConfig?.saturdayCapacity ?? DEFAULT_SLOT_CONFIG.saturdayCapacity;
  const isPortalOpen = portalConfig?.isOpen ?? DEFAULT_SLOT_CONFIG.isOpen;
  const closedSlots = portalConfig?.closedSlots ?? [];

  const handleVerify = async (booking: SlotBookingDocument) => {
    if (!profile) return;
    try {
      await verifyBooking(booking.id, profile.id);
      toast.success(`Confirmed booking for ${booking.participantName}`);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to verify booking');
    }
  };

  const handleReject = async (booking: SlotBookingDocument) => {
    if (!profile) return;
    const reason = prompt('Reason for rejection:');
    if (reason === null) return;
    try {
      await rejectBooking(booking.id, profile.id, reason || 'Payment not found');
      toast.success(`Rejected booking for ${booking.participantName}`);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to reject booking');
    }
  };

  const handleDelete = async (booking: SlotBookingDocument) => {
    if (!confirm(`Delete booking for ${booking.participantName}? This cannot be undone.`)) return;
    try {
      await deleteBooking(booking.id);
      toast.success(`Deleted booking for ${booking.participantName}`);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete booking');
    }
  };

  const handleToggleOpen = async () => {
    if (!profile || !selectedCentre) return;
    const newVal = !isPortalOpen;
    try {
      await updateBookingConfig(selectedCentre, { isOpen: newVal }, profile.id);
      toast.success(newVal ? 'Booking portal opened' : 'Booking portal closed');
    } catch (err) {
      console.error(err);
      toast.error('Failed to update portal status');
    }
  };

  const handleSaveConfig = async () => {
    if (!profile || !selectedCentre) return;
    setSavingConfig(true);
    try {
      await updateBookingConfig(
        selectedCentre,
        {
          weekdayCapacity: configDraft.weekdayCapacity,
          saturdayCapacity: configDraft.saturdayCapacity,
          isOpen: configDraft.isOpen,
          closedSlots: configDraft.closedSlots,
        },
        profile.id,
      );
      toast.success('Config saved');
      setShowConfigEditor(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save config');
    } finally {
      setSavingConfig(false);
    }
  };

  const planLabel = (pt: string) => SLOT_PLANS.find((p) => p.planType === pt)?.label ?? pt;

  return (
    <div>
      {/* Admin controls row */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          onClick={handleToggleOpen}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition',
            isPortalOpen
              ? 'bg-green-50 text-green-700 hover:bg-green-100'
              : 'bg-red-50 text-red-600 hover:bg-red-100',
          )}
        >
          {isPortalOpen ? (
            <>
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              Portal OPEN — Click to Close
            </>
          ) : (
            <>
              <Lock size={12} />
              Portal CLOSED — Click to Open
            </>
          )}
        </button>
        <button
          onClick={() => setShowConfigEditor(!showConfigEditor)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
        >
          <Settings size={13} /> Manage Capacity
        </button>
        <a
          href="/book/ruia"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
        >
          <ExternalLink size={13} /> View Portal
        </a>
      </div>

      {/* Config editor panel */}
      {showConfigEditor && (
        <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-blue-800">
            <Settings size={14} /> Slot Configuration
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Weekday Capacity (per MWF slot)
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={configDraft.weekdayCapacity}
                onChange={(e) =>
                  setConfigDraft((d) => ({ ...d, weekdayCapacity: Number(e.target.value) }))
                }
                className="input py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Saturday Capacity (Games Day)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={configDraft.saturdayCapacity}
                onChange={(e) =>
                  setConfigDraft((d) => ({ ...d, saturdayCapacity: Number(e.target.value) }))
                }
                className="input py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Close Individual Slots (blocks new bookings for that slot)
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() =>
                    setConfigDraft((d) => ({
                      ...d,
                      closedSlots: d.closedSlots.includes(slot)
                        ? d.closedSlots.filter((s) => s !== slot)
                        : [...d.closedSlots, slot],
                    }))
                  }
                  className={cn(
                    'rounded-lg border px-2.5 py-1 text-xs font-medium transition',
                    configDraft.closedSlots.includes(slot)
                      ? 'border-red-300 bg-red-100 text-red-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                  )}
                >
                  {configDraft.closedSlots.includes(slot) ? '✗ ' : '✓ '}
                  {SLOT_DISPLAY[slot]}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleSaveConfig}
              disabled={savingConfig}
              className="btn-primary py-1.5 text-xs disabled:opacity-60"
            >
              {savingConfig ? 'Saving…' : 'Save Changes'}
            </button>
            <button onClick={() => setShowConfigEditor(false)} className="btn-secondary py-1.5 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Slot fill rates */}
      <div className="mb-5 rounded-xl border border-gray-100 bg-white p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Slot Fill Rates — {fmtMonth(month)}
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ALL_SLOTS.map((slot) => {
            const cnt = bookingSlotCount(bookings, slot);
            const cap = slot === SATURDAY_SLOT ? saturdayCap : weekdayCap;
            const pct = cap > 0 ? Math.min(100, Math.round((cnt / cap) * 100)) : 0;
            const isFull = cnt >= cap;
            const isClosed = closedSlots.includes(slot);
            return (
              <div
                key={slot}
                className={cn(
                  'rounded-lg border p-3',
                  isClosed
                    ? 'border-gray-200 bg-gray-50'
                    : isFull
                      ? 'border-red-100 bg-red-50'
                      : pct >= 80
                        ? 'border-amber-100 bg-amber-50'
                        : 'border-green-100 bg-green-50',
                )}
              >
                <p className="text-[10px] font-medium text-gray-500">{SLOT_DISPLAY[slot]}</p>
                <p
                  className={cn(
                    'mt-1 text-lg font-bold',
                    isClosed
                      ? 'text-gray-400'
                      : isFull
                        ? 'text-red-600'
                        : 'text-brand-secondary',
                  )}
                >
                  {cnt}
                  <span className="text-xs font-normal text-gray-400">/{cap}</span>
                </p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      isFull || isClosed ? 'bg-red-400' : pct >= 80 ? 'bg-amber-400' : 'bg-green-400',
                    )}
                    style={{ width: `${isClosed ? 100 : pct}%` }}
                  />
                </div>
                {(isFull || isClosed) && (
                  <p className="mt-1 text-[10px] font-semibold text-red-500">
                    {isClosed ? 'Closed' : 'FULL'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={selectedCentre}
          onChange={(e) => setSelectedCentre(e.target.value)}
          className="input w-auto py-2 text-sm"
        >
          <option value="">Select Centre</option>
          {allCentreOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="input w-auto py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="PENDING_PAYMENT">Pending Payment</option>
          <option value="PENDING_VERIFICATION">Pending Verification</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <button onClick={load} className="btn-secondary" title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-yellow-50 p-2"><Clock size={18} className="text-yellow-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Pending</p>
            <p className="text-lg font-bold text-brand-secondary">{pendingCount}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-green-50 p-2"><CheckCircle2 size={18} className="text-green-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Confirmed</p>
            <p className="text-lg font-bold text-brand-secondary">{confirmedCount}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2"><Ticket size={18} className="text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-lg font-bold text-brand-secondary">{bookings.length}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <CardSkeleton count={4} />
      ) : !selectedCentre ? (
        <EmptyState
          icon={<Ticket size={48} />}
          title="Select a centre"
          description="Choose a centre to view slot bookings."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Ticket size={48} />}
          title="No slot bookings"
          description="No bookings found for the selected month and filters."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Phone</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 hidden md:table-cell">Plan</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 hidden lg:table-cell">Slot</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Amount</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((b) => (
                <tr key={b.id} className="transition hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-brand-secondary">{b.participantName}</td>
                  <td className="px-4 py-2.5 text-gray-600">{b.participantPhone}</td>
                  <td className="hidden px-4 py-2.5 text-gray-600 md:table-cell">{planLabel(b.planType)}</td>
                  <td className="hidden px-4 py-2.5 text-gray-500 lg:table-cell">{b.timeSlot}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-brand-secondary">
                    {formatINR(b.amountPaise, { withDecimals: false })}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                        BOOKING_STATUS_PILL[b.status],
                      )}
                    >
                      {b.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {(b.status === SlotBookingStatus.PENDING_VERIFICATION ||
                        b.status === SlotBookingStatus.PENDING_PAYMENT) && (
                        <>
                          <button
                            onClick={() => handleVerify(b)}
                            className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700"
                            title="Verify payment"
                          >
                            <CheckCircle2 size={13} className="inline mr-0.5" /> Verify
                          </button>
                          <button
                            onClick={() => handleReject(b)}
                            className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                            title="Reject booking"
                          >
                            <XCircle size={13} className="inline mr-0.5" /> Reject
                          </button>
                        </>
                      )}
                      {b.status === SlotBookingStatus.REJECTED && b.rejectionReason && (
                        <span
                          className="max-w-[120px] truncate text-xs text-red-400"
                          title={b.rejectionReason}
                        >
                          {b.rejectionReason}
                        </span>
                      )}
                      <button
                        onClick={() => handleDelete(b)}
                        className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition"
                        title="Delete booking"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const { profile } = useAuth();
  const [pageTab, setPageTab] = useState<PageTab>('payments');
  const [payments, setPayments] = useState<PaymentDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('list');
  const [editTarget, setEditTarget] = useState<PaymentDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [genMonth, setGenMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [genCentreId, setGenCentreId] = useState('');

  // Filters — month defaults to the current month so the page is always scoped
  // to "this month" instead of dumping every payment ever
  const [centreFilter, setCentreFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState(() => currentMonth());
  const [search, setSearch] = useState('');

  // Close-month state — keyed by `${centreId}_${month}`, only meaningful when a
  // single centre is selected. We refetch when the centre+month combo changes.
  const [monthSummary, setMonthSummary] = useState<PaymentMonthlySummary | null>(null);
  const [closingMonth, setClosingMonth] = useState(false);

  useEffect(() => {
    if (!centreFilter || !monthFilter) {
      setMonthSummary(null);
      return;
    }
    let cancelled = false;
    getMonthlySummary(centreFilter, monthFilter)
      .then((s) => { if (!cancelled) setMonthSummary(s); })
      .catch(() => { if (!cancelled) setMonthSummary(null); });
    return () => { cancelled = true; };
  }, [centreFilter, monthFilter]);
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [sortField, setSortField] = useState<SortField>('month');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  // Lookup maps
  const studentMap = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [students]);

  const batchMap = useMemo(() => {
    const m = new Map<string, string>();
    batches.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [batches]);

  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  function handleExport() {
    if (filtered.length === 0) {
      toast.info('Nothing to export.');
      return;
    }
    exportPaymentsCsv(filtered, studentMap, batchMap, centreMap);
    toast.success(`Exported ${filtered.length} payment records`);
  }

  // Filtered list
  const filtered = useMemo(() => {
    let result = payments;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => {
        const sName = studentMap.get(p.studentId) ?? '';
        const bName = batchMap.get(p.batchId) ?? '';
        return sName.toLowerCase().includes(q) || bName.toLowerCase().includes(q) || (p.notes ?? '').toLowerCase().includes(q);
      });
    }
    if (centreFilter) result = result.filter((p) => p.centreId === centreFilter);
    if (statusFilter) result = result.filter((p) => p.status === statusFilter);
    if (monthFilter) result = result.filter((p) => p.month === monthFilter);

    const dir = sortDir === 'asc' ? 1 : -1;
    result = [...result].sort((a, b) => {
      switch (sortField) {
        case 'month': return a.month.localeCompare(b.month) * dir;
        case 'status': return a.status.localeCompare(b.status) * dir;
        case 'total': return (a.totalAmountPaise - b.totalAmountPaise) * dir;
        case 'dueDate': return ((a.dueDate ?? '').localeCompare(b.dueDate ?? '')) * dir;
        case 'student': return ((studentMap.get(a.studentId) ?? '').localeCompare(studentMap.get(b.studentId) ?? '')) * dir;
        default: return 0;
      }
    });
    return result;
  }, [payments, search, studentMap, batchMap, centreFilter, statusFilter, monthFilter, sortField, sortDir]);

  // Summary stats
  const totalBilled = filtered.reduce((sum, p) => sum + p.totalAmountPaise, 0);
  const totalCollected = filtered.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + p.totalAmountPaise, 0);
  const pendingCount = filtered.filter((p) => p.status === 'PENDING' || p.status === 'OVERDUE').length;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [pData, cData, bData, sData] = await Promise.all([
        getAllPayments(),
        getAllCentres(),
        getAllBatches(),
        getAllStudents(),
      ]);
      setPayments(pData);
      setCentres(cData);
      setBatches(bData);
      setStudents(sData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (values: PaymentFormValues) => {
    if (!profile) return;
    setBusy(true);
    try {
      await createPayment(values, profile.id);
      toast.success('Payment record created');
      setMode('list');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create payment');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (values: PaymentFormValues) => {
    if (!profile || !editTarget) return;
    setBusy(true);
    try {
      await updatePayment(editTarget.id, values, profile.id);
      toast.success('Payment updated');
      setMode('list');
      setEditTarget(null);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update payment');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (payment: PaymentDocument) => {
    if (!confirm('Delete this payment record? This cannot be undone.')) return;
    try {
      await deletePayment(payment.id);
      toast.success('Payment deleted');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete payment');
    }
  };

  const handleMarkPaid = async (payment: PaymentDocument) => {
    if (!profile) return;
    const method = prompt('Payment method? (CASH, BANK_TRANSFER, CHEQUE)', 'CASH');
    if (!method) return;
    try {
      await markPaymentPaid(payment.id, method as any, null, profile.id);
      toast.success('Marked as paid');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to mark as paid');
    }
  };

  const handleWaive = async (payment: PaymentDocument) => {
    if (!profile) return;
    if (!confirm('Waive this payment? The student will not be charged.')) return;
    try {
      await waivePayment(payment.id, profile.id, 'Waived by admin');
      toast.success('Payment waived');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to waive payment');
    }
  };

  const handleEdit = (payment: PaymentDocument) => {
    setEditTarget(payment);
    setMode('edit');
  };

  const handleGenerateFees = async () => {
    if (!profile || !genMonth) return;
    setBusy(true);
    try {
      const res = await generateMonthlyFees(genMonth, profile.id, genCentreId || undefined);
      const parts = [`Generated ${res.created} fee${res.created !== 1 ? 's' : ''}`];
      if (res.skipped > 0) parts.push(`${res.skipped} already existed`);
      if (res.pausedSkipped > 0) parts.push(`${res.pausedSkipped} paused`);
      if (res.dormantSkipped > 0) parts.push(`${res.dormantSkipped} dormant/on-hold`);
      toast.success(parts.join(' · '));
      setShowGenDialog(false);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate fees');
    } finally {
      setBusy(false);
    }
  };

  const handleCloseMonth = async () => {
    if (!profile || !centreFilter || !monthFilter) {
      toast.info('Pick a single centre and month before closing.');
      return;
    }
    if (!confirm(
      `Close ${fmtMonthLong(monthFilter)} for ${centreMap.get(centreFilter) ?? 'this centre'}? ` +
      `This snapshots the totals and marks the month read-only. You can reopen it later if needed.`,
    )) return;
    setClosingMonth(true);
    try {
      const s = await closeMonth(centreFilter, monthFilter, profile.id);
      setMonthSummary(s);
      toast.success(`${fmtMonthLong(monthFilter)} closed`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to close month');
    } finally {
      setClosingMonth(false);
    }
  };

  const handleReopenMonth = async () => {
    if (!profile || !centreFilter || !monthFilter) return;
    if (!confirm(`Reopen ${fmtMonthLong(monthFilter)}? Mutation actions will be re-enabled.`)) return;
    setClosingMonth(true);
    try {
      await reopenMonth(centreFilter, monthFilter, profile.id);
      setMonthSummary((s) => (s ? { ...s, closedAt: null, closedBy: null } : null));
      toast.success(`${fmtMonthLong(monthFilter)} reopened`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to reopen month');
    } finally {
      setClosingMonth(false);
    }
  };

  const monthIsClosed = !!monthSummary?.closedAt;

  function paymentToFormValues(p: PaymentDocument): Partial<PaymentFormValues> {
    return {
      studentId: p.studentId,
      batchId: p.batchId,
      centreId: p.centreId,
      month: p.month,
      baseAmountRupees: paiseToRupees(p.baseAmountPaise),
      gstRatePercent: p.gstRatePercentSnapshot,
      method: p.method,
      status: p.status,
      dueDate: p.dueDate ?? '',
      notes: p.notes ?? '',
    };
  }

  // ── Create / Edit ──

  if (mode === 'create') {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Record Payment</h1>
        <div className="card">
          <PaymentForm
            centres={centres}
            batches={batches}
            students={students}
            onSubmit={handleCreate}
            onCancel={() => setMode('list')}
            busy={busy}
          />
        </div>
      </div>
    );
  }

  if (mode === 'edit' && editTarget) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Edit Payment</h1>
        <div className="card">
          <PaymentForm
            centres={centres}
            batches={batches}
            students={students}
            initialValues={paymentToFormValues(editTarget)}
            onSubmit={handleUpdate}
            onCancel={() => { setMode('list'); setEditTarget(null); }}
            busy={busy}
          />
        </div>
      </div>
    );
  }

  // ── List view ──

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-5 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setPageTab('payments')}
          className={cn(
            'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
            pageTab === 'payments' ? 'bg-white text-brand-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <IndianRupee size={14} className="inline mr-1" />
          Payments
        </button>
        <button
          type="button"
          onClick={() => setPageTab('slotBookings')}
          className={cn(
            'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
            pageTab === 'slotBookings' ? 'bg-white text-brand-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <Ticket size={14} className="inline mr-1" />
          Slot Bookings
        </button>
      </div>

      {pageTab === 'slotBookings' ? (
        <SlotBookingsTab centres={centres} profile={profile} />
      ) : (
      <>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Payments</h1>
          <p className="text-sm text-gray-500">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 bg-white">
            {VIEW_OPTIONS.map((v) => {
              const Icon = v.icon;
              return (
                <button
                  key={v.id}
                  onClick={() => setViewMode(v.id)}
                  title={v.label}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition',
                    viewMode === v.id ? 'bg-brand-primary text-white' : 'text-gray-500 hover:bg-gray-50',
                    v.id === 'card' && 'rounded-l-lg',
                    v.id === 'detail' && 'rounded-r-lg',
                  )}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              );
            })}
          </div>
          <button onClick={handleExport} className="btn-secondary" title="Export visible rows to CSV">
            <Download size={16} /> <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => {
              if (monthFilter) setGenMonth(monthFilter);
              if (centreFilter) setGenCentreId(centreFilter);
              setShowGenDialog(true);
            }}
            className="btn-secondary"
            title="Bulk-create monthly fee records"
            disabled={monthIsClosed}
          >
            <RefreshCw size={16} /> <span className="hidden sm:inline">Generate Fees</span>
          </button>
          <button
            onClick={() => setMode('create')}
            className="btn-primary"
            disabled={monthIsClosed}
          >
            <Plus size={16} /> Record Payment
          </button>
        </div>
      </div>

      {/* Month navigator — primary segregation control */}
      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthFilter((m) => shiftMonth(m || currentMonth(), -1))}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="input w-auto py-1.5 text-sm font-semibold"
          />
          <button
            onClick={() => setMonthFilter((m) => shiftMonth(m || currentMonth(), 1))}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => setMonthFilter(currentMonth())}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-medium transition',
              monthFilter === currentMonth()
                ? 'bg-brand-primary/10 text-brand-primary'
                : 'text-gray-500 hover:bg-gray-50',
            )}
          >
            This Month
          </button>
          {monthFilter && (
            <span className="ml-2 text-sm font-semibold text-brand-secondary">
              {fmtMonthLong(monthFilter)}
            </span>
          )}
          {monthIsClosed && (
            <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
              <Lock size={10} /> Closed {monthSummary?.closedAt && `· ${new Date(monthSummary.closedAt).toLocaleDateString('en-IN')}`}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!centreFilter && (
            <span className="text-xs text-gray-400">
              Pick a centre to close / reopen the month
            </span>
          )}
          {centreFilter && !monthIsClosed && (
            <button
              onClick={handleCloseMonth}
              disabled={closingMonth}
              className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
              title="Snapshot totals and lock this month"
            >
              <Archive size={12} /> Close Month
            </button>
          )}
          {centreFilter && monthIsClosed && (
            <button
              onClick={handleReopenMonth}
              disabled={closingMonth}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              title="Unlock this month for edits"
            >
              <Unlock size={12} /> Reopen Month
            </button>
          )}
        </div>
      </div>

      {/* Summary cards — scoped to selected month + filters */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-green-50 p-2"><IndianRupee size={18} className="text-green-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Collected {monthFilter ? `in ${fmtMonth(monthFilter)}` : ''}</p>
            <p className="text-lg font-bold text-brand-secondary">{formatINR(totalCollected, { withDecimals: false })}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2"><IndianRupee size={18} className="text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Total Billed</p>
            <p className="text-lg font-bold text-brand-secondary">{formatINR(totalBilled, { withDecimals: false })}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-yellow-50 p-2"><IndianRupee size={18} className="text-yellow-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Pending / Overdue</p>
            <p className="text-lg font-bold text-brand-secondary">{pendingCount}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by student, batch, or notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <select value={centreFilter} onChange={(e) => setCentreFilter(e.target.value)} className="input w-auto py-2 text-sm">
          <option value="">All Centres</option>
          {centres.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="OVERDUE">Overdue</option>
          <option value="WAIVED">Waived</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <button
          onClick={() => setMonthFilter('')}
          className={cn(
            'rounded-lg border px-3 py-2 text-xs font-medium transition',
            monthFilter
              ? 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              : 'border-brand-primary bg-brand-primary/5 text-brand-primary',
          )}
          title={monthFilter ? 'Clear month filter — show all months' : 'Showing all months'}
        >
          {monthFilter ? 'Show all months' : 'All months'}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <CardSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IndianRupee size={48} />}
          title="No payment records"
          description="Create fee entries for students to start tracking payments."
          action={
            <button onClick={() => setMode('create')} className="btn-primary">
              <Plus size={16} /> Record your first payment
            </button>
          }
        />
      ) : (
        <>
          {/* ── Card view ── */}
          {viewMode === 'card' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <PaymentCard
                  key={p.id}
                  payment={p}
                  studentName={studentMap.get(p.studentId)}
                  batchName={batchMap.get(p.batchId)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onMarkPaid={handleMarkPaid}
                  onWaive={handleWaive}
                />
              ))}
            </div>
          )}

          {/* ── Table view ── */}
          {viewMode === 'table' && (
            <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3">
                      <SortButton field="student" label="Student" current={sortField} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Batch</span>
                    </th>
                    <th className="px-4 py-3">
                      <SortButton field="month" label="Month" current={sortField} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3 text-right">
                      <SortButton field="total" label="Total" current={sortField} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Base + GST</span>
                    </th>
                    <th className="px-4 py-3">
                      <SortButton field="dueDate" label="Due" current={sortField} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3">
                      <SortButton field="status" label="Status" current={sortField} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Method</span>
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-2.5 font-medium text-brand-secondary max-w-[160px] truncate">
                        {studentMap.get(p.studentId) ?? p.studentId}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 max-w-[120px] truncate hidden md:table-cell">
                        {batchMap.get(p.batchId) ?? p.batchId}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtMonth(p.month)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-brand-secondary whitespace-nowrap">
                        {formatINR(p.totalAmountPaise, { withDecimals: false })}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap hidden lg:table-cell">
                        {formatINR(p.baseAmountPaise, { withDecimals: false })} + {formatINR(p.gstAmountPaise, { withDecimals: false })}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(p.dueDate)}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', STATUS_PILL[p.status])}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 hidden lg:table-cell">
                        {p.method === 'NONE' ? '—' : p.method.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-2.5">
                        {(p.status === 'PENDING' || p.status === 'OVERDUE') && (
                          <button
                            onClick={() => handleMarkPaid(p)}
                            className="rounded-lg bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 whitespace-nowrap"
                          >
                            Mark Paid
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Detail view (expandable rows) ── */}
          {viewMode === 'detail' && (
            <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden divide-y divide-gray-50">
              {filtered.map((p) => (
                <DetailRow
                  key={p.id}
                  payment={p}
                  studentName={studentMap.get(p.studentId) ?? p.studentId}
                  batchName={batchMap.get(p.batchId) ?? p.batchId}
                  centreName={centreMap.get(p.centreId) ?? p.centreId}
                  onMarkPaid={() => handleMarkPaid(p)}
                  onWaive={() => handleWaive(p)}
                  onEdit={() => handleEdit(p)}
                />
              ))}
            </div>
          )}

          <p className="mt-2 text-right text-xs text-gray-400">
            Showing {filtered.length} of {payments.length}
          </p>
        </>
      )}

      {/* Generate Monthly Fees dialog */}
      {showGenDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white shadow-xl">
            <div className="border-b border-gray-100 p-4">
              <h2 className="text-base font-semibold text-brand-secondary">Generate Monthly Fees</h2>
              <p className="mt-0.5 text-xs text-gray-400">
                Creates a PENDING fee record for every active enrollment. Existing records for the same student+batch+month are skipped.
              </p>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <label className="label">Month</label>
                <input
                  type="month"
                  value={genMonth}
                  onChange={(e) => setGenMonth(e.target.value)}
                  className="input"
                  disabled={busy}
                />
              </div>
              <div>
                <label className="label">Centre (optional — leave blank for all)</label>
                <select
                  value={genCentreId}
                  onChange={(e) => setGenCentreId(e.target.value)}
                  className="input"
                  disabled={busy}
                >
                  <option value="">All Centres</option>
                  {centres.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
              <button onClick={() => setShowGenDialog(false)} className="btn-secondary" disabled={busy}>Cancel</button>
              <button onClick={handleGenerateFees} className="btn-primary" disabled={busy || !genMonth}>
                {busy ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
