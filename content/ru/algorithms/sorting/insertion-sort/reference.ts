/**
 * Эталон: сортировка вставками обменами. Из её следа строятся визуализация,
 * ручная симуляция, вопросы и счётчики операций. Версии на C++ и Python
 * (impl.cpp, impl.py) проверяются на тех же данных, что и эта.
 */
import { noTrace, type TraceSink } from '../../../../../src/lib/trace.ts';

/** Код, который видит ученик. Номера строк — для событий line (с 1). */
export const code = [
  'function insertionSort(a) {',
  '  for (let i = 1; i < a.length; i++) {',
  '    let j = i;',
  '    while (j > 0 && a[j - 1] > a[j]) {',
  '      [a[j - 1], a[j]] = [a[j], a[j - 1]];',
  '      j--;',
  '    }',
  '  }',
  '  return a;',
  '}',
] as const;

/** Сортирует копию массива по ключу; равные ключи сохраняют порядок. */
export function insertionSortBy<T>(input: readonly T[], key: (item: T) => number, trace: TraceSink = noTrace): T[] {
  const a = [...input];
  let i = 1;
  for (;;) {
    trace({ t: 'line', line: 2 });
    if (!(i < a.length)) break;
    trace({ t: 'region', name: 'sorted', from: 0, to: i });
    trace({ t: 'pointer', name: 'key', i });
    trace({ t: 'note', text: `Вставляем ${key(a[i] as T)} — элемент с индексом ${i} — в упорядоченную часть слева.` });
    trace({ t: 'line', line: 3 });
    let j = i;
    for (;;) {
      trace({ t: 'line', line: 4 });
      if (!(j > 0)) break;
      trace({ t: 'compare', i: j - 1, j });
      if (!(key(a[j - 1] as T) > key(a[j] as T))) break;
      trace({ t: 'line', line: 5 });
      [a[j - 1], a[j]] = [a[j] as T, a[j - 1] as T];
      trace({ t: 'swap', i: j - 1, j });
      trace({ t: 'line', line: 6 });
      j--;
    }
    i++;
  }
  trace({ t: 'region', name: 'sorted', from: 0, to: a.length });
  trace({ t: 'pointer', name: 'key', i: null });
  trace({ t: 'line', line: 9 });
  trace({ t: 'note', text: 'Готово: массив упорядочен.' });
  return a;
}

/** Сортирует копию массива чисел по возрастанию. */
export function insertionSort(input: readonly number[], trace: TraceSink = noTrace): number[] {
  return insertionSortBy(input, (value) => value, trace);
}
