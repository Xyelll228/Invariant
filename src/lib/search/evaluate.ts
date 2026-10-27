/**
 * Оценка поиска на контрольных запросах: на каком месте первый верный ответ.
 * Попадание — верный ответ в первых трёх результатах своей группы (критерий
 * приёмки из ТЗ; темы показываются первыми).
 */
import type { ControlQuery, QueryKind } from './control-queries.ts';

export const TOP = 3;

export interface QueryOutcome {
  query: string;
  kind: QueryKind;
  /** Место первого верного ответа (с 1) или null, если его нет в выдаче. */
  rank: number | null;
  /** Первые результаты — для разбора промахов. */
  top: string[];
}

export interface Evaluation {
  outcomes: QueryOutcome[];
  hits: number;
  total: number;
}

export interface RankedItem {
  title: string;
  kind: 'topic' | 'term' | 'block';
}

/** search возвращает выдачу в порядке показа; место считается внутри группы ответа. */
export function evaluate(queries: readonly ControlQuery[], search: (query: string) => readonly RankedItem[]): Evaluation {
  const outcomes = queries.map((item) => {
    const group = item.group ?? 'topic';
    const titles = search(item.query)
      .filter((result) => result.kind === group)
      .map((result) => result.title);
    const expected = new Set(item.expect.map((title) => title.toLocaleLowerCase('ru-RU')));
    const index = titles.findIndex((title) => expected.has(title.toLocaleLowerCase('ru-RU')));
    return { query: item.query, kind: item.kind, rank: index === -1 ? null : index + 1, top: titles.slice(0, TOP) };
  });
  return { outcomes, hits: outcomes.filter((item) => item.rank !== null && item.rank <= TOP).length, total: outcomes.length };
}
