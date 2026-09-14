/**
 * Display card for an AI-generated progress report.
 */

import { FileText, Send } from 'lucide-react';
import type { ProgressReportDocument } from '@bba/shared';
import { cn } from '@/lib/cn';

interface ProgressReportCardProps {
  report: ProgressReportDocument;
  studentName?: string;
  onMarkDelivered?: (report: ProgressReportDocument) => void;
}

export function ProgressReportCard({ report, studentName, onMarkDelivered }: ProgressReportCardProps) {
  const { inputSnapshot } = report;
  const avgScoreEntries = Object.entries(inputSnapshot.averageScores);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-brand-primary" />
          <span className="text-sm font-semibold text-brand-secondary">
            {report.yearMonth} Report
          </span>
          {studentName && <span className="text-xs text-gray-400">— {studentName}</span>}
        </div>
        <div className="flex items-center gap-2">
          {report.delivered ? (
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
              Delivered
            </span>
          ) : (
            <>
              <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
                Pending
              </span>
              {onMarkDelivered && (
                <button
                  onClick={() => onMarkDelivered(report)}
                  className="btn-ghost p-1.5 text-brand-primary"
                  aria-label="Mark delivered"
                >
                  <Send size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-3 flex gap-4 text-xs text-gray-500">
        <span>Attendance: {inputSnapshot.attendancePercent}%</span>
        <span>Sessions: {inputSnapshot.sessionCount}</span>
        <span>Model: {report.modelId}</span>
      </div>

      {/* Average scores */}
      {avgScoreEntries.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {avgScoreEntries.map(([skill, score]) => (
            <span
              key={skill}
              className={cn(
                'rounded px-2 py-0.5 text-[11px] font-medium',
                score >= 8 ? 'bg-green-50 text-green-700' :
                score >= 5 ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700',
              )}
            >
              {skill}: {typeof score === 'number' ? score.toFixed(1) : score}
            </span>
          ))}
        </div>
      )}

      {/* Summary text */}
      <div className="rounded-lg bg-gray-50 p-3 text-sm leading-relaxed text-gray-700">
        {report.summaryText || 'No summary available.'}
      </div>
    </div>
  );
}
