/**
 * Эталон: сортировка вставками обменами. Из её следа строятся визуализация,
 * ручная симуляция, вопросы и счётчики операций. Версии на C++ и Python
 * (impl.cpp, impl.py) проверяются на тех же данных, что и эта.
 *
 * Варианты для уровня «Глубина» — вставка сдвигами и бинарные вставки
 * (variantCode, impl.shift.*, impl.binary.*) — проверяются так же.
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

/** Код вариантов, который видит ученик на уровне «Глубина». */
export const variantCode = {
  shift: [
    'function insertionSortShift(a) {',
    '  for (let i = 1; i < a.length; i++) {',
    '    const key = a[i];',
    '    let j = i;',
    '    while (j > 0 && a[j - 1] > key) {',
    '      a[j] = a[j - 1];',
    '      j--;',
    '    }',
    '    a[j] = key;',
    '  }',
    '  return a;',
    '}',
  ],
  binary: [
    'function binaryInsertionSort(a) {',
    '  for (let i = 1; i < a.length; i++) {',
    '    const key = a[i];',
    '    // Первое место в a[0..i - 1], где элемент больше key: равные остаются левее.',
    '    let lo = 0;',
    '    let hi = i;',
    '    while (lo < hi) {',
    '      const mid = lo + Math.floor((hi - lo) / 2);',
    '      if (a[mid] > key) hi = mid;',
    '      else lo = mid + 1;',
    '    }',
    '    for (let j = i; j > lo; j--) a[j] = a[j - 1];',
    '    a[lo] = key;',
    '  }',
    '  return a;',
    '}',
  ],
} as const satisfies Record<string, readonly string[]>;

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

/**
 * Вставка сдвигами: вставляемый элемент хранится в key, большие элементы
 * сдвигаются вправо записью a[j] = a[j − 1], key записывается один раз.
 * В следе сравнение a[j − 1] с key отмечено парой (j − 1, j): j — место,
 * которое освобождается для key.
 */
export function insertionSortShiftBy<T>(input: readonly T[], key: (item: T) => number, trace: TraceSink = noTrace): T[] {
  const a = [...input];
  for (let i = 1; i < a.length; i++) {
    const item = a[i] as T;
    let j = i;
    while (j > 0) {
      trace({ t: 'compare', i: j - 1, j });
      if (!(key(a[j - 1] as T) > key(item))) break;
      a[j] = a[j - 1] as T;
      trace({ t: 'set', i: j, value: key(a[j] as T) });
      j--;
    }
    a[j] = item;
    trace({ t: 'set', i: j, value: key(item) });
  }
  return a;
}

export function insertionSortShift(input: readonly number[], trace: TraceSink = noTrace): number[] {
  return insertionSortShiftBy(input, (value) => value, trace);
}

/**
 * Бинарные вставки: место для key ищется бинарным поиском в упорядоченной
 * части — первая позиция, где элемент больше key. Поэтому равные элементы
 * остаются левее, и сортировка устойчива. Сдвиги — те же, что у вставки сдвигами.
 */
export function binaryInsertionSortBy<T>(input: readonly T[], key: (item: T) => number, trace: TraceSink = noTrace): T[] {
  const a = [...input];
  for (let i = 1; i < a.length; i++) {
    const item = a[i] as T;
    let lo = 0;
    let hi = i;
    while (lo < hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      trace({ t: 'compare', i: mid, j: i });
      if (key(a[mid] as T) > key(item)) hi = mid;
      else lo = mid + 1;
    }
    for (let j = i; j > lo; j--) {
      a[j] = a[j - 1] as T;
      trace({ t: 'set', i: j, value: key(a[j] as T) });
    }
    a[lo] = item;
    trace({ t: 'set', i: lo, value: key(item) });
  }
  return a;
}

export function binaryInsertionSort(input: readonly number[], trace: TraceSink = noTrace): number[] {
  return binaryInsertionSortBy(input, (value) => value, trace);
}
