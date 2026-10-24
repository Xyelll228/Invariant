/**
 * Данные ученика целиком и их объединение (ТЗ, «Нестандартные ситуации»:
 * занятия на двух устройствах). Истории ответов складываются без повторов,
 * а состояние каждой карточки пересчитывается по общей истории в порядке времени.
 *
 * Объединение симметрично: merge(A, B) и merge(B, A) дают одно и то же — кроме
 * настроек, которые остаются от текущего устройства.
 */
import type { FSRS } from 'ts-fsrs';
import { compareReviews, replayCard } from './scheduler.ts';
import type {
  AiChatRecord,
  AttemptRecord,
  CardRecord,
  ErrorRecord,
  ExamRecord,
  NoteRecord,
  ProgressRecord,
  ProgressStatus,
  ReviewRecord,
  SettingRecord,
  UserCardRecord,
} from './types.ts';

/** Всё, что попадает в копию. Ключ API (secrets) сюда не входит никогда. */
export interface LearningData {
  settings: SettingRecord[];
  progress: ProgressRecord[];
  cards: CardRecord[];
  reviews: ReviewRecord[];
  attempts: AttemptRecord[];
  errors: ErrorRecord[];
  notes: NoteRecord[];
  userCards: UserCardRecord[];
  aiChats: AiChatRecord[];
  exams: ExamRecord[];
}

export const DATA_STORES = [
  'settings',
  'progress',
  'cards',
  'reviews',
  'attempts',
  'errors',
  'notes',
  'userCards',
  'aiChats',
  'exams',
] as const satisfies readonly (keyof LearningData)[];

export function emptyData(): LearningData {
  return { settings: [], progress: [], cards: [], reviews: [], attempts: [], errors: [], notes: [], userCards: [], aiChats: [], exams: [] };
}

/** Детерминированный выбор между двумя версиями записи: по строке JSON. */
function pickStable<T>(a: T, b: T): T {
  return JSON.stringify(a) <= JSON.stringify(b) ? a : b;
}

function byKey<T>(items: readonly T[], key: (item: T) => string): Map<string, T> {
  return new Map(items.map((item) => [key(item), item]));
}

/** Объединение по ключу: при совпадении ключа запись выбирает choose. */
function unionBy<T>(a: readonly T[], b: readonly T[], key: (item: T) => string, choose: (x: T, y: T) => T): T[] {
  const result = byKey(a, key);
  for (const item of b) {
    const k = key(item);
    const existing = result.get(k);
    result.set(k, existing === undefined ? item : choose(existing, item));
  }
  return [...result.entries()].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([, item]) => item);
}

/** Побеждает более поздняя правка; при равном времени — детерминированный выбор. */
function newer<T extends { updatedAt: number }>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return pickStable(a, b);
}

const STATUS_ORDER: Record<ProgressStatus, number> = { 'not-started': 0, 'in-progress': 1, mastered: 2 };

function mergeProgress(a: ProgressRecord, b: ProgressRecord): ProgressRecord {
  const latest = newer(a, b);
  const status = STATUS_ORDER[a.status] >= STATUS_ORDER[b.status] ? a.status : b.status;
  const completedSteps = [...new Set([...a.completedSteps, ...b.completedSteps])].sort();
  return { ...latest, status, completedSteps, updatedAt: Math.max(a.updatedAt, b.updatedAt) };
}

function mergeCardMeta(a: CardRecord, b: CardRecord): CardRecord {
  const base = pickStable(a, b);
  const changed = [a.changedAt, b.changedAt].filter((value): value is number => value !== null);
  const versions = [a.contentVersion, b.contentVersion].filter((value): value is number => value !== null);
  return {
    ...base,
    createdAt: Math.min(a.createdAt, b.createdAt),
    contentVersion: versions.length > 0 ? Math.max(...versions) : null,
    changedAt: changed.length > 0 ? Math.max(...changed) : null,
  };
}

/**
 * Объединяет данные текущего устройства (local) с данными из копии (incoming).
 * Состояния карточек пересчитываются по объединённой истории ответов.
 */
export function mergeData(local: LearningData, incoming: LearningData, scheduler: FSRS): LearningData {
  const reviews = unionBy(local.reviews, incoming.reviews, (review) => review.id, pickStable).sort(compareReviews);
  const cardsMeta = unionBy(local.cards, incoming.cards, (card) => card.cardId, mergeCardMeta);

  const reviewsByCard = new Map<string, ReviewRecord[]>();
  for (const review of reviews) {
    const list = reviewsByCard.get(review.cardId);
    if (list) list.push(review);
    else reviewsByCard.set(review.cardId, [review]);
  }
  const replayedReviews = new Map<string, ReviewRecord>();
  const cards = cardsMeta.map((card) => {
    const result = replayCard(card, reviewsByCard.get(card.cardId) ?? [], scheduler);
    for (const review of result.reviews) replayedReviews.set(review.id, review);
    return result.card;
  });

  return {
    // Настройки — от текущего устройства: это его выбор темы, лимитов и прочего.
    settings: [...local.settings],
    progress: unionBy(local.progress, incoming.progress, (item) => `${item.topicId}|${item.level}`, mergeProgress),
    cards,
    // Ответы карточек, которых нет ни на одном устройстве, остаются в истории как есть.
    reviews: reviews.map((review) => replayedReviews.get(review.id) ?? review),
    attempts: unionBy(local.attempts, incoming.attempts, (item) => item.id, pickStable),
    errors: unionBy(local.errors, incoming.errors, (item) => item.id, newer),
    notes: unionBy(local.notes, incoming.notes, (item) => item.id, newer),
    userCards: unionBy(local.userCards, incoming.userCards, (item) => item.id, newer),
    aiChats: unionBy(local.aiChats, incoming.aiChats, (item) => item.id, newer),
    exams: unionBy(local.exams, incoming.exams, (item) => item.id, pickStable),
  };
}
