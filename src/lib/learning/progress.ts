/**
 * Прохождение уровня темы (ТЗ, «Цикл изучения темы» и «Когда уровень
 * считается освоенным»). Уровень «освоен», когда выполнены все условия:
 *
 * 1. Пройдены все шаги уровня: на каждое задание шага есть верный ответ
 *    (на предвопросы — любой ответ).
 * 2. Итоговая проверка: не меньше 80% верных ответов.
 * 3. Не осталось уверенных ошибок без повторной проверки: после ответа
 *    «знаю» с ошибкой на тот же навык есть верный ответ в более поздний учебный день.
 * 4. Не раньше чем через день пройдена отложенная проверка из трёх вопросов.
 *
 * Функции чистые: время и записи передаются явно, поэтому их легко проверить тестами.
 */
import { DEFAULT_DAY_START_HOUR, learningDaysBetween } from './day.ts';
import type { Level, LightQuestion, PreparedQuestion, TopicContext } from './question-types.ts';
import type { ProgressRecord, ProgressStatus, ReviewRecord } from './types.ts';

/** Порог «освоено» по умолчанию: 80% верных в итоговой и отложенной проверке. */
export const DEFAULT_MASTERY_THRESHOLD = 0.8;
/** Вопросов в отложенной проверке. */
export const DELAYED_QUESTIONS = 3;

type ProgressTopic = Pick<TopicContext, 'steps' | 'questions'>;

export function levelQuestions<Q extends LightQuestion>(topic: { questions: readonly Q[] }, level: Level): Q[] {
  return topic.questions.filter((question) => question.level === level);
}

/** Задания шага: предвопросы для шага 0, задания по ходу темы для остальных. */
export function stepQuestions(topic: ProgressTopic, level: Level, step: number): LightQuestion[] {
  return levelQuestions(topic, level).filter((question) =>
    step === 0 ? question.role === 'pre' : question.role === 'practice' && question.step === step,
  );
}

/** Пройденные шаги уровня: у шага есть задания, и все они пройдены. */
export function completedSteps(topic: ProgressTopic, level: Level, done: ReadonlySet<string>): number[] {
  return (topic.steps[level] ?? []).filter((step) => {
    const questions = stepQuestions(topic, level, step);
    return questions.length > 0 && questions.every((question) => done.has(question.id));
  });
}

/** Шаги, которые ещё не пройдены. */
export function remainingSteps(topic: ProgressTopic, level: Level, done: ReadonlySet<string>): number[] {
  const completed = new Set(completedSteps(topic, level, done));
  return (topic.steps[level] ?? []).filter((step) => !completed.has(step));
}

export function checkQuestions<Q extends LightQuestion>(topic: { questions: readonly Q[] }, level: Level): Q[] {
  return levelQuestions(topic, level).filter((question) => question.role === 'check');
}

export interface CheckResult {
  at: number;
  correct: number;
  total: number;
  passed: boolean;
}

export function checkPassed(correct: number, total: number, threshold = DEFAULT_MASTERY_THRESHOLD): boolean {
  return total > 0 && correct / total >= threshold - 1e-9;
}

/**
 * Уверенные ошибки на навыках уровня, после которых ещё не было верного
 * ответа в более поздний учебный день.
 */
export function openConfidentErrors(
  reviews: readonly ReviewRecord[],
  skills: ReadonlySet<string>,
  dayStartHour = DEFAULT_DAY_START_HOUR,
): ReviewRecord[] {
  const own = reviews.filter((review) => skills.has(review.cardId)).sort((a, b) => a.at - b.at);
  return own.filter(
    (error) =>
      !error.correct &&
      error.confidence === 'know' &&
      !own.some((later) => later.cardId === error.cardId && later.correct && later.at > error.at && learningDaysBetween(error.at, later.at, dayStartHour) >= 1),
  );
}

/** Отложенная проверка доступна: итоговая пройдена, и наступил следующий учебный день. */
export function delayedCheckDue(record: ProgressRecord | undefined, now: number, dayStartHour = DEFAULT_DAY_START_HOUR): boolean {
  const check = record?.check;
  if (!check?.passed || record?.delayed?.passed) return false;
  return learningDaysBetween(check.at, now, dayStartHour) >= 1;
}

/** Когда откроется отложенная проверка: начало следующего учебного дня после итоговой. */
export function delayedCheckOpensAt(checkAt: number, dayStartHour = DEFAULT_DAY_START_HOUR): number {
  const date = new Date(checkAt);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), dayStartHour);
  const dayStart = start.getTime() <= checkAt ? start : new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, dayStartHour);
  return new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1, dayStartHour).getTime();
}

export interface StatusInput {
  topic: ProgressTopic;
  level: Level;
  record: ProgressRecord | undefined;
  reviews: readonly ReviewRecord[];
  dayStartHour?: number;
}

export function levelStatus({ topic, level, record, reviews, dayStartHour = DEFAULT_DAY_START_HOUR }: StatusInput): ProgressStatus {
  const done = new Set(record?.done ?? []);
  if (done.size === 0 && !record?.check) return 'not-started';
  const allSteps = remainingSteps(topic, level, done).length === 0;
  const skills = new Set(levelQuestions(topic, level).flatMap((question) => (question.skill ? [question.skill] : [])));
  const errorsResolved = openConfidentErrors(reviews, skills, dayStartHour).length === 0;
  if (allSteps && record?.check?.passed && record.delayed?.passed && errorsResolved) return 'mastered';
  return 'in-progress';
}

/**
 * Вопросы отложенной проверки: три задания уровня — сначала с генератором
 * (у них будет новый вариант), затем из итоговой проверки, затем по ходу темы.
 * Порядок внутри групп зависит от зерна, чтобы в разные дни попадались разные.
 */
export function pickDelayedQuestions(topic: { questions: readonly PreparedQuestion[] }, level: Level, seed: number): PreparedQuestion[] {
  const graded = levelQuestions(topic, level).filter((question) => question.role !== 'pre' && question.skill !== null && question.format !== 'simulation');
  const rank = (question: PreparedQuestion): number =>
    (question.format === 'generated' ? 0 : question.role === 'check' ? 1 : 2) * 1e9 + (hashString(`${question.id}:${seed}`) % 1e9);
  const ordered = [...graded].sort((a, b) => rank(a) - rank(b));
  // Разные навыки, пока хватает.
  const chosen: PreparedQuestion[] = [];
  const skills = new Set<string>();
  for (const question of ordered) {
    if (chosen.length >= DELAYED_QUESTIONS) break;
    if (question.skill && skills.has(question.skill)) continue;
    chosen.push(question);
    if (question.skill) skills.add(question.skill);
  }
  for (const question of ordered) {
    if (chosen.length >= DELAYED_QUESTIONS) break;
    if (!chosen.includes(question)) chosen.push(question);
  }
  return chosen;
}

/** Небольшой стабильный хеш строки (FNV-1a). */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
