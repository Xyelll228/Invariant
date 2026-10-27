import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ratingFor } from '../../src/lib/learning/grading.ts';
import { emptyData, mergeData, type LearningData } from '../../src/lib/learning/merge.ts';
import { applyReview, createScheduler, newCard, replayCard } from '../../src/lib/learning/scheduler.ts';
import type { CardRecord, Confidence, ProgressRecord, ReviewRecord } from '../../src/lib/learning/types.ts';

const scheduler = createScheduler();
const T0 = Date.UTC(2026, 9, 1, 8, 0);
const MINUTE = 60_000;
const CARD_IDS = ['c1', 'c2', 'c3'] as const;

interface Answer {
  cardId: (typeof CARD_IDS)[number];
  at: number;
  correct: boolean;
  confidence: Confidence;
}

/** Данные одного устройства: ответы применяются по порядку времени, как в приложении. */
function device(name: string, answers: Answer[]): LearningData {
  const data = emptyData();
  const cards = new Map<string, CardRecord>();
  const sorted = [...answers].sort((a, b) => a.at - b.at);
  sorted.forEach((answer, index) => {
    const current = cards.get(answer.cardId) ?? newCard({ cardId: answer.cardId, topicId: 'topic', source: 'content', createdAt: T0 });
    const input = {
      id: `${name}-${String(index).padStart(3, '0')}`,
      cardId: answer.cardId,
      at: answer.at,
      correct: answer.correct,
      confidence: answer.confidence,
      usedHint: false,
      tooEasy: false,
      rating: ratingFor({ correct: answer.correct, confidence: answer.confidence, usedHint: false }),
      seed: index,
      contentVersion: 1,
      misconception: null,
      mode: 'review' as const,
    };
    const result = applyReview(current, input, scheduler);
    data.reviews.push({ ...input, stateBefore: result.stateBefore });
    cards.set(answer.cardId, result.card);
  });
  data.cards = [...cards.values()];
  return data;
}

const answerArb = fc.record({
  cardId: fc.constantFrom(...CARD_IDS),
  at: fc.integer({ min: 0, max: 60 * 24 * 60 }).map((minutes) => T0 + minutes * MINUTE),
  correct: fc.boolean(),
  confidence: fc.constantFrom<Confidence>('know', 'unsure', 'guess'),
});

function withoutSettings(data: LearningData): Omit<LearningData, 'settings'> {
  const { settings: _settings, ...rest } = data;
  return rest;
}

describe('объединение копий с двух устройств', () => {
  it('симметрично, идемпотентно и равно пересчёту по общей истории', () => {
    fc.assert(
      fc.property(fc.array(answerArb, { maxLength: 20 }), fc.array(answerArb, { maxLength: 20 }), (answersA, answersB) => {
        const a = device('a', answersA);
        const b = device('b', answersB);
        const ab = mergeData(a, b, scheduler);
        const ba = mergeData(b, a, scheduler);
        expect(withoutSettings(ab)).toEqual(withoutSettings(ba));
        expect(mergeData(ab, ab, scheduler)).toEqual(ab);
        expect(mergeData(ab, a, scheduler)).toEqual(ab);

        // Ответы складываются без повторов, а карточки пересчитаны по общей истории.
        expect(ab.reviews).toHaveLength(answersA.length + answersB.length);
        for (const item of ab.cards) {
          const fresh = newCard({ cardId: item.cardId, topicId: 'topic', source: 'content', createdAt: T0 });
          expect(item).toEqual(replayCard(fresh, ab.reviews, scheduler).card);
        }
      }),
      { numRuns: 150 },
    );
  });

  it('объединение с пустыми данными ничего не теряет', () => {
    const a = device('a', [
      { cardId: 'c1', at: T0, correct: true, confidence: 'know' },
      { cardId: 'c1', at: T0 + 10 * MINUTE, correct: true, confidence: 'know' },
    ]);
    expect(mergeData(a, emptyData(), scheduler)).toEqual(mergeData(emptyData(), a, scheduler));
    expect(mergeData(a, emptyData(), scheduler).cards).toEqual(a.cards);
    expect(mergeData(a, emptyData(), scheduler).reviews).toEqual(a.reviews);
  });

  it('прогресс: статус не откатывается, шаги складываются, пауза — по последней правке', () => {
    const base: ProgressRecord = { topicId: 't', level: 'base', status: 'in-progress', completedSteps: ['pre'], paused: false, updatedAt: 1 };
    const local = { ...emptyData(), progress: [{ ...base, status: 'mastered' as const, completedSteps: ['pre', 'read'], updatedAt: 5 }] };
    const incoming = { ...emptyData(), progress: [{ ...base, completedSteps: ['pre', 'code'], paused: true, updatedAt: 9 }] };
    const [merged] = mergeData(local, incoming, scheduler).progress;
    expect(merged).toEqual({ topicId: 't', level: 'base', status: 'mastered', completedSteps: ['code', 'pre', 'read'], paused: true, updatedAt: 9 });
  });

  it('заметки: побеждает более поздняя правка, настройки остаются от текущего устройства', () => {
    const local = { ...emptyData(), settings: [{ key: 'retention', value: 0.85 }], notes: [{ id: 'n', topicId: 't', blockId: 'b', text: 'старая', updatedAt: 1 }] };
    const incoming = { ...emptyData(), settings: [{ key: 'retention', value: 0.95 }], notes: [{ id: 'n', topicId: 't', blockId: 'b', text: 'новая', updatedAt: 2 }] };
    const merged = mergeData(local, incoming, scheduler);
    expect(merged.notes[0]?.text).toBe('новая');
    expect(merged.settings).toEqual([{ key: 'retention', value: 0.85 }]);
  });

  it('пометка «изменено» и версия контента берутся самые свежие', () => {
    const a = device('a', [{ cardId: 'c1', at: T0, correct: true, confidence: 'know' }]);
    const b = structuredClone(a);
    b.cards[0] = { ...b.cards[0]!, contentVersion: 2, changedAt: T0 + MINUTE };
    const merged = mergeData(a, b, scheduler);
    expect(merged.cards[0]?.contentVersion).toBe(2);
    expect(merged.cards[0]?.changedAt).toBe(T0 + MINUTE);
  });

  it('stateBefore пересчитывается по общей истории', () => {
    // На каждом устройстве свой первый ответ по карточке — оба «новые».
    const a = device('a', [{ cardId: 'c1', at: T0, correct: true, confidence: 'know' }]);
    const b = device('b', [{ cardId: 'c1', at: T0 + 30 * MINUTE, correct: true, confidence: 'know' }]);
    const reviews: ReviewRecord[] = mergeData(a, b, scheduler).reviews;
    expect(reviews.map((review) => review.stateBefore)).toEqual([0, 1]);
  });
});
