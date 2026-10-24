import fc from 'fast-check';
import { Rating, State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { ratingFor } from '../../src/lib/learning/grading.ts';
import { applyReview, createScheduler, isChanged, newCard, replayCard, retrievability, type ReviewInput } from '../../src/lib/learning/scheduler.ts';
import type { CardRecord, Confidence, ReviewRecord } from '../../src/lib/learning/types.ts';

const MINUTE = 60_000;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 24, 8, 0);
const scheduler = createScheduler();

function review(id: string, at: number, correct: boolean, confidence: Confidence, usedHint = false, tooEasy = false): ReviewInput {
  return {
    id,
    cardId: 'card',
    at,
    correct,
    confidence,
    usedHint,
    tooEasy,
    rating: ratingFor({ correct, confidence, usedHint, tooEasy }),
    seed: null,
    contentVersion: null,
    misconception: null,
    mode: 'review',
  };
}

function fresh(): CardRecord {
  return newCard({ cardId: 'card', topicId: 'topic', source: 'content', createdAt: T0 });
}

/** Отвечает «верно, знаю» каждый раз в срок, пока интервал не станет больше days. */
function growUntil(card: CardRecord, days: number): CardRecord {
  let current = card;
  let index = 0;
  while (current.fsrs.scheduled_days <= days) {
    current = applyReview(current, review(`grow-${index++}`, Math.max(current.fsrs.due, T0), true, 'know'), scheduler).card;
  }
  return current;
}

describe('планирование по FSRS', () => {
  it('новая карточка: короткие шаги изучения, затем интервалы в днях', () => {
    let card = applyReview(fresh(), review('a', T0, true, 'know'), scheduler).card;
    expect(card.fsrs.state).toBe(State.Learning);
    expect(card.fsrs.due - T0).toBe(10 * MINUTE);
    expect(card.introducedAt).toBe(T0);

    card = applyReview(card, review('b', card.fsrs.due, true, 'know'), scheduler).card;
    expect(card.fsrs.state).toBe(State.Review);
    expect(card.fsrs.scheduled_days).toBeGreaterThanOrEqual(1);
    expect(card.introducedAt).toBe(T0);
  });

  it('уверенная ошибка: повтор в этой же сессии, затем не позже чем через день и через неделю', () => {
    let card = growUntil(fresh(), 30);
    const errorAt = card.fsrs.due;
    const afterError = applyReview(card, review('error', errorAt, false, 'know'), scheduler);
    expect(afterError.stateBefore).toBe(State.Review);
    card = afterError.card;
    expect(card.fsrs.state).toBe(State.Relearning);
    expect(card.fsrs.due - errorAt).toBeLessThanOrEqual(10 * MINUTE);
    expect(card.followUps).toBe(2);

    const relearnAt = card.fsrs.due;
    card = applyReview(card, review('relearn', relearnAt, true, 'know'), scheduler).card;
    expect(card.fsrs.state).toBe(State.Review);
    expect(card.fsrs.scheduled_days).toBe(1);
    expect(card.fsrs.due).toBe(relearnAt + DAY);
    expect(card.followUps).toBe(1);

    const dayAt = card.fsrs.due;
    card = applyReview(card, review('day', dayAt, true, 'know'), scheduler).card;
    expect(card.fsrs.scheduled_days).toBeLessThanOrEqual(7);
    expect(card.fsrs.due - dayAt).toBeLessThanOrEqual(7 * DAY);
    expect(card.followUps).toBe(0);

    card = growUntil(card, 7);
    expect(card.fsrs.scheduled_days).toBeGreaterThan(7);
  });

  it('ошибка с сомнением не включает правило уверенной ошибки', () => {
    const card = applyReview(growUntil(fresh(), 30), review('error', T0 + 100 * DAY, false, 'unsure'), scheduler).card;
    expect(card.fsrs.state).toBe(State.Relearning);
    expect(card.followUps).toBe(0);
  });

  it('вероятность вспомнить убывает со временем', () => {
    const card = growUntil(fresh(), 10);
    const last = card.fsrs.last_review ?? T0;
    const soon = retrievability(card, last + DAY, scheduler);
    const later = retrievability(card, last + 30 * DAY, scheduler);
    expect(soon).toBeGreaterThan(later);
    expect(retrievability(fresh(), T0, scheduler)).toBe(0);
  });

  it('пометка «изменено» — только если смысл поменялся после последнего ответа', () => {
    const card = applyReview(fresh(), review('a', T0, true, 'know'), scheduler).card;
    expect(isChanged({ ...card, changedAt: T0 - MINUTE })).toBe(false);
    expect(isChanged({ ...card, changedAt: T0 + MINUTE })).toBe(true);
    expect(isChanged({ ...fresh(), changedAt: T0 + MINUTE })).toBe(false);
  });
});

const answerArb = fc.record({
  gapMinutes: fc.oneof(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 60, max: 90 * 24 * 60 })),
  correct: fc.boolean(),
  confidence: fc.constantFrom<Confidence>('know', 'unsure', 'guess'),
  usedHint: fc.boolean(),
  tooEasy: fc.boolean(),
});

describe('пересчёт из истории', () => {
  it('replay даёт то же состояние, что и ответы по одному, и тот же stateBefore', () => {
    fc.assert(
      fc.property(fc.array(answerArb, { minLength: 1, maxLength: 25 }), fc.integer(), (answers, shuffleSeed) => {
        let card = fresh();
        let at = T0;
        const history: ReviewRecord[] = [];
        answers.forEach((answer, index) => {
          at += answer.gapMinutes * MINUTE;
          const input = review(`r${String(index).padStart(3, '0')}`, at, answer.correct, answer.confidence, answer.usedHint, answer.tooEasy);
          const result = applyReview(card, input, scheduler);
          history.push({ ...input, stateBefore: result.stateBefore });
          card = result.card;
        });
        // Порядок записей в базе не важен: replay сортирует по времени.
        const shuffled = [...history].sort((a, b) => ((a.at * 7919 + shuffleSeed) % 1000) - ((b.at * 7919 + shuffleSeed) % 1000));
        const replayed = replayCard(fresh(), shuffled, scheduler);
        expect(replayed.card).toEqual(card);
        expect(replayed.reviews).toEqual(history);
      }),
      { numRuns: 200 },
    );
  });

  it('ответ раньше даты создания карточки (часы другого устройства) не ломает пересчёт', () => {
    const early = { ...review('early', T0 - DAY, true, 'know'), stateBefore: State.New };
    const { card } = replayCard(fresh(), [early], scheduler);
    expect(card.createdAt).toBe(T0 - DAY);
    expect(card.fsrs.state).toBe(State.Learning);
    expect(card.fsrs.reps).toBe(1);
  });

  it('оценка Again не дальше 10 минут даже у новой карточки', () => {
    const card = applyReview(fresh(), review('a', T0, false, 'guess'), scheduler).card;
    expect(card.fsrs.due - T0).toBeLessThanOrEqual(10 * MINUTE);
    expect(Rating.Again).toBe(1);
  });
});
