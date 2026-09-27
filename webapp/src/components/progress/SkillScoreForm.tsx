/**
 * Skill score entry form — a coach rates a student on each skill for a sport.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { DEFAULT_SKILL_FIELDS, SKILL_SCORE_MIN, SKILL_SCORE_MAX } from '@bba/shared';
import type { BatchDocument, StudentDocument, SportType, SkillScoreMap } from '@bba/shared';
import { addScore } from '@/services/progressService';

interface SkillScoreFormProps {
  student: StudentDocument;
  batch: BatchDocument;
  coachId: string;
  onDone?: () => void;
}

export function SkillScoreForm({ student, batch, coachId, onDone }: SkillScoreFormProps) {
  const sport = batch.sport as SportType;
  const skills = DEFAULT_SKILL_FIELDS[sport] ?? [];

  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(skills.map((s) => [s, 5])),
  );
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  function setSkillScore(skill: string, value: number) {
    setScores((prev) => ({
      ...prev,
      [skill]: Math.max(SKILL_SCORE_MIN, Math.min(SKILL_SCORE_MAX, value)),
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await addScore(student.id, batch.id, coachId, sport, date, scores as SkillScoreMap, note || null);
      toast.success(`Scores saved for ${student.name}`);
      onDone?.();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save scores');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-brand-secondary">{student.name}</h3>
          <p className="text-xs text-gray-400">{batch.name} — {sport}</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input w-36 py-1.5 text-xs"
          disabled={saving}
        />
      </div>

      {/* Skills */}
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

      {/* Note */}
      <div>
        <label className="label">Coach note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="input"
          placeholder="What did the student do well? What to work on?"
          disabled={saving}
        />
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save Scores'}
        </button>
      </div>
    </div>
  );
}
