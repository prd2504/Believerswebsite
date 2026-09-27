/**
 * Coach issues page — view, raise, and manage issues for assigned centres.
 */

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Plus, ChevronDown, ChevronUp, Send, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getAllIssues, createIssue, resolveIssue, addComment, getComments } from '@/services/issueService';
import { getAllCentres } from '@/services/centreService';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { cn } from '@/lib/cn';
import type {
  IssueDocument,
  IssueCommentDocument,
  CentreDocument,
  IssueType,
  IssuePriority,
} from '@bba/shared';

const ISSUE_TYPES: IssueType[] = ['COACH', 'FACILITY', 'FINANCE', 'PARENT', 'OTHER'];
const ISSUE_PRIORITIES: IssuePriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function typeBadge(type: string) {
  const colors: Record<string, string> = {
    COACH: 'bg-blue-100 text-blue-700',
    FACILITY: 'bg-orange-100 text-orange-700',
    FINANCE: 'bg-green-100 text-green-700',
    PARENT: 'bg-purple-100 text-purple-700',
    OTHER: 'bg-gray-100 text-gray-700',
  };
  return colors[type] ?? 'bg-gray-100 text-gray-700';
}

function priorityBadge(priority: string) {
  const colors: Record<string, string> = {
    LOW: 'bg-gray-100 text-gray-600',
    MEDIUM: 'bg-yellow-100 text-yellow-700',
    HIGH: 'bg-orange-100 text-orange-700',
    URGENT: 'bg-red-100 text-red-700',
  };
  return colors[priority] ?? 'bg-gray-100 text-gray-700';
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    OPEN: 'bg-blue-100 text-blue-700',
    IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
    RESOLVED: 'bg-green-100 text-green-700',
    ESCALATED: 'bg-red-100 text-red-700',
  };
  return colors[status] ?? 'bg-gray-100 text-gray-700';
}

function IssueCard({
  issue,
  centreName,
  isAssignedToMe,
  userId,
  onResolved,
}: {
  issue: IssueDocument;
  centreName: string;
  isAssignedToMe: boolean;
  userId: string;
  onResolved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<IssueCommentDocument[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolving, setResolving] = useState(false);

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && comments.length === 0) {
      setLoadingComments(true);
      try {
        const data = await getComments(issue.id);
        setComments(data);
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
      const newComment = await addComment(issue.id, commentText.trim(), userId);
      setComments((prev) => [...prev, newComment]);
      setCommentText('');
      toast.success('Comment added');
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
      onResolved();
    } catch {
      toast.error('Failed to resolve issue');
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="card">
      <button
        type="button"
        onClick={handleExpand}
        className="flex w-full items-start justify-between text-left"
      >
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-brand-secondary">{issue.title}</h3>
          <p className="mt-1 text-xs text-gray-500">{centreName}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={cn('inline-block rounded-full px-2 py-0.5 text-[10px] font-medium', typeBadge(issue.type))}>
              {issue.type}
            </span>
            <span className={cn('inline-block rounded-full px-2 py-0.5 text-[10px] font-medium', priorityBadge(issue.priority))}>
              {issue.priority}
            </span>
            <span className={cn('inline-block rounded-full px-2 py-0.5 text-[10px] font-medium', statusBadge(issue.status))}>
              {issue.status}
            </span>
          </div>
          {issue.dueDate && (
            <p className="mt-1.5 text-[10px] text-gray-400">Due: {issue.dueDate}</p>
          )}
        </div>
        <div className="ml-2 mt-1 text-gray-400">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 border-t pt-3">
          <p className="text-xs text-gray-600">{issue.description}</p>

          {/* Comments */}
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-500">Comments</p>
            {loadingComments ? (
              <p className="mt-1 text-xs text-gray-400">Loading...</p>
            ) : comments.length === 0 ? (
              <p className="mt-1 text-xs text-gray-400">No comments yet.</p>
            ) : (
              <div className="mt-1 space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="rounded bg-gray-50 p-2">
                    <p className="text-xs text-gray-700">{c.text}</p>
                    <p className="mt-0.5 text-[10px] text-gray-400">
                      {new Date(c.createdAt).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment */}
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="input flex-1 py-1.5 text-xs"
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

          {/* Resolve — only for issues assigned to this coach */}
          {isAssignedToMe && issue.status !== 'RESOLVED' && (
            <div className="mt-3 border-t pt-3">
              <p className="text-xs font-medium text-gray-500">Resolve this issue</p>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={2}
                placeholder="Resolution note..."
                className="input mt-1 text-xs"
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
        </div>
      )}
    </div>
  );
}

export default function CoachIssues() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<IssueDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<IssueType>('OTHER');
  const [formPriority, setFormPriority] = useState<IssuePriority>('MEDIUM');
  const [formCentreId, setFormCentreId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const coachCentreIds = profile?.centreIds ?? [];

  const centreMap = Object.fromEntries(centres.map((c) => [c.id, c.name]));

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const [allIssues, allCentres] = await Promise.all([
        getAllIssues(),
        getAllCentres(),
      ]);
      // Filter to coach's centres only
      const filtered = allIssues.filter((i) => coachCentreIds.includes(i.centreId));
      setIssues(filtered);
      setCentres(allCentres.filter((c) => coachCentreIds.includes(c.id)));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, [profile, coachCentreIds.join(',')]);

  useEffect(() => { load(); }, [load]);

  // Set default centre when centres load
  useEffect(() => {
    if (centres.length > 0 && !formCentreId) {
      setFormCentreId(centres[0].id);
    }
  }, [centres, formCentreId]);

  const myIssues = issues.filter((i) => i.raisedBy === profile?.id);
  const assignedToMe = issues.filter((i) => i.assignedTo === profile?.id);

  async function handleSubmit() {
    if (!profile) return;
    if (!formTitle.trim() || !formDescription.trim() || !formCentreId) {
      toast.error('Please fill in all fields');
      return;
    }
    setSubmitting(true);
    try {
      await createIssue(
        {
          centreId: formCentreId,
          type: formType,
          priority: formPriority,
          title: formTitle.trim(),
          description: formDescription.trim(),
        },
        profile.id,
      );
      toast.success('Issue raised');
      setFormTitle('');
      setFormDescription('');
      setFormType('OTHER');
      setFormPriority('MEDIUM');
      setShowForm(false);
      load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to raise issue');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">Issues</h1>
        <CardSkeleton count={3} />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-brand-secondary">Issues</h1>
        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
        >
          <Plus size={14} />
          Raise Issue
        </button>
      </div>

      {/* Raise Issue Form */}
      {showForm && (
        <div className="card mb-4 space-y-3">
          <h2 className="text-sm font-semibold text-brand-secondary">New Issue</h2>
          <div>
            <label className="label">Title</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="input"
              placeholder="Brief title"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="input"
              rows={3}
              placeholder="Describe the issue..."
              disabled={submitting}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as IssueType)}
                className="input"
                disabled={submitting}
              >
                {ISSUE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="label">Priority</label>
              <select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value as IssuePriority)}
                className="input"
                disabled={submitting}
              >
                {ISSUE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Centre</label>
            <select
              value={formCentreId}
              onChange={(e) => setFormCentreId(e.target.value)}
              className="input"
              disabled={submitting}
            >
              {centres.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary px-3 py-1.5 text-xs"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {issues.length === 0 && !showForm ? (
        <EmptyState
          icon={<AlertTriangle size={48} />}
          title="No issues"
          description="No issues found for your centres."
        />
      ) : (
        <>
          {/* Assigned to Me */}
          {assignedToMe.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Assigned to Me</h2>
              <div className="space-y-3">
                {assignedToMe.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    centreName={centreMap[issue.centreId] ?? 'Unknown Centre'}
                    isAssignedToMe
                    userId={profile!.id}
                    onResolved={load}
                  />
                ))}
              </div>
            </div>
          )}

          {/* My Issues */}
          {myIssues.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-gray-700">My Issues</h2>
              <div className="space-y-3">
                {myIssues.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    centreName={centreMap[issue.centreId] ?? 'Unknown Centre'}
                    isAssignedToMe={issue.assignedTo === profile?.id}
                    userId={profile!.id}
                    onResolved={load}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
