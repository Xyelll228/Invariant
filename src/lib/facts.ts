/**
 * Утверждения из текста темы, которые проверяет код (файл facts.ts темы).
 * Так проверяется то, что можно вычислить: «число обменов равно числу
 * инверсий», «в среднем по всем перестановкам обменов n(n − 1)/4» и т. п.
 * Запускает их npm run check:code (tests/content/code.test.ts).
 */
export interface TopicFact {
  /** Утверждение так, как оно сказано в тексте темы. */
  claim: string;
  /** Проверка на одном массиве: на общих тестовых данных и на случайных массивах с повторами. */
  holds?: (input: readonly number[]) => boolean;
  /** Проверка без входных данных: перебор всех случаев или пример. */
  check?: () => boolean;
}

/** Число инверсий: пар i < j, для которых a[i] > a[j]. Перебором — эталон для проверок. */
export function countInversions(input: readonly number[]): number {
  let count = 0;
  for (let i = 0; i < input.length; i++) {
    for (let j = i + 1; j < input.length; j++) if ((input[i] as number) > (input[j] as number)) count++;
  }
  return count;
}

/** Все перестановки массива — для перебора на маленьких n. */
export function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const result: T[][] = [];
  items.forEach((item, index) => {
    for (const rest of permutations([...items.slice(0, index), ...items.slice(index + 1)])) result.push([item, ...rest]);
  });
  return result;
}
