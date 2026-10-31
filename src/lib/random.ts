/**
 * Генератор случайных чисел с зерном. Одно и то же зерно всегда даёт один и
 * тот же вариант задания: зерно хранится в истории, и любой вариант можно
 * восстановить, в том числе для сообщения об ошибке.
 */
export interface Random {
  /** Число в [0, 1). */
  next(): number;
  /** Целое в [min, max] включительно. */
  int(min: number, max: number): number;
  /** Перемешанная копия массива (Фишер — Йетс). */
  shuffle<T>(items: readonly T[]): T[];
  /** k разных целых из [min, max]. */
  distinctInts(count: number, min: number, max: number): number[];
}

/** Mulberry32: быстрый 32-битный генератор, достаточный для вариантов заданий. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new Error(`Неверный диапазон [${min}, ${max}]`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };
  return {
    next,
    int,
    shuffle<T>(items: readonly T[]): T[] {
      const result = [...items];
      for (let i = result.length - 1; i > 0; i--) {
        const j = int(0, i);
        [result[i], result[j]] = [result[j] as T, result[i] as T];
      }
      return result;
    },
    distinctInts(count: number, min: number, max: number): number[] {
      if (count > max - min + 1) throw new Error(`Нельзя выбрать ${count} разных чисел из [${min}, ${max}]`);
      const chosen = new Set<number>();
      while (chosen.size < count) chosen.add(int(min, max));
      return [...chosen];
    },
  };
}

/** Случайное зерно варианта задания. */
export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
  }
  return Math.floor(Math.random() * 2 ** 32);
}
