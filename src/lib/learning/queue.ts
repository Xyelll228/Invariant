/**
 * План учебного дня (ТЗ, «Защита от перегрузки и возвращение после перерыва»):
 * лимиты новых навыков и повторений за учебный день; после перерыва сначала
 * идут карточки с наименьшей вероятностью вспомнить, остальные ждут — лавина
 * повторений не вываливается разом.
 */
import { State, type FSRS } from 'ts-fsrs';
import { DEFAULT_DAY_START_HOUR, learningDayStart, nextLearningDayStart } from './day.ts';
import { isChanged, retrievability } from './scheduler.ts';
import type { CardRecord, ReviewRecord } from './types.ts';

export interface Limits {
  newPerDay: number;
  reviewsPerDay: number;
}

export const DEFAULT_LIMITS: Limits = { newPerDay: 10, reviewsPerDay: 100 };

/**
 * Пора ли повторять карточку. Короткие шаги изучения (минуты) — по точному
 * времени; интервалы в днях — с начала учебного дня, на который пришёлся срок.
 * Карточка с пометкой «изменено» ставится на ближайшее повторение.
 */
export function isDue(card: CardRecord, now: number, dayStartHour = DEFAULT_DAY_START_HOUR): boolean {
  const { fsrs } = card;
  if (fsrs.state === State.New) return false;
  if (isChanged(card)) return true;
  if (fsrs.scheduled_days >= 1) return learningDayStart(fsrs.due, dayStartHour) <= learningDayStart(now, dayStartHour);
  return fsrs.due <= now;
}

function isShortTerm(card: CardRecord): boolean {
  const { state, scheduled_days } = card.fsrs;
  return (state === State.Learning || state === State.Relearning) && scheduled_days < 1;
}

export interface DayPlan {
  /** Короткие шаги изучения, срок которых наступил: без лимита, по времени. */
  learning: CardRecord[];
  /** Повторения на сегодня в пределах лимита — от наименьшей вероятности вспомнить. */
  reviews: CardRecord[];
  /** Новые навыки в пределах лимита — в порядке появления. */
  fresh: CardRecord[];
  /** Сколько повторений ждёт следующих дней из-за лимита. */
  postponed: number;
  newToday: number;
  reviewsToday: number;
}

export interface PlanInput {
  cards: readonly CardRecord[];
  reviews: readonly ReviewRecord[];
  now: number;
  scheduler: FSRS;
  limits?: Limits;
  dayStartHour?: number;
  /** Темы на паузе: их карточки в план не попадают. */
  pausedTopics?: ReadonlySet<string>;
}

export function planDay(input: PlanInput): DayPlan {
  const { now, scheduler, limits = DEFAULT_LIMITS, dayStartHour = DEFAULT_DAY_START_HOUR, pausedTopics = new Set() } = input;
  const start = learningDayStart(now, dayStartHour);
  const end = nextLearningDayStart(now, dayStartHour);
  const today = (at: number | null) => at !== null && at >= start && at < end;

  const reviewsToday = input.reviews.filter((review) => today(review.at) && review.stateBefore === State.Review).length;
  const newToday = input.cards.filter((card) => today(card.introducedAt)).length;
  const active = input.cards.filter((card) => !pausedTopics.has(card.topicId));

  const learning = active.filter((card) => isShortTerm(card) && !isChanged(card) && card.fsrs.due <= now).sort((a, b) => a.fsrs.due - b.fsrs.due);
  const inLearning = new Set(learning.map((card) => card.cardId));

  const due = active
    .filter((card) => !inLearning.has(card.cardId) && (isChanged(card) || (!isShortTerm(card) && isDue(card, now, dayStartHour))))
    .map((card) => ({ card, r: isChanged(card) ? -1 : retrievability(card, now, scheduler) }))
    .sort((a, b) => a.r - b.r || (a.card.cardId < b.card.cardId ? -1 : 1))
    .map(({ card }) => card);
  const reviewSlots = Math.max(0, limits.reviewsPerDay - reviewsToday);
  const reviews = due.slice(0, reviewSlots);

  const freshSlots = Math.max(0, limits.newPerDay - newToday);
  const fresh = active
    .filter((card) => card.fsrs.state === State.New)
    .sort((a, b) => a.createdAt - b.createdAt || (a.cardId < b.cardId ? -1 : 1))
    .slice(0, freshSlots);

  return { learning, reviews, fresh, postponed: due.length - reviews.length, newToday, reviewsToday };
}
