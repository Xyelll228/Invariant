/**
 * Утверждения из текстов темы, которые проверяет код (npm run check:code).
 * Формулировки — те же, что на страницах уровней «База» и «Глубина».
 */
import { countInversions, permutations, type TopicFact } from '../../../../../src/lib/facts.ts';
import { countOperations, recordTrace, type TraceSink } from '../../../../../src/lib/trace.ts';
import { binaryInsertionSort, insertionSort, insertionSortShift } from './reference.ts';

function counts(sort: (input: readonly number[], trace?: TraceSink) => number[], input: readonly number[]) {
  return countOperations(recordTrace((sink) => sort(input, sink)).events);
}

/** Сколько элементов при вставке дошли до самого начала: строго меньше всех элементов левее. */
function reachedStart(input: readonly number[]): number {
  let count = 0;
  for (let i = 1; i < input.length; i++) if (input.slice(0, i).every((value) => (input[i] as number) < value)) count++;
  return count;
}

const sizes = Array.from({ length: 40 }, (_, index) => index + 1);
const ascending = (n: number) => Array.from({ length: n }, (_, index) => index);
const descending = (n: number) => Array.from({ length: n }, (_, index) => n - index);

/** Бинарные вставки с a[mid] >= key вместо a[mid] > key: порядок записей по ключу. */
function binaryWithGreaterOrEqual<T>(input: readonly T[], key: (item: T) => number): T[] {
  const a = [...input];
  for (let i = 1; i < a.length; i++) {
    const item = a[i] as T;
    let lo = 0;
    let hi = i;
    while (lo < hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      if (key(a[mid] as T) >= key(item)) hi = mid;
      else lo = mid + 1;
    }
    for (let j = i; j > lo; j--) a[j] = a[j - 1] as T;
    a[lo] = item;
  }
  return a;
}

export const facts: TopicFact[] = [
  {
    claim: 'Каждый обмен соседей a[j − 1] > a[j] уменьшает число инверсий ровно на один.',
    holds: (input) =>
      input.every((_, j) => {
        if (j === 0 || !((input[j - 1] as number) > (input[j] as number))) return true;
        const swapped = [...input];
        [swapped[j - 1], swapped[j]] = [swapped[j] as number, swapped[j - 1] as number];
        return countInversions(swapped) === countInversions(input) - 1;
      }),
  },
  {
    claim: 'Число обменов равно числу инверсий исходного массива.',
    holds: (input) => counts(insertionSort, input).swaps === countInversions(input),
  },
  {
    claim: 'Сравнений столько же, сколько обменов, плюс n − 1, минус число элементов, которые при вставке дошли до самого начала массива.',
    holds: (input) => {
      const { compares, swaps } = counts(insertionSort, input);
      return input.length === 0 ? compares === 0 : compares === swaps + (input.length - 1) - reachedStart(input);
    },
  },
  {
    claim: 'На упорядоченном по возрастанию массиве — n − 1 сравнений и ни одного обмена.',
    check: () => sizes.every((n) => {
      const { compares, swaps } = counts(insertionSort, ascending(n));
      return compares === n - 1 && swaps === 0;
    }),
  },
  {
    claim: 'Если все элементы равны, сравнений тоже n − 1, а обменов нет.',
    check: () => sizes.every((n) => {
      const { compares, swaps } = counts(insertionSort, Array.from({ length: n }, () => 5));
      return compares === n - 1 && swaps === 0;
    }),
  },
  {
    claim: 'На массиве из n различных элементов, упорядоченном по убыванию, — n(n − 1)/2 сравнений и столько же обменов.',
    check: () => sizes.every((n) => {
      const { compares, swaps } = counts(insertionSort, descending(n));
      return compares === (n * (n - 1)) / 2 && swaps === (n * (n - 1)) / 2;
    }),
  },
  {
    claim: 'В среднем по всем перестановкам n различных элементов обменов n(n − 1)/4.',
    check: () =>
      [1, 2, 3, 4, 5, 6, 7].every((n) => {
        const all = permutations(ascending(n));
        const total = all.reduce((sum, permutation) => sum + counts(insertionSort, permutation).swaps, 0);
        return total / all.length === (n * (n - 1)) / 4;
      }),
  },
  {
    claim: 'Вставка сдвигами делает те же сравнения, что вставка обменами, а записей в массив — число инверсий плюс n − 1.',
    holds: (input) => {
      if (input.length === 0) return true;
      const swapVersion = counts(insertionSort, input);
      const shiftVersion = counts(insertionSortShift, input);
      return shiftVersion.compares === swapVersion.compares && shiftVersion.sets === countInversions(input) + input.length - 1;
    },
  },
  {
    claim: 'При вставке элемента с индексом i бинарный поиск делает не больше ⌈log₂(i + 1)⌉ сравнений.',
    holds: (input) => {
      const limit = input.slice(1).reduce((sum, _, index) => sum + Math.ceil(Math.log2(index + 2)), 0);
      return counts(binaryInsertionSort, input).compares <= limit;
    },
  },
  {
    claim: 'Бинарные вставки делают столько же записей в массив, сколько вставка сдвигами.',
    holds: (input) => counts(binaryInsertionSort, input).sets === counts(insertionSortShift, input).sets,
  },
  {
    claim: 'Если в бинарных вставках заменить a[mid] > key на a[mid] >= key, массив по-прежнему упорядочится, но сортировка станет неустойчивой.',
    holds: (input) => JSON.stringify(binaryWithGreaterOrEqual(input, (value) => value)) === JSON.stringify([...input].sort((a, b) => a - b)),
    check: () => {
      const records = [
        { key: 1, name: 'первый' },
        { key: 1, name: 'второй' },
      ];
      return binaryWithGreaterOrEqual(records, (record) => record.key)[0]?.name === 'второй';
    },
  },
];
