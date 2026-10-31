/**
 * Диагностика после перерыва (ТЗ, «Возвращение после перерыва»): если дольше
 * заданного числа дней (по умолчанию 30) не было занятий, главная предлагает
 * короткую проверку пройденных тем — что сохранилось, а что пройти заново и
 * с какого уровня. По одному заданию на начатый уровень, не больше двенадцати.
 * Чистые функции: их проверяют модульные тесты.
 */
import { hashString, levelQuestions } from './progress.ts';
import type { Level, PreparedQuestion } from './question-types.ts';
import type { ProgressRecord, ReviewRecord } from './types.ts';

const DAY = 86_400_000;
export const DIAGNOSTIC_MAX_QUESTIONS = 12;
const LEVEL_ORDER: Level[] = ['fundament', 'base', 'depth'];

/** Последнее занятие: последний ответ, а если ответов нет — последнее изменение прогресса. */
export function lastActivity(reviews: readonly Pick<ReviewRecord, 'at'>[], progress: readonly Pick<ProgressRecord, 'updatedAt'>[]): number | null {
  let last: number | null = null;
  for (const review of reviews) if (last === null || review.at > last) last = review.at;
  if (last !== null) return last;
  for (const record of progress) if (last === null || record.updatedAt > last) last = record.updatedAt;
  return last;
}

/** Сколько полных дней прошло с последнего занятия. */
export function daysSince(last: number, now: number): number {
  return Math.floor((now - last) / DAY);
}

export interface BreakInput {
  now: number;
  last: number | null;
  breakDays: number;
  /** Когда человек нажал «не сейчас»: до следующих занятий предложение не показывается. */
  dismissedAt: number | null;
  /** Есть ли что проверять: начатые или освоенные уровни. */
  hasProgress: boolean;
}

export function diagnosticDue({ now, last, breakDays, dismissedAt, hasProgress }: BreakInput): boolean {
  if (!hasProgress || last === null) return false;
  if (now - last <= breakDays * DAY) return false;
  return dismissedAt === null || dismissedAt < last;
}

export interface DiagnosticLevel {
  topicId: string;
  level: Level;
  status: ProgressRecord['status'];
  updatedAt: number;
}

/**
 * Что проверять: начатые и освоенные уровни тем, кроме тем на паузе.
 * Если уровней больше, чем вопросов в диагностике, — сначала те, к которым
 * дольше всего не возвращались: их забыть проще всего.
 */
export function diagnosticLevels(records: readonly ProgressRecord[], knownTopics: ReadonlySet<string>, limit = DIAGNOSTIC_MAX_QUESTIONS): DiagnosticLevel[] {
  const paused = new Set(records.filter((record) => record.paused).map((record) => record.topicId));
  const started = records.filter(
    (record) =>
      knownTopics.has(record.topicId) &&
      !paused.has(record.topicId) &&
      (record.status !== 'not-started' || (record.done?.length ?? 0) > 0 || record.lastQuestion !== undefined),
  );
  const chosen = [...started].sort((a, b) => a.updatedAt - b.updatedAt).slice(0, limit);
  return chosen
    .map((record) => ({ topicId: record.topicId, level: record.level, status: record.status, updatedAt: record.updatedAt }))
    .sort((a, b) => (a.topicId < b.topicId ? -1 : a.topicId > b.topicId ? 1 : LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level)));
}

/**
 * Задание уровня для диагностики: короткое (без кода, объяснений и ручной
 * симуляции), с навыком; лучше — генератора, с новыми данными.
 */
export function pickDiagnosticQuestion(topic: { questions: readonly PreparedQuestion[] }, level: Level, seed: number): PreparedQuestion | null {
  const quick = levelQuestions(topic, level).filter(
    (question) => question.role !== 'pre' && question.skill !== null && !['code', 'self', 'simulation'].includes(question.format),
  );
  if (quick.length === 0) return null;
  const rank = (question: PreparedQuestion): number =>
    (question.format === 'generated' ? 0 : question.format === 'order' ? 2 : 1) * 1e9 + (hashString(`${question.id}:${seed}`) % 1e9);
  return [...quick].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export interface DiagnosticAnswer {
  topicId: string;
  level: Level;
  correct: boolean;
}

export interface TopicVerdict {
  topicId: string;
  /** Проверенные уровни по порядку и результат каждого. */
  levels: { level: Level; correct: boolean }[];
  /** С какого уровня пройти заново; null — всё проверенное сохранилось. */
  restartFrom: Level | null;
}

/** Итог по темам: с первого уровня, где ответ неверный, тему стоит пройти заново. */
export function diagnosticVerdicts(answers: readonly DiagnosticAnswer[]): TopicVerdict[] {
  const byTopic = new Map<string, { level: Level; correct: boolean }[]>();
  for (const answer of answers) {
    const list = byTopic.get(answer.topicId) ?? [];
    list.push({ level: answer.level, correct: answer.correct });
    byTopic.set(answer.topicId, list);
  }
  return [...byTopic.entries()].map(([topicId, levels]) => {
    const ordered = [...levels].sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));
    return { topicId, levels: ordered, restartFrom: ordered.find((item) => !item.correct)?.level ?? null };
  });
}
