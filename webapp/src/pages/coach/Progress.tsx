/**
 * Coach progress page — enter skill scores for students in assigned batches.
 */

import { useState, useEffect, useCallback } from 'react';
import { BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getBatchesByCoach } from '@/services/batchService';
import { getStudentsByBatch } from '@/services/studentService';
import { SkillScoreForm } from '@/components/progress/SkillScoreForm';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import type { BatchDocument, StudentDocument } from '@bba/shared';

export default function CoachProgress() {
  const { profile } = useAuth();
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

  // Load students when batch changes
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
          <SkillScoreForm
            student={selectedStudent}
            batch={selectedBatch}
            coachId={profile.id}
            onDone={() => {
              setSelectedStudentId('');
              toast.success('Ready for next student');
            }}
          />
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-gray-400">
          {selectedBatchId ? 'Select a student to enter scores.' : 'Select a batch to get started.'}
        </p>
      )}
    </div>
  );
}
