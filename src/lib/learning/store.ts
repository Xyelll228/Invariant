/**
 * Хранилище прохождения тем в браузере: ответы, карточки-навыки, журнал
 * ошибок и прогресс уровней (ТЗ, «Данные в браузере»). Один модуль на
 * страницу: острова страницы подписываются на изменения и обновляются вместе.
 */
import type { Grade } from 'ts-fsrs';
import { databaseName } from '../site.ts';
import { getSetting, LearningDatabase, setSetting } from './db.ts';
import { daysSince, diagnosticDue, lastActivity } from './diagnostics.ts';
import { setProgressFlag } from './flag.ts';
import { requestPersistence } from './persistence.ts';
import { isConfidentError, ratingFor } from './grading.ts';
import { checkPassed, completedSteps, levelStatus } from './progress.ts';
import type { Level, TopicContext } from './question-types.ts';
import { applyReview, createScheduler, newCard, replayCard } from './scheduler.ts';
import { loadSettings, type LearningSettings } from './settings.ts';
import type { CardRecord, Confidence, ErrorRecord, LevelCheckRecord, ProgressRecord, ReviewMode, ReviewRecord } from './types.ts';

let database: LearningDatabase | null = null;

export function getDb(): LearningDatabase {
  database ??= new LearningDatabase(databaseName);
  return database;
}

type Listener = (change: { topicId: string; level: Level }) => void;
const listeners = new Set<Listener>();

/** Подписка на изменения прогресса: вернёт функцию отписки. */
export function onProgress(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(topicId: string, level: Level): void {
  setProgressFlag(databaseName);
  askPersistenceOnce();
  for (const listener of listeners) listener({ topicId, level });
}

const PERSISTENCE_ASKED_KEY = 'invariant:persistence-asked';
let persistenceAsked = false;

/**
 * Постоянное хранилище (ТЗ, «Сохранность данных») просим один раз — когда
 * появился первый прогресс: до этого беречь нечего. Браузер вправе отказать;
 * что он решил, видно в настройках.
 */
function askPersistenceOnce(): void {
  if (persistenceAsked) return;
  persistenceAsked = true;
  try {
    if (localStorage.getItem(PERSISTENCE_ASKED_KEY)) return;
    localStorage.setItem(PERSISTENCE_ASKED_KEY, '1');
  } catch {
    return;
  }
  void requestPersistence();
}

export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export { randomSeed } from '../random.ts';

function emptyProgress(topicId: string, level: Level, now: number): ProgressRecord {
  return { topicId, level, status: 'not-started', completedSteps: [], paused: false, updatedAt: now };
}

async function levelReviews(db: LearningDatabase, topic: TopicContext, level: Level): Promise<ReviewRecord[]> {
  const skills = topic.skills.filter((skill) => skill.level === level).map((skill) => skill.id);
  if (skills.length === 0) return [];
  return db.reviews.where('cardId').anyOf(skills).toArray();
}

export interface LevelState {
  record: ProgressRecord;
  reviews: ReviewRecord[];
  settings: LearningSettings;
}

export async function loadLevel(topic: TopicContext, level: Level): Promise<LevelState> {
  const db = getDb();
  const [record, reviews, settings] = await Promise.all([
    db.progress.get([topic.topicId, level]),
    levelReviews(db, topic, level),
    loadSettings(db),
  ]);
  return { record: record ?? emptyProgress(topic.topicId, level, Date.now()), reviews, settings };
}

/** Пересчитывает пройденные шаги и состояние уровня. */
function refresh(topic: TopicContext, level: Level, record: ProgressRecord, reviews: readonly ReviewRecord[], settings: LearningSettings): ProgressRecord {
  const done = new Set(record.done ?? []);
  const steps = completedSteps(topic, level, done).map(String);
  const status = levelStatus({ topic, level, record, reviews, dayStartHour: settings.dayStartHour });
  return { ...record, completedSteps: steps, status };
}

export interface AnswerInput {
  topic: TopicContext;
  level: Level;
  question: { id: string; version: number; role: 'pre' | 'practice' | 'check'; skill: string | null };
  correct: boolean;
  /** Уверенность; у предвопросов её нет. */
  confidence: Confidence | null;
  usedHint: boolean;
  seed: number | null;
  misconception: string | null;
  mode: ReviewMode;
  /** Засчитывать ли задание в пройденные шаги уровня (итоговая и отложенная проверки — нет). */
  countsForSteps: boolean;
}

export interface AnswerResult {
  reviewId: string | null;
  errorId: string | null;
  rating: Grade | null;
  confidentError: boolean;
}

/**
 * Сохраняет ответ: оценку FSRS по правилам ТЗ, новое состояние карточки
 * навыка, запись в журнале ошибок и прогресс уровня — одной транзакцией.
 */
export async function recordAnswer(input: AnswerInput): Promise<AnswerResult> {
  const db = getDb();
  const now = Date.now();
  const { topic, level, question } = input;
  const settings = await loadSettings(db);
  const result: AnswerResult = { reviewId: null, errorId: null, rating: null, confidentError: false };

  await db.transaction('rw', [db.cards, db.reviews, db.errors, db.progress], async () => {
    if (question.role !== 'pre' && question.skill && input.confidence) {
      const skill = topic.skills.find((item) => item.id === question.skill);
      const existing = await db.cards.get(question.skill);
      const card: CardRecord = existing ?? newCard({ cardId: question.skill, topicId: topic.topicId, source: 'content', createdAt: now, contentVersion: skill?.version ?? 1 });
      if (skill && (card.contentVersion ?? 0) < skill.version) card.contentVersion = skill.version;
      const answer = { correct: input.correct, confidence: input.confidence, usedHint: input.usedHint };
      const rating = ratingFor(answer);
      const review = {
        id: randomId(),
        cardId: question.skill,
        at: now,
        correct: input.correct,
        confidence: input.confidence,
        usedHint: input.usedHint,
        tooEasy: false,
        rating,
        seed: input.seed,
        contentVersion: question.version,
        misconception: input.misconception,
        questionId: question.id,
        mode: input.mode,
      };
      const applied = applyReview(card, review, createScheduler(settings.retention));
      await db.reviews.put({ ...review, stateBefore: applied.stateBefore });
      await db.cards.put(applied.card);
      result.reviewId = review.id;
      result.rating = rating;
      result.confidentError = isConfidentError(answer);
      if (!input.correct) {
        const error: ErrorRecord = { id: randomId(), cardId: question.skill, misconception: input.misconception, at: now, note: '', resolved: false, updatedAt: now };
        await db.errors.put(error);
        result.errorId = error.id;
      }
    }

    const record = (await db.progress.get([topic.topicId, level])) ?? emptyProgress(topic.topicId, level, now);
    const done = new Set(record.done ?? []);
    if (input.countsForSteps && (input.correct || question.role === 'pre')) done.add(question.id);
    const reviews = await levelReviews(db, topic, level);
    // «Продолжить» ведёт к заданию темы, а не к повторению или проверке.
    const lastQuestion = input.mode === 'learn' ? question.id : record.lastQuestion;
    const next = refresh(topic, level, { ...record, done: [...done].sort(), ...(lastQuestion ? { lastQuestion } : {}), updatedAt: now }, reviews, settings);
    await db.progress.put(next);
  });
  emit(topic.topicId, level);
  return result;
}

/** «Слишком легко» после верного ответа «знаю»: оценка Easy, карточка пересчитывается по истории. */
export async function markTooEasy(topic: TopicContext, level: Level, reviewId: string): Promise<void> {
  const db = getDb();
  const settings = await loadSettings(db);
  await db.transaction('rw', [db.cards, db.reviews], async () => {
    const review = await db.reviews.get(reviewId);
    if (!review || !review.correct || review.confidence !== 'know' || review.usedHint) return;
    await db.reviews.put({ ...review, tooEasy: true, rating: 4 });
    const card = await db.cards.get(review.cardId);
    if (!card) return;
    const reviews = await db.reviews.where('cardId').equals(review.cardId).toArray();
    const replayed = replayCard(card, reviews, createScheduler(settings.retention));
    await db.cards.put({ ...replayed.card, contentVersion: card.contentVersion, changedAt: card.changedAt });
    await db.reviews.bulkPut(replayed.reviews);
  });
  emit(topic.topicId, level);
}

/** Заметка «почему я ошибся» в журнале ошибок. */
export async function saveErrorNote(errorId: string, note: string): Promise<void> {
  const db = getDb();
  const error = await db.errors.get(errorId);
  if (error) await db.errors.put({ ...error, note, updatedAt: Date.now() });
}

/** Итог итоговой или отложенной проверки. Пройденная проверка не затирается непройденной. */
export async function finishCheck(
  topic: TopicContext,
  level: Level,
  kind: 'check' | 'delayed',
  correct: number,
  total: number,
): Promise<LevelCheckRecord> {
  const db = getDb();
  const now = Date.now();
  const settings = await loadSettings(db);
  const result: LevelCheckRecord = { at: now, correct, total, passed: checkPassed(correct, total, settings.masteryThreshold) };
  await db.transaction('rw', [db.progress, db.reviews], async () => {
    const record = (await db.progress.get([topic.topicId, level])) ?? emptyProgress(topic.topicId, level, now);
    const previous = record[kind];
    const keep = previous?.passed && !result.passed ? previous : result;
    const reviews = await levelReviews(db, topic, level);
    await db.progress.put(refresh(topic, level, { ...record, [kind]: keep, updatedAt: now }, reviews, settings));
  });
  emit(topic.topicId, level);
  return result;
}

/** Состояние уровней тем: для каталога, главной и вкладок уровней. */
export async function allProgress(): Promise<ProgressRecord[]> {
  return getDb().progress.toArray();
}

/** Отметка «разобрался» в журнале ошибок. История не удаляется. */
export async function setErrorResolved(errorId: string, resolved: boolean): Promise<void> {
  const db = getDb();
  const error = await db.errors.get(errorId);
  if (error) await db.errors.put({ ...error, resolved, updatedAt: Date.now() });
}

/**
 * Пауза темы (ТЗ, «Защита от перегрузки»): навыки темы не попадают в
 * повторение, пока пауза не снята. Ставится на все уровни темы сразу.
 */
export async function setTopicPaused(topicId: string, levels: readonly Level[], paused: boolean): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.transaction('rw', db.progress, async () => {
    for (const level of levels) {
      const record = (await db.progress.get([topicId, level])) ?? emptyProgress(topicId, level, now);
      await db.progress.put({ ...record, paused, updatedAt: now });
    }
  });
  for (const level of levels) emit(topicId, level);
}

/** Тема на паузе, если на паузе любой её уровень. */
export async function isTopicPaused(topicId: string): Promise<boolean> {
  const records = await getDb().progress.where('topicId').equals(topicId).toArray();
  return records.some((record) => record.paused);
}

const DIAGNOSTIC_DISMISSED_KEY = 'diagnosticDismissedAt';

/**
 * Перерыв в занятиях (ТЗ, «Возвращение после перерыва»): пора ли предложить
 * диагностику и сколько дней прошло с последнего занятия.
 */
export async function breakState(now = Date.now()): Promise<{ due: boolean; days: number }> {
  const db = getDb();
  const [lastReview, progress, settings, dismissedAt] = await Promise.all([
    db.reviews.orderBy('at').last(),
    db.progress.toArray(),
    loadSettings(db),
    getSetting<number | null>(db, DIAGNOSTIC_DISMISSED_KEY, null),
  ]);
  const last = lastActivity(lastReview ? [lastReview] : [], progress);
  const hasProgress = progress.some((record) => record.status !== 'not-started' || (record.done?.length ?? 0) > 0);
  const due = diagnosticDue({ now, last, breakDays: settings.breakDays, dismissedAt, hasProgress });
  return { due, days: last === null ? 0 : daysSince(last, now) };
}

/** «Не сейчас»: предложение диагностики не показывается до следующего перерыва. */
export async function dismissDiagnostic(now = Date.now()): Promise<void> {
  await setSetting(getDb(), DIAGNOSTIC_DISMISSED_KEY, now);
}

/**
 * Пройти уровень заново (после диагностики): пройденные шаги и проверки
 * уровня обнуляются. История ответов и расписание повторений остаются.
 */
export async function restartLevel(topic: TopicContext, level: Level): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const settings = await loadSettings(db);
  await db.transaction('rw', [db.progress, db.reviews], async () => {
    const record = (await db.progress.get([topic.topicId, level])) ?? emptyProgress(topic.topicId, level, now);
    const { check: _check, delayed: _delayed, ...rest } = record;
    const reviews = await levelReviews(db, topic, level);
    // Ответы на уровне уже есть, поэтому он «изучается», а не «не начат», и остаётся в «Продолжить».
    await db.progress.put(refresh(topic, level, { ...rest, done: [], updatedAt: now }, reviews, settings));
  });
  emit(topic.topicId, level);
}
