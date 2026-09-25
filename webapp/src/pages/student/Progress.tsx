/**
 * Student/Parent progress page — view skill scores and AI reports.
 */

import { useState, useEffect, useCallback } from 'react';
import { BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getScoresByStudent, getReportsByStudent } from '@/services/progressService';
import { ProgressReportCard } from '@/components/progress/ProgressReportCard';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import type { ProgressScoreDocument, ProgressReportDocument } from '@bba/shared';

export default function StudentProgress() {
  const { profile } = useAuth();
  const [scores, setScores] = useState<ProgressScoreDocument[]>([]);
  const [reports, setReports] = useState<ProgressReportDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const studentIds = profile.linkedStudentIds?.length
        ? profile.linkedStudentIds
        : [profile.id];
      const allScores: ProgressScoreDocument[] = [];
      const allReports: ProgressReportDocument[] = [];
      for (const sid of studentIds) {
        const [s, r] = await Promise.all([
          getScoresByStudent(sid),
          getReportsByStudent(sid),
        ]);
        allScores.push(...s);
        allReports.push(...r);
      }
      setScores(allScores);
      setReports(allReports);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load progress');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Progress</h1>
        <CardSkeleton count={3} />
      </div>
    );
  }

  if (scores.length === 0 && reports.length === 0) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Progress</h1>
        <EmptyState
          icon={<BarChart3 size={48} />}
          title="No progress data yet"
          description="Your coach will start recording your skill scores during sessions. Progress reports are generated monthly."
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Progress</h1>

      {/* AI Reports */}
      {reports.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-brand-secondary">Monthly Reports</h2>
          <div className="space-y-3">
            {reports.map((report) => (
              <ProgressReportCard key={report.id} report={report} />
            ))}
          </div>
        </div>
      )}

      {/* Recent scores */}
      {scores.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-brand-secondary">
            Recent Assessments ({scores.length})
          </h2>
          <div className="space-y-2">
            {scores.slice(0, 20).map((score) => (
              <div key={score.id} className="card">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-brand-secondary">{score.assessedOn}</span>
                  <span className="text-[10px] text-gray-400">{score.sport}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(score.scores).map(([skill, val]) => (
                    <span
                      key={skill}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        val >= 8 ? 'bg-green-50 text-green-700' :
                        val >= 5 ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {skill}: {val}
                    </span>
                  ))}
                </div>
                {score.note && <p className="mt-2 text-xs italic text-gray-500">{score.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
