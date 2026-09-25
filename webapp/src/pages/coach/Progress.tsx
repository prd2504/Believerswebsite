/**
 * Coach progress page — enter skill scores and submit monthly assessments
 * for students in assigned batches.
 */

import { useState, useEffect, useCallback } from 'react';
import { BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { getBatchesByCoach } from '@/services/batchService';
import { getStudentsByBatch } from '@/services/studentService';
import { getAssessment, submitAssessment } from '@/services/progressService';
import { SkillScoreForm } from '@/components/progress/SkillScoreForm';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import {
  DEFAULT_SKILL_FIELDS,
  SKILL_SCORE_MIN,
  SKILL_SCORE_MAX,
} from '@bba/shared';
import type {
  BatchDocument,
  StudentDocument,
  SportType,
  CoachRecommendation,
} from '@bba/shared';

const TABS = ['Daily Scores', 'Monthly Assessment'] as const;
type Tab = (typeof TABS)[number];

const RECOMMENDATIONS: { value: CoachRecommendation; label: string; color: string }[] = [
  { value: 'PROMOTE', label: 'Promote', color: 'border-green-500 bg-green-50 text-green-700' },
  { value: 'MAINTAIN', label: 'Maintain', color: 'border-yellow-500 bg-yellow-50 text-yellow-700' },
  { value: 'NEEDS_ATTENTION', label: 'Needs Attention', color: 'border-red-500 bg-red-50 text-red-700' },
];

function getCurrentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Monthly Assessment Form ─────────────────────────────────────────────────

function MonthlyAssessmentForm({
  student,
  batch,
  coachId,
  onDone,
}: {
  student: StudentDocument;
  batch: BatchDocument;
  coachId: string;
  onDone?: () => void;
}) {
  const sport = batch.sport as SportType;
  const skills = DEFAULT_SKILL_FIELDS[sport] ?? [];

  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth);
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(skills.map((s) => [s, 5])),
  );
  const [recommendation, setRecommendation] = useState<CoachRecommendation>('MAINTAIN');
  const [strengths, setStrengths] = useState('');
  const [areasForImprovement, setAreasForImprovement] = useState('');
  const [coachComments, setCoachComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);

  // Load existing assessment when student or month changes
  useEffect(() => {
    let cancelled = false;
    async function loadExisting() {
      setLoadingExisting(true);
      try {
        const existing = await getAssessment(student.id, yearMonth);
        if (cancelled) return;
        if (existing) {
          setScores(existing.scores as Record<string, number>);
          setRecommendation(existing.recommendation);
          setStrengths(existing.strengths);
          setAreasForImprovement(existing.areasForImprovement);
          setCoachComments(existing.coachComments);
        } else {
          setScores(Object.fromEntries(skills.map((s) => [s, 5])));
          setRecommendation('MAINTAIN');
          setStrengths('');
          setAreasForImprovement('');
          setCoachComments('');
        }
      } catch {
        if (!cancelled) toast.error('Failed to load existing assessment');
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    }
    loadExisting();
    return () => { cancelled = true; };
  }, [student.id, yearMonth, skills.join(',')]);

  function setSkillScore(skill: string, value: number) {
    setScores((prev) => ({
      ...prev,
      [skill]: Math.max(SKILL_SCORE_MIN, Math.min(SKILL_SCORE_MAX, value)),
    }));
  }

  async function handleSave() {
    if (!strengths.trim() || !areasForImprovement.trim()) {
      toast.error('Please fill in strengths and areas for improvement');
      return;
    }
    setSaving(true);
    try {
      await submitAssessment({
        studentId: student.id,
        batchId: batch.id,
        coachId,
        sport,
        yearMonth,
        scores,
        recommendation,
        strengths,
        areasForImprovement,
        coachComments,
      });
      toast.success(`Assessment saved for ${student.name}`);
      onDone?.();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save assessment');
    } finally {
      setSaving(false);
    }
  }

  if (loadingExisting) {
    return <p className="py-4 text-center text-sm text-gray-400">Loading assessment...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-brand-secondary">{student.name}</h3>
          <p className="text-xs text-gray-400">{batch.name} — {sport}</p>
        </div>
        <input
          type="month"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="input w-40 py-1.5 text-xs"
          disabled={saving}
        />
      </div>

      {/* Skill sliders */}
      <div>
        <p className="mb-2 text-xs font-semibold text-gray-500">Skill Scores</p>
        <div className="space-y-3">
          {skills.map((skill) => (
            <div key={skill} className="flex items-center gap-3">
              <span className="w-28 text-xs text-gray-600">{skill}</span>
              <input
                type="range"
                min={SKILL_SCORE_MIN}
                max={SKILL_SCORE_MAX}
                value={scores[skill] ?? 5}
                onChange={(e) => setSkillScore(skill, Number(e.target.value))}
                className="flex-1"
                disabled={saving}
              />
              <span
                className={cn(
                  'w-8 text-center text-sm font-bold',
                  (scores[skill] ?? 5) >= 8 ? 'text-green-600' :
                  (scores[skill] ?? 5) >= 5 ? 'text-yellow-600' : 'text-red-600',
                )}
              >
                {scores[skill] ?? 5}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendation */}
      <div>
        <p className="mb-2 text-xs font-semibold text-gray-500">Recommendation</p>
        <div className="flex gap-2">
          {RECOMMENDATIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRecommendation(r.value)}
              disabled={saving}
              className={cn(
                'rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition',
                recommendation === r.value ? r.color : 'border-gray-200 bg-white text-gray-500',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Text areas */}
      <div>
        <label className="label">Strengths *</label>
        <textarea
          value={strengths}
          onChange={(e) => setStrengths(e.target.value)}
          rows={2}
          className="input"
          placeholder="What does the student excel at?"
          disabled={saving}
        />
      </div>
      <div>
        <label className="label">Areas for Improvement *</label>
        <textarea
          value={areasForImprovement}
          onChange={(e) => setAreasForImprovement(e.target.value)}
          rows={2}
          className="input"
          placeholder="What needs work?"
          disabled={saving}
        />
      </div>
      <div>
        <label className="label">Coach Comments</label>
        <textarea
          value={coachComments}
          onChange={(e) => setCoachComments(e.target.value)}
          rows={2}
          className="input"
          placeholder="Any additional observations..."
          disabled={saving}
        />
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Assessment'}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function CoachProgress() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('Daily Scores');
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const data = await getBatchesByCoach(profile.id);
      setBatches(data.filter((b) => b.status === 'ACTIVE'));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedBatchId) { setStudents([]); return; }
    getStudentsByBatch(selectedBatchId)
      .then((data) => setStudents(data.filter((s) => s.status === 'ACTIVE')))
      .catch((err) => { console.error(err); toast.error('Failed to load students'); });
  }, [selectedBatchId]);

  const selectedBatch = batches.find((b) => b.id === selectedBatchId);
  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">Student Progress</h1>
        <CardSkeleton count={2} />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">Student Progress</h1>
        <EmptyState
          icon={<BarChart3 size={48} />}
          title="No active batches"
          description="You are not assigned to any active batches yet."
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold text-brand-secondary">Student Progress</h1>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition',
              activeTab === tab
                ? 'bg-white text-brand-secondary shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Batch/student selectors */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <select
          value={selectedBatchId}
          onChange={(e) => { setSelectedBatchId(e.target.value); setSelectedStudentId(''); }}
          className="input"
        >
          <option value="">Select batch</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        {students.length > 0 && (
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="input"
          >
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {selectedBatch && selectedStudent && profile ? (
        <div className="card">
          {activeTab === 'Daily Scores' ? (
            <SkillScoreForm
              student={selectedStudent}
              batch={selectedBatch}
              coachId={profile.id}
              onDone={() => {
                setSelectedStudentId('');
                toast.success('Ready for next student');
              }}
            />
          ) : (
            <MonthlyAssessmentForm
              student={selectedStudent}
              batch={selectedBatch}
              coachId={profile.id}
              onDone={() => {
                setSelectedStudentId('');
                toast.success('Ready for next student');
              }}
            />
          )}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-gray-400">
          {selectedBatchId ? 'Select a student to get started.' : 'Select a batch to get started.'}
        </p>
      )}
    </div>
  );
}
