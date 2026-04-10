/**
 * Student management page — list students with search/filter, create/edit/delete.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Users, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  getAllStudents,
  createStudent,
  updateStudent,
  deleteStudent,
} from '@/services/studentService';
import { getAllCentres } from '@/services/centreService';
import { getAllBatches } from '@/services/batchService';
import { StudentCard } from '@/components/students/StudentCard';
import { StudentForm } from '@/components/students/StudentForm';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import type { StudentDocument, CentreDocument, BatchDocument } from '@bba/shared';
import type { StudentFormValues } from '@/lib/schemas/studentSchema';

type Mode = 'list' | 'create' | 'edit';

export default function StudentsPage() {
  const { profile } = useAuth();
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('list');
  const [editTarget, setEditTarget] = useState<StudentDocument | null>(null);
  const [busy, setBusy] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [centreFilter, setCentreFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  // Lookup maps
  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  const batchMap = useMemo(() => {
    const m = new Map<string, string>();
    batches.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [batches]);

  // Filtered list
  const filtered = useMemo(() => {
    let result = students;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.guardianName.toLowerCase().includes(q) ||
          s.phone?.includes(q) ||
          s.email?.toLowerCase().includes(q),
      );
    }
    if (centreFilter) result = result.filter((s) => s.primaryCentreId === centreFilter);
    if (statusFilter) result = result.filter((s) => s.status === statusFilter);
    if (levelFilter) result = result.filter((s) => s.level === levelFilter);
    return result;
  }, [students, search, centreFilter, statusFilter, levelFilter]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [sData, cData, bData] = await Promise.all([
        getAllStudents(),
        getAllCentres(),
        getAllBatches(),
      ]);
      setStudents(sData);
      setCentres(cData);
      setBatches(bData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── CRUD handlers ──

  const handleCreate = async (values: StudentFormValues) => {
    if (!profile) return;
    setBusy(true);
    try {
      await createStudent(values, profile.id);
      toast.success('Student created');
      setMode('list');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create student');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (values: StudentFormValues) => {
    if (!profile || !editTarget) return;
    setBusy(true);
    try {
      await updateStudent(editTarget.id, values, editTarget.batchIds, profile.id);
      toast.success('Student updated');
      setMode('list');
      setEditTarget(null);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update student');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (student: StudentDocument) => {
    if (!confirm(`Delete "${student.name}"? This cannot be undone.`)) return;
    try {
      await deleteStudent(student.id, student.batchIds);
      toast.success('Student deleted');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete student');
    }
  };

  const handleEdit = (student: StudentDocument) => {
    setEditTarget(student);
    setMode('edit');
  };

  function studentToFormValues(s: StudentDocument): Partial<StudentFormValues> {
    return {
      name: s.name,
      dateOfBirth: s.dateOfBirth,
      gender: s.gender,
      guardianName: s.guardianName,
      guardianUserId: s.guardianUserId,
      phone: s.phone ?? '',
      email: s.email ?? '',
      address: s.address,
      city: s.city,
      pincode: s.pincode,
      bloodGroup: s.bloodGroup,
      emergencyContact: s.emergencyContact,
      primaryCentreId: s.primaryCentreId,
      batchIds: s.batchIds,
      level: s.level,
      status: s.status,
      joinedDate: s.joinedDate,
      medicalNotes: s.medicalNotes ?? '',
    };
  }

  // ── Create / Edit view ──

  if (mode === 'create') {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Add New Student</h1>
        <div className="card">
          <StudentForm
            centres={centres}
            batches={batches}
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
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Edit Student</h1>
        <div className="card">
          <StudentForm
            centres={centres}
            batches={batches}
            initialValues={studentToFormValues(editTarget)}
            onSubmit={handleUpdate}
            onCancel={() => { setMode('list'); setEditTarget(null); }}
            busy={busy}
          />
        </div>
      </div>
    );
  }

  // ── List view ──

  const hasFilters = search || centreFilter || statusFilter || levelFilter;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Students</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} student{filtered.length !== 1 ? 's' : ''}
            {hasFilters ? ' matching filters' : ' total'}
          </p>
        </div>
        <button onClick={() => setMode('create')} className="btn-primary">
          <Plus size={16} /> Add Student
        </button>
      </div>

      {/* Search & filters */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, guardian, phone, email…"
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
          <option value="ACTIVE">Active</option>
          <option value="ON_HOLD">On Hold</option>
          <option value="GRADUATED">Graduated</option>
          <option value="LEFT">Left</option>
        </select>
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="input w-auto py-2 text-sm">
          <option value="">All Levels</option>
          <option value="BEGINNER">Beginner</option>
          <option value="INTERMEDIATE">Intermediate</option>
          <option value="ADVANCED">Advanced</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <CardSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title={
            hasFilters
              ? 'No students match your filters'
              : centres.length === 0
                ? 'Add a centre first'
                : 'No students yet'
          }
          description={
            hasFilters
              ? 'Try adjusting your search or filter criteria.'
              : centres.length === 0
                ? 'You need at least one centre before enrolling students.'
                : 'Add your first student to start managing enrolments.'
          }
          action={
            !hasFilters && centres.length > 0 ? (
              <button onClick={() => setMode('create')} className="btn-primary">
                <Plus size={16} /> Add your first student
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <StudentCard
              key={s.id}
              student={s}
              centreName={centreMap.get(s.primaryCentreId)}
              batchNames={s.batchIds.map((id) => batchMap.get(id)).filter(Boolean) as string[]}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
