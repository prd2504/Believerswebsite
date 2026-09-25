/**
 * Admin issue & action log — create, assign, track, and resolve issues
 * across all centres with filtering by centre, type, status, priority, and assignee.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertTriangle,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Send,
  Search,
  CheckCircle,
  ArrowUpCircle,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  getAllIssues,
  createIssue,
  updateIssue,
  deleteIssue,
  resolveIssue,
  escalateIssue,
  addComment,
  getComments,
} from '@/services/issueService';
import { getAllCentres } from '@/services/centreService';
import { getAllCoaches } from '@/services/userService';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import type {
  IssueDocument,
  IssueCommentDocument,
  CentreDocument,
  UserDocument,
  IssueType,
  IssueStatus,
  IssuePriority,
} from '@bba/shared';

const ISSUE_TYPES: IssueType[] = ['COACH', 'FACILITY', 'FINANCE', 'PARENT', 'OTHER'];
const ISSUE_STATUSES: IssueStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED'];
const ISSUE_PRIORITIES: IssuePriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const TYPE_PILL: Record<string, string> = {
  COACH: 'bg-blue-50 text-blue-700',
  FACILITY: 'bg-orange-50 text-orange-700',
  FINANCE: 'bg-emerald-50 text-emerald-700',
  PARENT: 'bg-purple-50 text-purple-700',
  OTHER: 'bg-gray-100 text-gray-600',
};

const PRIORITY_PILL: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-yellow-50 text-yellow-700',
  HIGH: 'bg-orange-50 text-orange-700',
  URGENT: 'bg-red-50 text-red-700',
};

const STATUS_PILL: Record<string, string> = {
  OPEN: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  RESOLVED: 'bg-green-50 text-green-700',
  ESCALATED: 'bg-red-50 text-red-700',
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ── Issue Row (expandable) ──────────────────────────────────────────────────

function IssueRow({
  issue,
  centreName,
  raisedByName,
  assigneeName,
  coaches,
  userId,
  onChanged,
}: {
  issue: IssueDocument;
  centreName: string;
  raisedByName: string;
  assigneeName: string;
  coaches: UserDocument[];
  userId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<IssueCommentDocument[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  // Resolve state
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolving, setResolving] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editStatus, setEditStatus] = useState<IssueStatus>(issue.status);
  const [editPriority, setEditPriority] = useState<IssuePriority>(issue.priority);
  const [editAssignee, setEditAssignee] = useState(issue.assignedTo ?? '');
  const [editDueDate, setEditDueDate] = useState(issue.dueDate ?? '');
  const [savingEdit, setSavingEdit] = useState(false);

  async function handleExpand() {
    const next = !open;
    setOpen(next);
    if (next && comments.length === 0) {
      setLoadingComments(true);
      try {
        setComments(await getComments(issue.id));
      } catch {
        toast.error('Failed to load comments');
      } finally {
        setLoadingComments(false);
      }
    }
  }

  async function handleAddComment() {
    if (!commentText.trim()) return;
    setSendingComment(true);
    try {
      const c = await addComment(issue.id, commentText.trim(), userId);
      setComments((prev) => [...prev, c]);
      setCommentText('');
    } catch {
      toast.error('Failed to add comment');
    } finally {
      setSendingComment(false);
    }
  }

  async function handleResolve() {
    if (!resolutionNote.trim()) {
      toast.error('Please enter a resolution note');
      return;
    }
    setResolving(true);
    try {
      await resolveIssue(issue.id, resolutionNote.trim(), userId);
      toast.success('Issue resolved');
      onChanged();
    } catch {
      toast.error('Failed to resolve');
    } finally {
      setResolving(false);
    }
  }

  async function handleEscalate() {
    try {
      await escalateIssue(issue.id, userId);
      toast.success('Issue escalated');
      onChanged();
    } catch {
      toast.error('Failed to escalate');
    }
  }

  async function handleSaveEdit() {
    setSavingEdit(true);
    try {
      await updateIssue(
        issue.id,
        {
          status: editStatus,
          priority: editPriority,
          assignedTo: editAssignee || null,
          dueDate: editDueDate || null,
        },
        userId,
      );
      toast.success('Issue updated');
      setEditing(false);
      onChanged();
    } catch {
      toast.error('Failed to update');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this issue permanently?')) return;
    try {
      await deleteIssue(issue.id);
      toast.success('Issue deleted');
      onChanged();
    } catch {
      toast.error('Failed to delete');
    }
  }

  return (
    <>
      <tr
        onClick={handleExpand}
        className="cursor-pointer transition hover:bg-gray-50"
      >
        <td className="px-4 py-2.5 text-sm font-medium text-brand-secondary max-w-[200px] truncate">
          {issue.title}
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-600 max-w-[120px] truncate">
          {centreName}
        </td>
        <td className="px-4 py-2.5">
          <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', TYPE_PILL[issue.type])}>
            {issue.type}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', PRIORITY_PILL[issue.priority])}>
            {issue.priority}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', STATUS_PILL[issue.status])}>
            {issue.status.replace('_', ' ')}
          </span>
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-600 max-w-[100px] truncate">
          {assigneeName}
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-500 whitespace-nowrap">
          {fmtDate(issue.dueDate)}
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-500 whitespace-nowrap">
          {fmtDate(issue.createdAt)}
        </td>
        <td className="px-4 py-2.5">
          {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={9} className="bg-gray-50/50 px-6 py-4">
            <div className="space-y-4">
              {/* Description */}
              <div>
                <span className="text-xs font-semibold uppercase text-gray-400">Description</span>
                <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                  {issue.description || 'No description.'}
                </p>
              </div>

              {/* Metadata row */}
              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                <span>Raised by: <strong className="text-gray-700">{raisedByName}</strong></span>
                {issue.resolvedAt && (
                  <span>Resolved: <strong className="text-gray-700">{fmtDate(issue.resolvedAt)}</strong></span>
                )}
                {issue.resolutionNote && (
                  <span>Note: <strong className="text-gray-700">{issue.resolutionNote}</strong></span>
                )}
              </div>

              {/* Inline edit */}
              {editing ? (
                <div className="rounded-lg border bg-white p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <label className="label">Status</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as IssueStatus)}
                        className="input text-sm"
                      >
                        {ISSUE_STATUSES.map((s) => (
                          <option key={s} value={s}>{s.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Priority</label>
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value as IssuePriority)}
                        className="input text-sm"
                      >
                        {ISSUE_PRIORITIES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Assignee</label>
                      <select
                        value={editAssignee}
                        onChange={(e) => setEditAssignee(e.target.value)}
                        className="input text-sm"
                      >
                        <option value="">Unassigned</option>
                        {coaches.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Due Date</label>
                      <input
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        className="input text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="rounded px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={savingEdit}
                      className="btn-primary px-3 py-1.5 text-xs"
                    >
                      {savingEdit ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                    className="rounded border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                  >
                    Edit
                  </button>
                  {issue.status !== 'RESOLVED' && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleEscalate(); }}
                      className="flex items-center gap-1 rounded border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      <ArrowUpCircle size={12} />
                      Escalate
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                    className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              )}

              {/* Resolve */}
              {issue.status !== 'RESOLVED' && !editing && (
                <div className="rounded-lg border bg-white p-3">
                  <p className="mb-2 text-xs font-semibold text-gray-500">Resolve</p>
                  <textarea
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    rows={2}
                    placeholder="Resolution note..."
                    className="input text-sm"
                    disabled={resolving}
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleResolve}
                      disabled={resolving || !resolutionNote.trim()}
                      className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
                    >
                      <CheckCircle size={14} />
                      {resolving ? 'Resolving...' : 'Resolve'}
                    </button>
                  </div>
                </div>
              )}

              {/* Comments */}
              <div>
                <p className="text-xs font-semibold uppercase text-gray-400">Comments</p>
                {loadingComments ? (
                  <p className="mt-1 text-xs text-gray-400">Loading...</p>
                ) : comments.length === 0 ? (
                  <p className="mt-1 text-xs text-gray-400">No comments yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {comments.map((c) => (
                      <div key={c.id} className="rounded bg-white p-2.5 border">
                        <p className="text-sm text-gray-700">{c.text}</p>
                        <p className="mt-1 text-[10px] text-gray-400">
                          {fmtDate(c.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment(); }}
                    placeholder="Add a comment..."
                    className="input flex-1 py-1.5 text-sm"
                    disabled={sendingComment}
                  />
                  <button
                    type="button"
                    onClick={handleAddComment}
                    disabled={sendingComment || !commentText.trim()}
                    className="btn-primary px-3 py-1.5"
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Create Issue Modal ──────────────────────────────────────────────────────

function CreateIssueModal({
  centres,
  coaches,
  userId,
  onCreated,
  onClose,
}: {
  centres: CentreDocument[];
  coaches: UserDocument[];
  userId: string;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [centreId, setCentreId] = useState(centres[0]?.id ?? '');
  const [type, setType] = useState<IssueType>('OTHER');
  const [priority, setPriority] = useState<IssuePriority>('MEDIUM');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !description.trim() || !centreId) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    try {
      await createIssue(
        {
          centreId,
          type,
          priority,
          title: title.trim(),
          description: description.trim(),
          assignedTo: assignedTo || undefined,
          dueDate: dueDate || undefined,
        },
        userId,
      );
      toast.success('Issue created');
      onCreated();
      onClose();
    } catch {
      toast.error('Failed to create issue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-secondary">Create Issue</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div>
          <label className="label">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            placeholder="Brief issue title"
            disabled={submitting}
          />
        </div>

        <div>
          <label className="label">Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
            rows={3}
            placeholder="Describe the issue in detail..."
            disabled={submitting}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Centre *</label>
            <select value={centreId} onChange={(e) => setCentreId(e.target.value)} className="input" disabled={submitting}>
              {centres.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as IssueType)} className="input" disabled={submitting}>
              {ISSUE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as IssuePriority)} className="input" disabled={submitting}>
              {ISSUE_PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Assign To</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="input" disabled={submitting}>
              <option value="">Unassigned</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Due Date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" disabled={submitting} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary px-4 py-2 text-sm"
          >
            {submitting ? 'Creating...' : 'Create Issue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function IssuesPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<IssueDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [coaches, setCoaches] = useState<UserDocument[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  // Filters
  const [centreFilter, setCentreFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    coaches.forEach((c) => m.set(c.id, c.name));
    if (profile) m.set(profile.id, profile.name);
    return m;
  }, [coaches, profile]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [issueData, centreData, coachData] = await Promise.all([
        getAllIssues(),
        getAllCentres(),
        getAllCoaches(),
      ]);
      setIssues(issueData);
      setCentres(centreData);
      setCoaches(coachData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let result = issues;
    if (centreFilter) result = result.filter((i) => i.centreId === centreFilter);
    if (typeFilter) result = result.filter((i) => i.type === typeFilter);
    if (statusFilter) result = result.filter((i) => i.status === statusFilter);
    if (priorityFilter) result = result.filter((i) => i.priority === priorityFilter);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(term) ||
          i.description.toLowerCase().includes(term),
      );
    }
    return result;
  }, [issues, centreFilter, typeFilter, statusFilter, priorityFilter, searchTerm]);

  // Summary counts
  const openCount = issues.filter((i) => i.status === 'OPEN').length;
  const inProgressCount = issues.filter((i) => i.status === 'IN_PROGRESS').length;
  const escalatedCount = issues.filter((i) => i.status === 'ESCALATED').length;
  const resolvedCount = issues.filter((i) => i.status === 'RESOLVED').length;

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Issues & Actions</h1>
        <CardSkeleton count={4} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Issues & Actions</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} issue{filtered.length !== 1 ? 's' : ''}
            {centreFilter || typeFilter || statusFilter || priorityFilter || searchTerm ? ' (filtered)' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-1.5 px-4 py-2 text-sm"
        >
          <Plus size={16} />
          Create Issue
        </button>
      </div>

      {/* Summary cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2">
            <AlertTriangle size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Open</p>
            <p className="text-lg font-bold text-brand-secondary">{openCount}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-amber-50 p-2">
            <AlertTriangle size={18} className="text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">In Progress</p>
            <p className="text-lg font-bold text-brand-secondary">{inProgressCount}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-red-50 p-2">
            <ArrowUpCircle size={18} className="text-red-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Escalated</p>
            <p className="text-lg font-bold text-brand-secondary">{escalatedCount}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-lg bg-green-50 p-2">
            <CheckCircle size={18} className="text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Resolved</p>
            <p className="text-lg font-bold text-brand-secondary">{resolvedCount}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search issues..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-9 py-2 text-sm"
          />
        </div>
        <select value={centreFilter} onChange={(e) => setCentreFilter(e.target.value)} className="input w-auto py-2 text-sm">
          <option value="">All Centres</option>
          {centres.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input w-auto py-2 text-sm">
          <option value="">All Types</option>
          {ISSUE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto py-2 text-sm">
          <option value="">All Statuses</option>
          {ISSUE_STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="input w-auto py-2 text-sm">
          <option value="">All Priorities</option>
          {ISSUE_PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle size={48} />}
          title="No issues found"
          description="No issues match the current filters."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Title</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Centre</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Priority</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Assignee</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Due</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  centreName={centreMap.get(issue.centreId) ?? issue.centreId}
                  raisedByName={userMap.get(issue.raisedBy) ?? issue.raisedBy}
                  assigneeName={issue.assignedTo ? (userMap.get(issue.assignedTo) ?? issue.assignedTo) : '—'}
                  coaches={coaches}
                  userId={profile!.id}
                  onChanged={load}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateIssueModal
          centres={centres}
          coaches={coaches}
          userId={profile!.id}
          onCreated={load}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
