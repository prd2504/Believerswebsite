/**
 * Admin parent feedback dashboard — view, review, escalate, and resolve
 * feedback submitted by parents. Supports manual entry via modal.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MessageSquareText,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  getAllFeedback,
  createFeedback,
  reviewFeedback,
  resolveFeedback,
} from '@/services/parentFeedbackService';
import { getAllStudents } from '@/services/studentService';
import { getAllCentres } from '@/services/centreService';
import { getAllBatches } from '@/services/batchService';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import type {
  ParentFeedbackDocument,
  StudentDocument,
  CentreDocument,
  BatchDocument,
  FeedbackStatus,
} from '@bba/shared';

const STATUS_PILL: Record<string, string> = {
  SUBMITTED: 'bg-blue-50 text-blue-700',
  REVIEWED: 'bg-green-50 text-green-700',
  ESCALATED: 'bg-red-50 text-red-700',
  RESOLVED: 'bg-gray-100 text-gray-500',
};

function npsColor(score: number): string {
  if (score >= 9) return 'text-green-700 bg-green-50';
  if (score >= 7) return 'text-yellow-700 bg-yellow-50';
  return 'text-red-700 bg-red-50';
}

function npsLabel(score: number): string {
  if (score >= 9) return 'Promoter';
  if (score >= 7) return 'Passive';
  return 'Detractor';
}

function RatingBar({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium text-gray-700">{value}/{max}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            value >= 8 ? 'bg-green-500' : value >= 5 ? 'bg-yellow-500' : 'bg-red-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Expandable feedback row ─────────────────────────────────────────────────

function FeedbackRow({
  feedback: fb,
  studentName,
  centreName,
  onReview,
  onResolve,
}: {
  feedback: ParentFeedbackDocument;
  studentName: string;
  centreName: string;
  onReview: (id: string, note: string) => Promise<void>;
  onResolve: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);

  const handleReview = async () => {
    if (!reviewNote.trim()) {
      toast.error('Please enter a review note');
      return;
    }
    setBusy(true);
    await onReview(fb.id, reviewNote.trim());
    setReviewNote('');
    setBusy(false);
  };

  const handleResolve = async () => {
    setBusy(true);
    await onResolve(fb.id);
    setBusy(false);
  };

  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-brand-secondary truncate">{fb.parentName}</p>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_PILL[fb.status])}>
              {fb.status}
            </span>
            {fb.autoEscalated && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                Auto-Escalated
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {studentName} &middot; {centreName} &middot; {fb.yearMonth}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', npsColor(fb.npsScore))}>
            NPS {fb.npsScore} &middot; {npsLabel(fb.npsScore)}
          </span>
          {fb.comment && (
            <p className="hidden md:block max-w-[200px] truncate text-xs text-gray-400">
              &ldquo;{fb.comment}&rdquo;
            </p>
          )}
          {open ? (
            <ChevronUp size={16} className="text-gray-400" />
          ) : (
            <ChevronDown size={16} className="text-gray-400" />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-50 bg-gray-50/50 px-4 py-4 space-y-4">
          {/* Ratings */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <RatingBar label="Overall Satisfaction" value={fb.overallSatisfaction} />
            <RatingBar label="Coach Quality" value={fb.coachQuality} />
            <RatingBar label="Facility Rating" value={fb.facilityRating} />
            <RatingBar label="Child Progress" value={fb.childProgressPerceived} />
          </div>

          {/* Comment */}
          {fb.comment && (
            <div>
              <span className="text-xs font-semibold uppercase text-gray-400">Comment</span>
              <p className="mt-1 text-sm text-gray-700">{fb.comment}</p>
            </div>
          )}

          {/* Review note (if already reviewed) */}
          {fb.reviewNote && (
            <div>
              <span className="text-xs font-semibold uppercase text-gray-400">Review Note</span>
              <p className="mt-1 text-sm text-gray-700">{fb.reviewNote}</p>
            </div>
          )}

          {/* Actions */}
          {(fb.status === 'SUBMITTED' || fb.status === 'ESCALATED') && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="label">Review Note</label>
                <input
                  type="text"
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Enter review note…"
                  className="input"
                  disabled={busy}
                />
              </div>
              <button
                onClick={handleReview}
                disabled={busy}
                className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                Mark Reviewed
              </button>
              <button
                onClick={handleResolve}
                disabled={busy}
                className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
              >
                Resolve
              </button>
            </div>
          )}
          {fb.status === 'REVIEWED' && (
            <button
              onClick={handleResolve}
              disabled={busy}
              className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
            >
              Mark Resolved
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function ParentFeedbackPage() {
  const { profile } = useAuth();
  const [feedback, setFeedback] = useState<ParentFeedbackDocument[]>([]);
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [centreFilter, setCentreFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [search, setSearch] = useState('');

  // Add feedback modal
  const [showModal, setShowModal] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formData, setFormData] = useState({
    studentId: '',
    centreId: '',
    batchId: '',
    parentName: '',
    parentPhone: '',
    overallSatisfaction: 7,
    coachQuality: 7,
    facilityRating: 7,
    childProgressPerceived: 7,
    npsScore: 8,
    comment: '',
  });

  // Lookup maps
  const studentMap = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [students]);

  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  // Filter
  const filtered = useMemo(() => {
    let result = feedback;
    if (centreFilter) result = result.filter((f) => f.centreId === centreFilter);
    if (statusFilter) result = result.filter((f) => f.status === statusFilter);
    if (monthFilter) result = result.filter((f) => f.yearMonth === monthFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.parentName.toLowerCase().includes(q) ||
          (studentMap.get(f.studentId) ?? '').toLowerCase().includes(q) ||
          (f.comment ?? '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [feedback, centreFilter, statusFilter, monthFilter, search, studentMap]);

  // Summary stats
  const avgNps =
    filtered.length > 0
      ? (filtered.reduce((sum, f) => sum + f.npsScore, 0) / filtered.length).toFixed(1)
      : '—';
  const avgSat =
    filtered.length > 0
      ? (
          filtered.reduce((sum, f) => sum + f.overallSatisfaction, 0) /
          filtered.length
        ).toFixed(1)
      : '—';
  const totalFeedback = filtered.length;
  const escalatedCount = filtered.filter(
    (f) => f.status === 'ESCALATED',
  ).length;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [fData, sData, cData, bData] = await Promise.all([
        getAllFeedback(),
        getAllStudents(),
        getAllCentres(),
        getAllBatches(),
      ]);
      setFeedback(fData);
      setStudents(sData);
      setCentres(cData);
      setBatches(bData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load feedback data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleReview = async (feedbackId: string, note: string) => {
    if (!profile) return;
    try {
      await reviewFeedback(feedbackId, note, profile.id);
      toast.success('Feedback marked as reviewed');
      setFeedback((prev) =>
        prev.map((f) =>
          f.id === feedbackId
            ? {
                ...f,
                status: 'REVIEWED' as FeedbackStatus,
                reviewedBy: profile.id,
                reviewNote: note,
                reviewedAt: new Date().toISOString(),
              }
            : f,
        ),
      );
    } catch (err) {
      console.error(err);
      toast.error('Failed to review feedback');
    }
  };

  const handleResolve = async (feedbackId: string) => {
    if (!profile) return;
    try {
      await resolveFeedback(feedbackId, profile.id);
      toast.success('Feedback resolved');
      setFeedback((prev) =>
        prev.map((f) =>
          f.id === feedbackId ? { ...f, status: 'RESOLVED' as FeedbackStatus } : f,
        ),
      );
    } catch (err) {
      console.error(err);
      toast.error('Failed to resolve feedback');
    }
  };

  const handleAddFeedback = async () => {
    if (!profile) return;
    if (!formData.studentId || !formData.centreId || !formData.batchId || !formData.parentName.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    setFormBusy(true);
    try {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const newFb = await createFeedback(
        {
          studentId: formData.studentId,
          centreId: formData.centreId,
          batchId: formData.batchId,
          yearMonth,
          parentName: formData.parentName.trim(),
          parentPhone: formData.parentPhone.trim() || null,
          overallSatisfaction: formData.overallSatisfaction,
          coachQuality: formData.coachQuality,
          facilityRating: formData.facilityRating,
          childProgressPerceived: formData.childProgressPerceived,
          npsScore: formData.npsScore,
          comment: formData.comment.trim() || null,
          status: 'SUBMITTED',
          autoEscalated: false,
          source: 'MANUAL',
          reviewedBy: null,
          reviewNote: null,
          reviewedAt: null,
        },
        profile.id,
      );
      toast.success('Feedback added');
      setFeedback((prev) => [newFb, ...prev]);
      setShowModal(false);
      setFormData({
        studentId: '',
        centreId: '',
        batchId: '',
        parentName: '',
        parentPhone: '',
        overallSatisfaction: 7,
        coachQuality: 7,
        facilityRating: 7,
        childProgressPerceived: 7,
        npsScore: 8,
        comment: '',
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to add feedback');
    } finally {
      setFormBusy(false);
    }
  };

  // Batches filtered by selected centre in modal
  const modalBatches = formData.centreId
    ? batches.filter((b) => b.centreId === formData.centreId)
    : batches;

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Parent Feedback</h1>
        <CardSkeleton count={4} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Parent Feedback</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus size={16} /> Add Feedback
        </button>
      </div>

      {/* Summary cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2">
            <MessageSquareText size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Avg NPS</p>
            <p className="text-lg font-bold text-brand-secondary">{avgNps}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-green-50 p-2">
            <MessageSquareText size={18} className="text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Avg Satisfaction</p>
            <p className="text-lg font-bold text-brand-secondary">{avgSat}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-purple-50 p-2">
            <MessageSquareText size={18} className="text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Feedback</p>
            <p className="text-lg font-bold text-brand-secondary">{totalFeedback}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-red-50 p-2">
            <MessageSquareText size={18} className="text-red-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Escalated</p>
            <p className="text-lg font-bold text-brand-secondary">{escalatedCount}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by parent, student, or comment…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <select
          value={centreFilter}
          onChange={(e) => setCentreFilter(e.target.value)}
          className="input w-auto py-2 text-sm"
        >
          <option value="">All Centres</option>
          {centres.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="REVIEWED">Reviewed</option>
          <option value="ESCALATED">Escalated</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <input
          type="month"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="input w-auto py-2 text-sm"
          placeholder="Filter by month"
        />
      </div>

      {/* Feedback list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText size={48} />}
          title="No feedback found"
          description="No feedback entries match the selected filters."
          action={
            <button onClick={() => setShowModal(true)} className="btn-primary">
              <Plus size={16} /> Add your first feedback
            </button>
          }
        />
      ) : (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          {filtered.map((fb) => (
            <FeedbackRow
              key={fb.id}
              feedback={fb}
              studentName={studentMap.get(fb.studentId) ?? fb.studentId}
              centreName={centreMap.get(fb.centreId) ?? fb.centreId}
              onReview={handleReview}
              onResolve={handleResolve}
            />
          ))}
        </div>
      )}

      {/* Add Feedback Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <h2 className="text-base font-semibold text-brand-secondary">Add Feedback</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <label className="label">Parent Name *</label>
                <input
                  type="text"
                  value={formData.parentName}
                  onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                  className="input"
                  placeholder="Parent's full name"
                  disabled={formBusy}
                />
              </div>
              <div>
                <label className="label">Parent Phone</label>
                <input
                  type="tel"
                  value={formData.parentPhone}
                  onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
                  className="input"
                  placeholder="+91 98765 43210"
                  disabled={formBusy}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Centre *</label>
                  <select
                    value={formData.centreId}
                    onChange={(e) =>
                      setFormData({ ...formData, centreId: e.target.value, batchId: '' })
                    }
                    className="input"
                    disabled={formBusy}
                  >
                    <option value="">Select centre</option>
                    {centres.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Batch *</label>
                  <select
                    value={formData.batchId}
                    onChange={(e) => setFormData({ ...formData, batchId: e.target.value })}
                    className="input"
                    disabled={formBusy}
                  >
                    <option value="">Select batch</option>
                    {modalBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Student *</label>
                <select
                  value={formData.studentId}
                  onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                  className="input"
                  disabled={formBusy}
                >
                  <option value="">Select student</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Overall Satisfaction (1-10)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.overallSatisfaction}
                    onChange={(e) =>
                      setFormData({ ...formData, overallSatisfaction: Number(e.target.value) })
                    }
                    className="input"
                    disabled={formBusy}
                  />
                </div>
                <div>
                  <label className="label">Coach Quality (1-10)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.coachQuality}
                    onChange={(e) =>
                      setFormData({ ...formData, coachQuality: Number(e.target.value) })
                    }
                    className="input"
                    disabled={formBusy}
                  />
                </div>
                <div>
                  <label className="label">Facility Rating (1-10)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.facilityRating}
                    onChange={(e) =>
                      setFormData({ ...formData, facilityRating: Number(e.target.value) })
                    }
                    className="input"
                    disabled={formBusy}
                  />
                </div>
                <div>
                  <label className="label">Child Progress (1-10)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.childProgressPerceived}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        childProgressPerceived: Number(e.target.value),
                      })
                    }
                    className="input"
                    disabled={formBusy}
                  />
                </div>
              </div>
              <div>
                <label className="label">NPS Score (0-10)</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={formData.npsScore}
                  onChange={(e) =>
                    setFormData({ ...formData, npsScore: Number(e.target.value) })
                  }
                  className="input"
                  disabled={formBusy}
                />
              </div>
              <div>
                <label className="label">Comment</label>
                <textarea
                  value={formData.comment}
                  onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                  className="input min-h-[80px]"
                  placeholder="Parent's comments…"
                  disabled={formBusy}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
              <button
                onClick={() => setShowModal(false)}
                className="btn-secondary"
                disabled={formBusy}
              >
                Cancel
              </button>
              <button
                onClick={handleAddFeedback}
                className="btn-primary"
                disabled={formBusy}
              >
                {formBusy ? 'Saving…' : 'Submit Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
