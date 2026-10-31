/**
 * Эксперимент удвоения (ТЗ, «Качество» и шаг «Измерить»): число операций
 * эталона на n, 2n, 4n… для лучшего, среднего и худшего входа. Отношение
 * соседних замеров ≈ 4 — n², ≈ 2 — n, чуть больше 2 — n log n. Одни и те же
 * функции считают таблицу на странице темы и проверку npm run check:code.
 */
import type { ComplexityClass, InputKind } from '../content/schema.ts';
import { createRandom, type Random } from './random.ts';
import { countOperations, recordTrace, type TraceSink } from './trace.ts';

export const DOUBLING_SIZES = [128, 256, 512, 1024] as const;
/** Сколько случайных входов усредняется для среднего случая. */
export const RANDOM_REPEATS = 5;

export const INPUT_TITLES: Record<InputKind, string> = {
  sorted: 'массив уже упорядочен по возрастанию',
  reversed: 'массив упорядочен по убыванию',
  equal: 'все элементы равны',
  random: `случайная перестановка (среднее по ${RANDOM_REPEATS} запускам)`,
};

/** Входные данные размера n. */
export function doublingInput(kind: InputKind, n: number, random: Random): number[] {
  switch (kind) {
    case 'sorted':
      return Array.from({ length: n }, (_, index) => index);
    case 'reversed':
      return Array.from({ length: n }, (_, index) => n - index);
    case 'equal':
      return Array.from({ length: n }, () => 7);
    case 'random':
      return random.shuffle(Array.from({ length: n }, (_, index) => index));
  }
}

/** Значение функции роста класса сложности в точке n. */
export function complexityGrowth(complexity: ComplexityClass, n: number): number {
  switch (complexity) {
    case '1':
      return 1;
    case 'log n':
      return Math.log2(n);
    case 'n':
      return n;
    case 'n log n':
      return n * Math.log2(n);
    case 'n^2':
      return n * n;
    case 'n^3':
      return n ** 3;
    case '2^n':
      return 2 ** Math.min(n, 1000);
  }
}

/** Во сколько раз должна вырасти функция класса при переходе от n к 2n. */
export function expectedRatio(complexity: ComplexityClass, n: number): number {
  return complexityGrowth(complexity, 2 * n) / complexityGrowth(complexity, n);
}

export interface DoublingRow {
  n: number;
  compares: number;
  swaps: number;
  /** Записи одного элемента: a[j] = a[j − 1], a[j] = key. */
  sets: number;
  /** Сравнения, обмены и записи вместе. */
  operations: number;
  /** Во сколько раз больше, чем на предыдущем n; у первой строки — null. */
  ratio: number | null;
}

type SortNumbers = (input: readonly number[], trace?: TraceSink) => unknown;

/** Замеры эталона: для случайных данных — среднее по нескольким зёрнам, всё воспроизводимо. */
export function measureDoubling(sort: SortNumbers, kind: InputKind, sizes: readonly number[] = DOUBLING_SIZES): DoublingRow[] {
  const rows: DoublingRow[] = [];
  for (const n of sizes) {
    const repeats = kind === 'random' ? RANDOM_REPEATS : 1;
    let compares = 0;
    let swaps = 0;
    let sets = 0;
    let operations = 0;
    for (let seed = 1; seed <= repeats; seed++) {
      const input = doublingInput(kind, n, createRandom(seed * 7919 + n));
      const counts = countOperations(recordTrace((sink) => sort(input, sink)).events);
      compares += counts.compares;
      swaps += counts.swaps;
      sets += counts.sets;
      operations += counts.total;
    }
    const previous = rows[rows.length - 1];
    const row = { n, compares: compares / repeats, swaps: swaps / repeats, sets: sets / repeats, operations: operations / repeats };
    rows.push({ ...row, ratio: previous ? (previous.operations === 0 ? null : row.operations / previous.operations) : null });
  }
  return rows;
}
