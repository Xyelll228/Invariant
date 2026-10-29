import { describe, expect, it } from 'vitest';
import { describeErrors, filterErrors, frequentMisconceptions, prerequisiteSuggestions } from '../../src/lib/learning/errors.ts';
import type { TopicsIndex } from '../../src/lib/learning/topics.ts';
import type { ErrorRecord } from '../../src/lib/learning/types.ts';

const index: TopicsIndex = {
  topics: [
    {
      id: 'algo.sorting.insertion',
      title: 'Сортировка вставками',
      path: 'ru/algorithms/sorting/insertion/',
      levels: [],
      skills: [{ id: 'algo.sorting.insertion.s.idea', title: 'Идея', level: 'fundament' }],
      misconceptions: {
        'algo.sorting.insertion.m.to-front': { text: 'До самого начала', blockPath: 'ru/algorithms/sorting/insertion/#b', prerequisite: null },
        'algo.sorting.insertion.m.index': {
          text: 'Путает индекс и значение',
          blockPath: null,
          prerequisite: { id: 'algo.linear.array', title: 'Массивы', path: 'ru/catalog/#algo.linear.array' },
        },
      },
      confusableWith: [],
    },
  ],
};

function error(id: string, at: number, misconception: string | null, resolved = false): ErrorRecord {
  return { id, cardId: 'algo.sorting.insertion.s.idea', misconception, at, note: '', resolved, updatedAt: at };
}

describe('журнал ошибок', () => {
  const errors = [
    error('a', 10, 'algo.sorting.insertion.m.to-front'),
    error('b', 30, 'algo.sorting.insertion.m.index'),
    error('c', 20, 'algo.sorting.insertion.m.index', true),
    error('d', 40, null),
  ];
  const views = describeErrors(errors, index);

  it('ошибки с названиями темы, навыка и заблуждения — новые сверху', () => {
    expect(views.map((view) => view.id)).toEqual(['d', 'b', 'c', 'a']);
    expect(views[1]).toMatchObject({ topicTitle: 'Сортировка вставками', skillTitle: 'Идея', misconception: { text: 'Путает индекс и значение' } });
    expect(views[0]?.misconception).toBeNull();
  });

  it('частые заблуждения: по числу ошибок, с числом неразобранных', () => {
    const frequent = frequentMisconceptions(views);
    expect(frequent.map((item) => [item.id, item.count, item.open])).toEqual([
      ['algo.sorting.insertion.m.index', 2, 1],
      ['algo.sorting.insertion.m.to-front', 1, 1],
    ]);
  });

  it('вернуться к предпосылке — когда к ней ведут хотя бы две неразобранные ошибки', () => {
    expect(prerequisiteSuggestions(views)).toEqual([]);
    const more = describeErrors([...errors, error('e', 50, 'algo.sorting.insertion.m.index')], index);
    expect(prerequisiteSuggestions(more)).toEqual([{ id: 'algo.linear.array', title: 'Массивы', path: 'ru/catalog/#algo.linear.array', count: 2 }]);
  });

  it('фильтры: тема, заблуждение, скрыть разобранные', () => {
    expect(filterErrors(views, { topicId: null, misconceptionId: null, hideResolved: true }).map((view) => view.id)).toEqual(['d', 'b', 'a']);
    expect(filterErrors(views, { topicId: null, misconceptionId: 'algo.sorting.insertion.m.index', hideResolved: false }).map((view) => view.id)).toEqual(['b', 'c']);
    expect(filterErrors(views, { topicId: 'algo.linear.array', misconceptionId: null, hideResolved: false })).toEqual([]);
  });
});
