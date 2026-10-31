import { describe, expect, it } from 'vitest';
import {
  daysSince,
  diagnosticDue,
  diagnosticLevels,
  diagnosticVerdicts,
  lastActivity,
  pickDiagnosticQuestion,
} from '../../src/lib/learning/diagnostics.ts';
import type { PreparedQuestion } from '../../src/lib/learning/question-types.ts';
import type { ProgressRecord } from '../../src/lib/learning/types.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 11, 15, 10);

function record(topicId: string, level: ProgressRecord['level'], extra: Partial<ProgressRecord> = {}): ProgressRecord {
  return { topicId, level, status: 'in-progress', completedSteps: [], paused: false, updatedAt: NOW - 40 * DAY, done: ['q'], ...extra };
}

function question(id: string, format: string, extra: Partial<PreparedQuestion> = {}): PreparedQuestion {
  return {
    id,
    version: 1,
    level: 'fundament',
    role: 'practice',
    step: 2,
    block: null,
    skill: 's',
    type: 'choice',
    hints: [],
    explanation: null,
    format,
    ...extra,
  } as PreparedQuestion;
}

describe('диагностика после перерыва', () => {
  it('последнее занятие — последний ответ, без ответов — последнее изменение прогресса', () => {
    expect(lastActivity([{ at: 5 }, { at: 9 }], [{ updatedAt: 100 }])).toBe(9);
    expect(lastActivity([], [{ updatedAt: 3 }, { updatedAt: 7 }])).toBe(7);
    expect(lastActivity([], [])).toBeNull();
    expect(daysSince(NOW - 40 * DAY - 1000, NOW)).toBe(40);
  });

  it('предлагается после перерыва дольше заданного, «не сейчас» — до следующих занятий', () => {
    const base = { now: NOW, breakDays: 30, dismissedAt: null, hasProgress: true };
    expect(diagnosticDue({ ...base, last: NOW - 31 * DAY })).toBe(true);
    expect(diagnosticDue({ ...base, last: NOW - 30 * DAY })).toBe(false);
    expect(diagnosticDue({ ...base, last: NOW - 31 * DAY, hasProgress: false })).toBe(false);
    // Нажал «не сейчас» после последних занятий — не предлагаем.
    expect(diagnosticDue({ ...base, last: NOW - 31 * DAY, dismissedAt: NOW - DAY })).toBe(false);
    // «Не сейчас» было до занятий, потом снова перерыв — предлагаем.
    expect(diagnosticDue({ ...base, last: NOW - 31 * DAY, dismissedAt: NOW - 60 * DAY })).toBe(true);
  });

  it('проверяются начатые и освоенные уровни, кроме тем на паузе; если их много — самые давние', () => {
    const records = [
      record('b', 'base', { updatedAt: NOW - 50 * DAY, status: 'mastered' }),
      record('b', 'fundament', { updatedAt: NOW - 60 * DAY, status: 'mastered' }),
      record('a', 'fundament', { updatedAt: NOW - 45 * DAY }),
      record('c', 'fundament', { status: 'not-started', done: [] }),
      record('p', 'fundament', { paused: true }),
      record('x', 'fundament'),
    ];
    const known = new Set(['a', 'b', 'c', 'p']);
    expect(diagnosticLevels(records, known).map((item) => `${item.topicId}:${item.level}`)).toEqual(['a:fundament', 'b:fundament', 'b:base']);
    expect(diagnosticLevels(records, known, 2).map((item) => `${item.topicId}:${item.level}`)).toEqual(['b:fundament', 'b:base']);
  });

  it('задание короткое: без кода, объяснений и симуляции; генератор — первым', () => {
    const topic = {
      questions: [
        question('t.q.pre', 'choice', { role: 'pre', skill: null }),
        question('t.q.code', 'code'),
        question('t.q.self', 'self'),
        question('t.q.choice', 'choice'),
        question('t.q.gen', 'generated'),
        question('t.q.base', 'generated', { level: 'base' }),
      ],
    };
    expect(pickDiagnosticQuestion(topic, 'fundament', 1)?.id).toBe('t.q.gen');
    expect(pickDiagnosticQuestion({ questions: topic.questions.slice(0, 4) }, 'fundament', 1)?.id).toBe('t.q.choice');
    expect(pickDiagnosticQuestion({ questions: topic.questions.slice(0, 3) }, 'fundament', 1)).toBeNull();
  });

  it('итог: с первого уровня, где ответ неверный, тему стоит пройти заново', () => {
    const verdicts = diagnosticVerdicts([
      { topicId: 'a', level: 'base', correct: false },
      { topicId: 'a', level: 'fundament', correct: true },
      { topicId: 'b', level: 'fundament', correct: true },
    ]);
    expect(verdicts).toEqual([
      { topicId: 'a', levels: [{ level: 'fundament', correct: true }, { level: 'base', correct: false }], restartFrom: 'base' },
      { topicId: 'b', levels: [{ level: 'fundament', correct: true }], restartFrom: null },
    ]);
  });
});
