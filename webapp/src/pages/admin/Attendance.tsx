/**
 * Admin attendance page — mark attendance (unified or per-batch), view monthly
 * roster, and browse session history.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ClipboardCheck, Download, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getAllBatches } from '@/services/batchService';
import { getAllCentres } from '@/services/centreService';
import { getAllStudents } from '@/services/studentService';
import { QuickAttendance } from '@/components/attendance/QuickAttendance';
import { AttendanceMarker } from '@/components/attendance/AttendanceMarker';
import { SessionHistory } from '@/components/attendance/SessionHistory';
import { MonthlyRoster } from '@/components/attendance/MonthlyRoster';
import {
  getSessionsByBatch,
  getAttendanceRecords,
} from '@/services/attendanceService';
import { exportAttendanceCsv } from '@/lib/csv';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import type { BatchDocument, CentreDocument, StudentDocument } from '@bba/shared';

type Tab = 'quick' | 'batch' | 'roster' | 'history';

export default function AttendancePage() {
  const { profile } = useAuth();
  const [batches, setBatches] = useState<BatchDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [students, setStudents] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('quick');
  const [centreFilter, setCentreFilter] = useState('');
  const [search, setSearch] = useState('');
  const [historyBatchId, setHistoryBatchId] = useState('');

  const centreMap = useMemo(() => {
    const m = new Map<string, string>();
    centres.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [centres]);

  const studentMap = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [students]);

  const filteredBatches = useMemo(() => {
    let result = batches;
    if (centreFilter) result = result.filter((b) => b.centreId === centreFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((b) => b.name.toLowerCase().includes(q));
    }
    return result;
  }, [batches, centreFilter, search]);

  const activeBatches = filteredBatches.filter((b) => b.status === 'ACTIVE');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [bData, cData, sData] = await Promise.all([
        getAllBatches(),
        getAllCentres(),
        getAllStudents(),
      ]);
      setBatches(bData);
      setCentres(cData);
      setStudents(sData);
      if (bData.length > 0 && !historyBatchId) {
        setHistoryBatchId(bData[0].id);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [historyBatchId]);

  useEffect(() => { load(); }, [load]);

  const selectedBatchForHistory = batches.find((b) => b.id === historyBatchId);

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Attendance</h1>
        <CardSkeleton count={3} />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-brand-secondary">Attendance</h1>
        <EmptyState
          icon={<ClipboardCheck size={48} />}
          title="No batches found"
          description="Create batches first to start tracking attendance."
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Attendance</h1>
          <p className="text-sm text-gray-500">{activeBatches.length} active batch{activeBatches.length !== 1 ? 'es' : ''}</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search batches…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-44 py-2 pl-9 text-sm"
            />
          </div>
          <select
            value={centreFilter}
            onChange={(e) => setCentreFilter(e.target.value)}
            className="input w-auto py-2 text-sm"
          >
            <option value="">All Centres</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setTab('quick')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'quick' ? 'bg-white text-brand-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Quick Mark
        </button>
        <button
          onClick={() => setTab('batch')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'batch' ? 'bg-white text-brand-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Per Batch
        </button>
        <button
          onClick={() => setTab('roster')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'roster' ? 'bg-white text-brand-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Monthly Roster
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'history' ? 'bg-white text-brand-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Session History
        </button>
      </div>

      {/* Content */}
      {tab === 'quick' && profile && (
        <div className="card">
          <p className="mb-3 text-xs text-gray-500">
            All expected students across batches for the selected day. Everyone defaults to present — just mark absences.
          </p>
          <QuickAttendance
            batches={activeBatches}
            centreId={centreFilter || centres[0]?.id || ''}
            userId={profile.id}
            onDone={load}
          />
        </div>
      )}

      {tab === 'batch' && profile && (
        <div className="card">
          <AttendanceMarker
            batches={activeBatches}
            centreId={centreFilter || centres[0]?.id || ''}
            userId={profile.id}
            onDone={load}
          />
        </div>
      )}

      {tab === 'roster' && (
        <div className="card">
          <MonthlyRoster
            batches={activeBatches}
            students={students}
            centreFilter={centreFilter}
          />
        </div>
      )}

      {tab === 'history' && (
        <div className="card">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div className="flex-1">
              <label className="label">Select batch</label>
              <select
                value={historyBatchId}
                onChange={(e) => setHistoryBatchId(e.target.value)}
                className="input w-auto"
              >
                {filteredBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} {centreMap.get(b.centreId) ? `(${centreMap.get(b.centreId)})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {selectedBatchForHistory && (
              <button
                onClick={async () => {
                  try {
                    const sessions = await getSessionsByBatch(historyBatchId);
                    const allRecords = (
                      await Promise.all(
                        sessions.map((s) => getAttendanceRecords(historyBatchId, s.id)),
                      )
                    ).flat();
                    if (allRecords.length === 0) {
                      toast.info('No attendance records for this batch yet.');
                      return;
                    }
                    exportAttendanceCsv(
                      allRecords,
                      studentMap,
                      selectedBatchForHistory.name,
                      centreMap.get(selectedBatchForHistory.centreId) ?? '',
                    );
                    toast.success(`Exported ${allRecords.length} attendance records`);
                  } catch (err) {
                    console.error(err);
                    toast.error('Failed to export attendance');
                  }
                }}
                className="btn-secondary text-sm"
              >
                <Download size={14} /> Export CSV
              </button>
            )}
          </div>
          {selectedBatchForHistory && (
            <SessionHistory
              batchId={historyBatchId}
              batchName={selectedBatchForHistory.name}
              studentMap={studentMap}
            />
          )}
        </div>
      )}
    </div>
  );
}
