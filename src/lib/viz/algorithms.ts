/**
 * Алгоритмы, которые умеет показывать визуализация массива. Каждый — эталон
 * темы со следом: визуализация ничего не вычисляет сама.
 */
import { code as insertionCode, insertionSort } from '../../../content/ru/algorithms/sorting/insertion-sort/reference.ts';
import type { TraceSink } from '../trace.ts';

export interface ArrayAlgorithm {
  title: string;
  code: readonly string[];
  run(input: readonly number[], trace: TraceSink): number[];
}

export const arrayAlgorithms = {
  'algo.sorting.insertion': { title: 'Сортировка вставками', code: insertionCode, run: insertionSort },
} satisfies Record<string, ArrayAlgorithm>;

export type ArrayAlgorithmId = keyof typeof arrayAlgorithms;
