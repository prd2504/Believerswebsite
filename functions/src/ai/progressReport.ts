/**
 * AI-generated monthly progress reports via Anthropic Claude (claude-sonnet-4-6).
 *
 * Input: attendance %, last 4 weeks of skill scores, coach notes.
 * Output: 2–3 paragraph personalised summary.
 *
 * Step 1: only the public function signature and prompt template are defined; the
 * actual call is stubbed out behind a feature check so the function builds and deploys
 * without an API key.
 *
 * Step 8: will implement using fetch against https://api.anthropic.com/v1/messages.
 */

import { logger } from 'firebase-functions';
import { config, requireSecret } from '../config.js';
import type { SkillScoreMap } from '@bba/shared';

export interface ProgressReportInput {
  studentName: string;
  yearMonth: string;
  attendancePercent: number;
  sessionCount: number;
  averageScores: SkillScoreMap;
  coachNotes: string[];
}

export interface ProgressReportOutput {
  summaryText: string;
  modelId: string;
}

/**
 * Build the prompt the report generator sends to Claude. Exposed separately so tests
 * (and admins auditing a report) can inspect exactly what was asked.
 */
export function buildReportPrompt(input: ProgressReportInput): string {
  const scoresList = Object.entries(input.averageScores)
    .map(([skill, score]) => `- ${skill}: ${score.toFixed(1)}/10`)
    .join('\n');

  const notesBlock =
    input.coachNotes.length > 0
      ? input.coachNotes.map((n, i) => `  ${i + 1}. ${n}`).join('\n')
      : '  (no coach notes this month)';

  return `You are an encouraging, specific, and actionable junior-sports coach writing a
monthly progress report for a parent at Believers Badminton Academy in Mumbai.

Student: ${input.studentName}
Month: ${input.yearMonth}
Sessions attended: ${input.sessionCount} (${input.attendancePercent.toFixed(1)}%)

Average skill scores this month (1–10):
${scoresList}

Coach's session notes this month:
${notesBlock}

Write a 2–3 paragraph progress summary in plain, warm English that:
1. Opens with a concrete positive observation about what the student did well.
2. Highlights one or two specific skills that need focused work next month, with an
   actionable drill or mindset the student can practise.
3. Ends with an encouraging note directed at the parent.

Do not use markdown formatting. Do not include headings. Do not exceed three paragraphs.
Be specific — refer to actual skill names and scores above, not generic praise.`;
}

/**
 * Generate a progress report. Throws if ANTHROPIC_API_KEY is not configured — callers
 * should catch and fall back to a manual report form.
 */
export async function generateProgressReport(
  input: ProgressReportInput,
): Promise<ProgressReportOutput> {
  const apiKey = requireSecret(config.anthropic.apiKey, 'ANTHROPIC_API_KEY');
  const modelId = config.anthropic.modelId;

  const prompt = buildReportPrompt(input);
  logger.info('[progressReport] calling Claude', { modelId, student: input.studentName });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  const summaryText = data.content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('\n')
    .trim();

  if (!summaryText) {
    throw new Error('Claude returned an empty response.');
  }

  return { summaryText, modelId };
}
