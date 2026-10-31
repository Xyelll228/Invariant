import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import { createRandom } from '../../src/lib/random.ts';
import type { PreparedQuestion } from '../../src/lib/learning/question-types.ts';
import { newCard } from '../../src/lib/learning/scheduler.ts';
import { availableAt, confusableGroups, interleave, lastQuestionOf, nextDue, pickQuestion, sessionOrder } from '../../src/lib/learning/session.ts';
import type { CardRecord, ReviewRecord } from '../../src/lib/learning/types.ts';

const at = (day: number, hour: number) => new Date(2026, 10, day, hour).getTime();

function card(cardId: string, topicId: string, extra: Partial<CardRecord['fsrs']> = {}): CardRecord {
  const base = newCard({ cardId, topicId, source: 'content', createdAt: 0 });
  return { ...base, fsrs: { ...base.fsrs, state: State.Review, last_review: 0, ...extra } };
}

function question(id: string, skill: string, format: 'choice' | 'generated', role: 'pre' | 'practice' | 'check' = 'practice'): PreparedQuestion {
  const base = { id, version: 1, level: 'fundament' as const, role, step: role === 'practice' ? 1 : null, block: null, skill, type: 'choice', hints: [], explanation: null };
  return format === 'generated'
    ? { ...base, format: 'generated', generator: 'g' }
    : { ...base, format: 'choice', prompt: '', code: null, language: 'js', multiple: false, options: [] };
}

describe('чередование тем в повторении', () => {
  const topics = [
    { id: 'algo.sorting.insertion', confusableWith: ['algo.sorting.selection'] },
    { id: 'algo.sorting.selection', confusableWith: [] },
    { id: 'algo.linear.array', confusableWith: [] },
  ];

  it('похожие темы — одна группа, даже если связь указана только у одной', () => {
    const groups = confusableGroups(topics);
    expect(groups.get('algo.sorting.insertion')).toBe(groups.get('algo.sorting.selection'));
    expect(groups.get('algo.linear.array')).not.toBe(groups.get('algo.sorting.insertion'));
  });

  it('карточки похожих тем стоят рядом, порядок внутри темы сохраняется, ничего не теряется', () => {
    const groups = confusableGroups(topics);
    const cards = [
      card('ins.1', 'algo.sorting.insertion'),
      card('ins.2', 'algo.sorting.insertion'),
      card('sel.1', 'algo.sorting.selection'),
      card('arr.1', 'algo.linear.array'),
      card('arr.2', 'algo.linear.array'),
    ];
    for (let seed = 1; seed <= 20; seed++) {
      const order = interleave(cards, groups, createRandom(seed)).map((item) => item.cardId);
      expect([...order].sort()).toEqual(cards.map((item) => item.cardId).sort());
      // Вставки и выбор — соседи.
      const ins = order.indexOf('ins.1');
      const sel = order.indexOf('sel.1');
      expect(Math.abs(ins - sel)).toBe(1);
      // Внутри темы — исходный порядок (срочность).
      expect(order.indexOf('ins.1')).toBeLessThan(order.indexOf('ins.2'));
      expect(order.indexOf('arr.1')).toBeLessThan(order.indexOf('arr.2'));
    }
  });

  it('разные темы перемешаны: две карточки одной темы не идут подряд, пока есть другие', () => {
    const groups = confusableGroups([
      { id: 'a', confusableWith: [] },
      { id: 'b', confusableWith: [] },
    ]);
    const cards = [card('a.1', 'a'), card('a.2', 'a'), card('b.1', 'b'), card('b.2', 'b')];
    const order = interleave(cards, groups, createRandom(3)).map((item) => item.topicId);
    for (let index = 1; index < order.length; index++) expect(order[index]).not.toBe(order[index - 1]);
  });

  it('сначала шаги изучения, затем повторения, затем новые навыки', () => {
    const groups = confusableGroups(topics);
    const learning = [card('l', 'algo.linear.array')];
    const reviews = [card('r', 'algo.sorting.insertion')];
    const fresh = [card('n', 'algo.sorting.selection')];
    expect(sessionOrder({ learning, reviews, fresh }, groups, createRandom(1)).map((item) => item.cardId)).toEqual(['l', 'r', 'n']);
  });
});

describe('задание для навыка', () => {
  const questions = [
    question('t.q.pre', 's', 'choice', 'pre'),
    question('t.q.a', 's', 'choice'),
    question('t.q.b', 's', 'choice', 'check'),
    question('t.q.other', 'other', 'generated'),
  ];

  it('предвопросы не берутся; из готовых — не то, что в прошлый раз', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const picked = pickQuestion(questions, 's', 't.q.a', createRandom(seed));
      expect(picked?.id).toBe('t.q.b');
    }
  });

  it('задание генератора лучше: у него новые данные', () => {
    const withGenerator = [...questions, question('t.q.gen', 's', 'generated')];
    expect(pickQuestion(withGenerator, 's', null, createRandom(5))?.id).toBe('t.q.gen');
    // Единственное задание повторяется, если другого нет.
    expect(pickQuestion(withGenerator, 'other', 't.q.other', createRandom(5))?.id).toBe('t.q.other');
    expect(pickQuestion(withGenerator, 'нет такого', null, createRandom(5))).toBeNull();
  });

  it('последнее задание навыка — по истории ответов', () => {
    const review = (id: string, time: number, questionId?: string): ReviewRecord => ({
      id,
      cardId: 's',
      at: time,
      correct: true,
      confidence: 'know',
      usedHint: false,
      tooEasy: false,
      rating: 3,
      stateBefore: State.Review,
      seed: null,
      contentVersion: 1,
      misconception: null,
      mode: 'review',
      ...(questionId ? { questionId } : {}),
    });
    expect(lastQuestionOf('s', [review('1', 10, 't.q.a'), review('2', 30, 't.q.b'), review('3', 20, 't.q.a')])).toBe('t.q.b');
    expect(lastQuestionOf('s', [review('1', 10)])).toBeNull();
  });
});

describe('следующее повторение', () => {
  it('интервал в днях — с начала учебного дня (4:00), короткий шаг — с точной минуты', () => {
    const long = card('a', 't', { due: at(5, 15), scheduled_days: 3 });
    const short = card('b', 't', { due: at(2, 22), scheduled_days: 0, state: State.Learning });
    expect(availableAt(long)).toBe(at(5, 4));
    expect(availableAt(short)).toBe(at(2, 22));
    expect(nextDue([long, short], new Set())).toBe(at(2, 22));
    // Тема на паузе и новые карточки не считаются.
    expect(nextDue([long, short], new Set(['t']))).toBeNull();
    expect(nextDue([{ ...long, fsrs: { ...long.fsrs, last_review: null } }], new Set())).toBeNull();
  });
});
