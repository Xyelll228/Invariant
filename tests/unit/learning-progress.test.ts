import { describe, expect, it } from 'vitest';
import {
  checkPassed,
  completedSteps,
  delayedCheckDue,
  delayedCheckOpensAt,
  levelStatus,
  openConfidentErrors,
  pickDelayedQuestions,
  remainingSteps,
} from '../../src/lib/learning/progress.ts';
import type { PreparedQuestion, TopicContext } from '../../src/lib/learning/question-types.ts';
import type { ProgressRecord, ReviewRecord } from '../../src/lib/learning/types.ts';

/** Время по местным часам: учебный день начинается в 4:00. */
const at = (day: number, hour: number) => new Date(2026, 10, day, hour).getTime();

function q(id: string, role: 'pre' | 'practice' | 'check', step: number | null, skill: string | null, format = 'choice'): PreparedQuestion {
  return { id, version: 1, level: 'fundament', role, step, block: null, skill, type: 'choice', hints: [], explanation: null, format: format as 'choice', prompt: '', code: null, language: 'js', multiple: false, options: [] };
}

const topic: Pick<TopicContext, 'steps' | 'questions'> = {
  steps: { fundament: [0, 1, 2] },
  questions: [
    q('t.q.pre', 'pre', 0, null),
    q('t.q.a', 'practice', 1, 't.s.a'),
    q('t.q.b', 'practice', 2, 't.s.b'),
    q('t.q.c', 'practice', 2, 't.s.b'),
    q('t.q.check', 'check', null, 't.s.a'),
  ],
};

function record(extra: Partial<ProgressRecord> = {}): ProgressRecord {
  return { topicId: 't', level: 'fundament', status: 'in-progress', completedSteps: [], paused: false, updatedAt: 0, ...extra };
}

function review(cardId: string, time: number, correct: boolean, confidence: ReviewRecord['confidence'] = 'know'): ReviewRecord {
  return {
    id: `${cardId}-${time}`,
    cardId,
    at: time,
    correct,
    confidence,
    usedHint: false,
    tooEasy: false,
    rating: correct ? 3 : 1,
    stateBefore: 0,
    seed: null,
    contentVersion: 1,
    misconception: null,
    mode: 'learn',
  };
}

describe('шаги уровня', () => {
  it('шаг пройден, когда пройдены все его задания; предвопросы — шаг 0', () => {
    expect(completedSteps(topic, 'fundament', new Set())).toEqual([]);
    expect(completedSteps(topic, 'fundament', new Set(['t.q.pre', 't.q.b']))).toEqual([0]);
    expect(completedSteps(topic, 'fundament', new Set(['t.q.pre', 't.q.b', 't.q.c', 't.q.a']))).toEqual([0, 1, 2]);
    expect(remainingSteps(topic, 'fundament', new Set(['t.q.a']))).toEqual([0, 2]);
  });
});

describe('освоение уровня (ТЗ, «Когда уровень считается освоенным»)', () => {
  const allDone = ['t.q.pre', 't.q.a', 't.q.b', 't.q.c'];
  const passed = { at: at(2, 10), correct: 5, total: 5, passed: true };

  it('порог 80%: 4 из 5 — пройдено, 3 из 5 — нет', () => {
    expect(checkPassed(4, 5)).toBe(true);
    expect(checkPassed(3, 5)).toBe(false);
    expect(checkPassed(0, 0)).toBe(false);
    expect(checkPassed(8, 10, 0.9)).toBe(false);
  });

  it('«не начат» → «изучается» → «освоен» только при всех четырёх условиях', () => {
    expect(levelStatus({ topic, level: 'fundament', record: undefined, reviews: [] })).toBe('not-started');
    expect(levelStatus({ topic, level: 'fundament', record: record({ done: ['t.q.a'] }), reviews: [] })).toBe('in-progress');
    // Только неверный ответ — уровень уже начат.
    expect(levelStatus({ topic, level: 'fundament', record: record({ lastQuestion: 't.q.a' }), reviews: [] })).toBe('in-progress');
    expect(levelStatus({ topic, level: 'fundament', record: record(), reviews: [review('t.s.a', at(2, 10), false)] })).toBe('in-progress');
    // Запись о паузе без ответов — ещё не начат.
    expect(levelStatus({ topic, level: 'fundament', record: record({ paused: true }), reviews: [] })).toBe('not-started');
    // Все шаги и итоговая, но нет отложенной.
    expect(levelStatus({ topic, level: 'fundament', record: record({ done: allDone, check: passed }), reviews: [] })).toBe('in-progress');
    // Всё есть.
    const full = record({ done: allDone, check: passed, delayed: { at: at(3, 10), correct: 3, total: 3, passed: true } });
    expect(levelStatus({ topic, level: 'fundament', record: full, reviews: [] })).toBe('mastered');
    // Не хватает шага.
    expect(levelStatus({ topic, level: 'fundament', record: { ...full, done: ['t.q.pre', 't.q.a', 't.q.b'] }, reviews: [] })).toBe('in-progress');
  });

  it('уверенная ошибка закрывается только верным ответом в другой учебный день', () => {
    const skills = new Set(['t.s.a']);
    const error = review('t.s.a', at(2, 10), false, 'know');
    expect(openConfidentErrors([error], skills)).toHaveLength(1);
    // Верный ответ в тот же учебный день — ещё не проверка.
    expect(openConfidentErrors([error, review('t.s.a', at(2, 11), true)], skills)).toHaveLength(1);
    // В 3:00 следующего календарного дня — тот же учебный день.
    expect(openConfidentErrors([error, review('t.s.a', at(3, 3), true)], skills)).toHaveLength(1);
    expect(openConfidentErrors([error, review('t.s.a', at(3, 5), true)], skills)).toHaveLength(0);
    // Ошибка «наугад» — не уверенная.
    expect(openConfidentErrors([review('t.s.a', at(2, 10), false, 'guess')], skills)).toHaveLength(0);
    // Открытая уверенная ошибка не даёт уровню стать освоенным.
    const full = record({ done: allDone, check: passed, delayed: { at: at(3, 10), correct: 3, total: 3, passed: true } });
    expect(levelStatus({ topic, level: 'fundament', record: full, reviews: [error] })).toBe('in-progress');
  });

  it('отложенная проверка — не раньше следующего учебного дня после итоговой', () => {
    const done = record({ check: { at: at(2, 22), correct: 5, total: 5, passed: true } });
    expect(delayedCheckDue(done, at(2, 23))).toBe(false);
    expect(delayedCheckDue(done, at(3, 3))).toBe(false);
    expect(delayedCheckDue(done, at(3, 4))).toBe(true);
    expect(delayedCheckOpensAt(at(2, 22))).toBe(at(3, 4));
    // Итоговая сдана в 2:00 — это ещё учебный день 1-го числа: отложенная откроется 2-го в 4:00.
    expect(delayedCheckOpensAt(at(2, 2))).toBe(at(2, 4));
    expect(delayedCheckDue(record({ check: { ...done.check!, passed: false } }), at(5, 10))).toBe(false);
    expect(delayedCheckDue(record({ ...done, delayed: { at: at(3, 10), correct: 3, total: 3, passed: true } }), at(5, 10))).toBe(false);
  });

  it('в отложенную проверку — три задания, сначала разные навыки и задания с генератором', () => {
    const many = {
      questions: [
        q('t.q.pre', 'pre', 0, null),
        q('t.q.g1', 'practice', 2, 't.s.a', 'generated'),
        q('t.q.g2', 'check', null, 't.s.a', 'generated'),
        q('t.q.s1', 'practice', 1, 't.s.b'),
        q('t.q.s2', 'check', null, 't.s.c'),
        q('t.q.sim', 'practice', 2, 't.s.d', 'simulation'),
      ],
    };
    const picked = pickDelayedQuestions(many, 'fundament', 7);
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((item) => item.skill)).size).toBe(3);
    expect(picked[0]?.format).toBe('generated');
    expect(picked.some((item) => item.role === 'pre' || item.format === 'simulation')).toBe(false);
    // Одно и то же зерно — один и тот же выбор.
    expect(pickDelayedQuestions(many, 'fundament', 7)).toEqual(picked);
  });
});
