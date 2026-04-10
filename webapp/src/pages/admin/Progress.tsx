/**
 * Admin progress page — view scores and AI reports for all students.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { getAllStudents } from '@/services/studentService';
import { getAllBatches } from '@/services/batchService';
import { getAllCentres } from '@/services/centreService';
import { getScoresByStudent, getReportsByStudent, markReportDelivered } from '@/services/progressService';
import { ProgressReportCard } from '@/components/progress/ProgressReportCard';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import type {
  StudentDocument,
  BatchDocument,
  CentreDocument,
  ProgressScoreDocument,
  ProgressReportDocument,
} from '@bba/shared';

export default function ProgressPage() {
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [scores, setScores] = useState<ProgressScoreDocument[]>([]);
  const [reports, setReports] = useState<ProgressReportDocument[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [centreFilter, setCentreFilter] = useState('');

  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  const filteredStudents = centreFilter
    ? students.filter((s) => s.primaryCentreId === centreFilter)
    : students;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [sData, bData, cData] = await Promise.all([
        getAllStudents(),
        getAllBatches(),
        getAllCentres(),
      ]);
      setStudents(sData);
      setBatches(bData);
      setCentres(cData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load scores & reports when a student is selected
  useEffect(() => {
    if (!selectedStudentId) return;
    setLoadingDetail(true);
    Promise.all([
      getScoresByStudent(selectedStudentId),
      getReportsByStudent(selectedStudentId),
    ])
      .then(([s, r]) => { setScores(s); setReports(r); })
      .catch((err) => { console.error(err); toast.error('Failed to load progress data'); })
      .finally(() => setLoadingDetail(false));
  }, [selectedStudentId]);

  const handleMarkDelivered = async (report: ProgressReportDocument) => {
    try {
      await markReportDelivered(report.studentId, report.id);
      toast.success('Report marked as delivered');
      setReports((prev) => prev.map((r) => r.id === report.id ? { ...r, delivered: true, deliveredAt: new Date().toISOString() } : r));
    } catch (err) {
      console.error(err);
      toast.error('Failed to mark report');
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Progress Tracking</h1>
        <CardSkeleton count={4} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-brand-secondary">Progress Tracking</h1>
        <p className="text-sm text-gray-500">{students.length} student{students.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Filters & student selector */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={centreFilter}
          onChange={(e) => { setCentreFilter(e.target.value); setSelectedStudentId(''); }}
          className="input w-auto py-2 text-sm"
        >
          <option value="">All Centres</option>
          {centres.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
          className="input w-auto py-2 text-sm"
        >
          <option value="">Select a student</option>
          {filteredStudents.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {centreMap.get(s.primaryCentreId) ? `(${centreMap.get(s.primaryCentreId)})` : ''}
            </option>
          ))}
        </select>
      </div>

      {!selectedStudentId ? (
        <EmptyState
          icon={<BarChart3 size={48} />}
          title="Select a student"
          description="Choose a student from the dropdown to view their progress scores and reports."
        />
      ) : loadingDetail ? (
        <CardSkeleton count={3} />
      ) : (
        <div className="space-y-6">
          {/* Scores */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-brand-secondary">
              Skill Scores ({scores.length})
            </h2>
            {scores.length === 0 ? (
              <p className="text-xs text-gray-400">No scores recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {scores.map((score) => (
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
            )}
          </div>

          {/* Reports */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-brand-secondary">
              AI Reports ({reports.length})
            </h2>
            {reports.length === 0 ? (
              <p className="text-xs text-gray-400">No AI reports generated yet. Reports are generated monthly by the system.</p>
            ) : (
              <div className="space-y-3">
                {reports.map((report) => (
                  <ProgressReportCard
                    key={report.id}
                    report={report}
                    onMarkDelivered={handleMarkDelivered}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
