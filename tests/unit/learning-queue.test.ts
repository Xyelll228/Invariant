import { State } from 'ts-fsrs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ratingFor } from '../../src/lib/learning/grading.ts';
import { DEFAULT_LIMITS, isDue, planDay } from '../../src/lib/learning/queue.ts';
import { applyReview, createScheduler, newCard } from '../../src/lib/learning/scheduler.ts';
import type { CardRecord, ReviewRecord } from '../../src/lib/learning/types.ts';

const scheduler = createScheduler();
let previousTz: string | undefined;
beforeAll(() => {
  previousTz = process.env.TZ;
  process.env.TZ = 'Asia/Almaty';
});
afterAll(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

const local = (month: number, day: number, hour = 0, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
const MINUTE = 60_000;

function card(id: string, createdAt: number, topicId = 'topic'): CardRecord {
  return newCard({ cardId: id, topicId, source: 'content', createdAt });
}

/** Отвечает на карточку и возвращает её новое состояние и запись истории. */
function answer(current: CardRecord, at: number, correct = true): { card: CardRecord; review: ReviewRecord } {
  const input = {
    id: `${current.cardId}-${at}`,
    cardId: current.cardId,
    at,
    correct,
    confidence: 'know' as const,
    usedHint: false,
    tooEasy: false,
    rating: ratingFor({ correct, confidence: 'know', usedHint: false }),
    seed: null,
    contentVersion: null,
    misconception: null,
    mode: 'review' as const,
  };
  const result = applyReview(current, input, scheduler);
  return { card: result.card, review: { ...input, stateBefore: result.stateBefore } };
}

/** Доводит карточку до повторения в днях: два ответа «верно, знаю». */
function learned(id: string, at: number, topicId?: string): { card: CardRecord; reviews: ReviewRecord[] } {
  const first = answer(card(id, at, topicId), at);
  const second = answer(first.card, first.card.fsrs.due);
  return { card: second.card, reviews: [first.review, second.review] };
}

describe('план учебного дня', () => {
  it('новых — не больше лимита, с учётом уже начатых сегодня', () => {
    const cards = Array.from({ length: 15 }, (_, index) => card(`n${String(index).padStart(2, '0')}`, local(10, 1) + index));
    const now = local(10, 24, 10);
    expect(planDay({ cards, reviews: [], now, scheduler }).fresh).toHaveLength(DEFAULT_LIMITS.newPerDay);

    const started = cards.slice(0, 4).map((item) => answer(item, local(10, 24, 9)));
    const rest = [...started.map((item) => item.card), ...cards.slice(4)];
    const plan = planDay({ cards: rest, reviews: started.map((item) => item.review), now, scheduler });
    expect(plan.newToday).toBe(4);
    expect(plan.fresh).toHaveLength(6);
    expect(plan.fresh[0]?.cardId).toBe('n04');
  });

  it('короткие шаги изучения — по точному времени и без лимита', () => {
    const { card: step } = answer(card('a', local(10, 24, 9)), local(10, 24, 10));
    expect(step.fsrs.state).toBe(State.Learning);
    expect(planDay({ cards: [step], reviews: [], now: local(10, 24, 10, 5), scheduler }).learning).toHaveLength(0);
    expect(planDay({ cards: [step], reviews: [], now: local(10, 24, 10, 10), scheduler }).learning).toHaveLength(1);
  });

  it('повторение в днях доступно с начала своего учебного дня, а не с точной минуты', () => {
    const { card: item } = learned('a', local(10, 20, 22));
    const dueDay = new Date(item.fsrs.due);
    const dayStart = new Date(dueDay.getFullYear(), dueDay.getMonth(), dueDay.getDate(), dueDay.getHours() < 4 ? -20 : 4).getTime();
    expect(isDue(item, dayStart - MINUTE)).toBe(false);
    expect(isDue(item, dayStart)).toBe(true);
    expect(isDue(item, item.fsrs.due - MINUTE)).toBe(true);
  });

  it('после перерыва — сначала карточки с наименьшей вероятностью вспомнить, остальные ждут', () => {
    const items = ['a', 'b', 'c', 'd'].map((id, index) => learned(id, local(9, 1 + index * 5, 12)));
    const now = local(10, 24, 12);
    const plan = planDay({
      cards: items.map((item) => item.card),
      reviews: items.flatMap((item) => item.reviews),
      now,
      scheduler,
      limits: { newPerDay: 10, reviewsPerDay: 3 },
    });
    expect(plan.reviews.map((item) => item.cardId)).toEqual(['a', 'b', 'c']);
    expect(plan.postponed).toBe(1);
  });

  it('повторения сегодня уменьшают оставшийся лимит', () => {
    const items = ['a', 'b', 'c'].map((id) => learned(id, local(9, 1, 12)));
    const now = local(10, 24, 12);
    const done = answer(items[0]!.card, local(10, 24, 11));
    expect(done.review.stateBefore).toBe(State.Review);
    const plan = planDay({
      cards: [done.card, items[1]!.card, items[2]!.card],
      reviews: [...items.flatMap((item) => item.reviews), done.review],
      now,
      scheduler,
      limits: { newPerDay: 10, reviewsPerDay: 2 },
    });
    expect(plan.reviewsToday).toBe(1);
    expect(plan.reviews).toHaveLength(1);
    expect(plan.postponed).toBe(1);
  });

  it('тема на паузе не попадает в план', () => {
    const paused = learned('a', local(9, 1, 12), 'paused');
    const active = learned('b', local(9, 1, 12), 'active');
    const plan = planDay({
      cards: [paused.card, active.card],
      reviews: [...paused.reviews, ...active.reviews],
      now: local(10, 24, 12),
      scheduler,
      pausedTopics: new Set(['paused']),
    });
    expect(plan.reviews.map((item) => item.cardId)).toEqual(['b']);
  });

  it('карточка «изменено» встаёт на ближайшее повторение первой', () => {
    const fresh = learned('a', local(10, 23, 12));
    const stale = learned('b', local(9, 1, 12));
    const changed = { ...fresh.card, changedAt: local(10, 24, 9) };
    const plan = planDay({ cards: [stale.card, changed], reviews: [...fresh.reviews, ...stale.reviews], now: local(10, 24, 12), scheduler });
    expect(plan.reviews.map((item) => item.cardId)).toEqual(['a', 'b']);
  });
});
