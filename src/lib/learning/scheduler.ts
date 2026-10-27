/**
 * Планирование повторений по FSRS-6 (библиотека ts-fsrs) и правило
 * «уверенной ошибки» из ТЗ: неверный ответ с отметкой «знаю» повторяется
 * в этой же сессии (шаг переучивания), затем не позже чем через день и не
 * позже чем через неделю. Если FSRS сам назначит повтор раньше, остаётся его срок.
 *
 * Состояние карточки всегда можно пересчитать из истории ответов (replay):
 * так объединяются копии с двух устройств. Поэтому расписание
 * детерминировано — без случайного разброса интервалов (fuzz).
 */
import { createEmptyCard, fsrs, Rating, State, type Card, type FSRS } from 'ts-fsrs';
import { isConfidentError } from './grading.ts';
import type { CardRecord, FsrsState, ReviewRecord } from './types.ts';

export const DEFAULT_RETENTION = 0.9;
export const MIN_RETENTION = 0.8;
export const MAX_RETENTION = 0.95;

const DAY_MS = 86_400_000;

/** Ограничение интервала после уверенной ошибки: followUps → не больше стольких дней. */
const FOLLOW_UP_CAP_DAYS: Record<number, number> = { 2: 1, 1: 7 };

export function createScheduler(retention = DEFAULT_RETENTION): FSRS {
  if (!(retention >= MIN_RETENTION && retention <= MAX_RETENTION)) {
    throw new RangeError(`Уровень запоминания должен быть от ${MIN_RETENTION} до ${MAX_RETENTION}, получено ${retention}`);
  }
  return fsrs({ request_retention: retention, enable_fuzz: false });
}

export function toFsrsCard(state: FsrsState): Card {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsed_days,
    scheduled_days: state.scheduled_days,
    learning_steps: state.learning_steps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    ...(state.last_review === null ? {} : { last_review: new Date(state.last_review) }),
  };
}

export function fromFsrsCard(card: Card): FsrsState {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    // Поле устарело в ts-fsrs и уйдёт в версии 6, но тип Card версии 5 его требует.
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : null,
  };
}

export function emptyFsrsState(at: number): FsrsState {
  return fromFsrsCard(createEmptyCard(new Date(at)));
}

export interface NewCardInput {
  cardId: string;
  topicId: string;
  source: CardRecord['source'];
  createdAt: number;
  contentVersion?: number | null;
}

export function newCard(input: NewCardInput): CardRecord {
  return {
    cardId: input.cardId,
    topicId: input.topicId,
    source: input.source,
    createdAt: input.createdAt,
    introducedAt: null,
    followUps: 0,
    fsrs: emptyFsrsState(input.createdAt),
    contentVersion: input.contentVersion ?? null,
    changedAt: null,
  };
}

/**
 * Карточка помечена «изменено»: смысл поменялся после последнего ответа.
 * У карточки без ответов пометки нет — она и так покажется как новая.
 */
export function isChanged(card: CardRecord): boolean {
  return card.changedAt !== null && card.fsrs.last_review !== null && card.changedAt > card.fsrs.last_review;
}

export type ReviewInput = Omit<ReviewRecord, 'stateBefore'>;

/** Новое состояние карточки после ответа и состояние до него. */
export function applyReview(card: CardRecord, review: ReviewInput, scheduler: FSRS): { card: CardRecord; stateBefore: State } {
  const stateBefore = card.fsrs.state;
  let next = fromFsrsCard(scheduler.next(toFsrsCard(card.fsrs), new Date(review.at), review.rating).card);
  let followUps = card.followUps;
  if (isConfidentError(review)) {
    followUps = 2;
  } else if (followUps > 0 && review.rating !== Rating.Again && next.scheduled_days >= 1) {
    const capDays = FOLLOW_UP_CAP_DAYS[followUps] ?? Number.POSITIVE_INFINITY;
    if (next.scheduled_days > capDays) next = { ...next, due: review.at + capDays * DAY_MS, scheduled_days: capDays };
    followUps -= 1;
  }
  return {
    card: { ...card, fsrs: next, followUps, introducedAt: card.introducedAt ?? review.at },
    stateBefore,
  };
}

/** Порядок ответов в истории: по времени, при равном времени — по id. */
export function compareReviews(a: Pick<ReviewRecord, 'at' | 'id'>, b: Pick<ReviewRecord, 'at' | 'id'>): number {
  if (a.at !== b.at) return a.at - b.at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Пересчитывает карточку из истории её ответов: с чистого состояния, по
 * порядку времени. Возвращает и историю с уточнённым stateBefore.
 */
export function replayCard(
  card: CardRecord,
  reviews: readonly ReviewRecord[],
  scheduler: FSRS,
): { card: CardRecord; reviews: ReviewRecord[] } {
  const own = reviews.filter((review) => review.cardId === card.cardId).sort(compareReviews);
  const first = own[0];
  const start = first ? Math.min(card.createdAt, first.at) : card.createdAt;
  let current: CardRecord = { ...card, createdAt: start, introducedAt: null, followUps: 0, fsrs: emptyFsrsState(start) };
  const replayed: ReviewRecord[] = [];
  for (const review of own) {
    const result = applyReview(current, review, scheduler);
    replayed.push(review.stateBefore === result.stateBefore ? review : { ...review, stateBefore: result.stateBefore });
    current = result.card;
  }
  return { card: current, reviews: replayed };
}

/** Вероятность вспомнить сейчас: от 0 до 1. У новой карточки — 0. */
export function retrievability(card: CardRecord, now: number, scheduler: FSRS): number {
  if (card.fsrs.state === State.New) return 0;
  return scheduler.get_retrievability(toFsrsCard(card.fsrs), new Date(now), false);
}
