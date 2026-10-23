import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { insertionSort } from '../../content/ru/algorithms/sorting/insertion-sort/reference.ts';
import { recordTrace } from '../../src/lib/trace.ts';
import { buildFrames, expectedSwaps } from '../../src/lib/viz/array-frames.ts';
import { parseArrayInput } from '../../src/lib/viz/input.ts';
import { heightBucket } from '../../src/components/viz/ArrayBars.tsx';

function framesFor(input: number[]) {
  const { events } = recordTrace((sink) => insertionSort(input, sink));
  return buildFrames(input, events);
}

describe('кадры визуализации', () => {
  it('начинаются с исходного массива и заканчиваются упорядоченным', () => {
    const frames = framesFor([7, 3, 5, 1, 4]);
    expect(frames[0]?.values).toEqual([7, 3, 5, 1, 4]);
    expect(frames.at(-1)?.values).toEqual([1, 3, 4, 5, 7]);
    expect(frames.at(-1)?.description).toBe('Готово: массив упорядочен.');
    expect(frames.at(-1)?.regions.sorted?.length).toBe(5);
  });

  it('описывают сравнение и обмен по значениям', () => {
    const frames = framesFor([2, 1]);
    const descriptions = frames.map((frame) => frame.description);
    expect(descriptions).toContain('Сравниваем 2 и 1: 2 > 1.');
    expect(descriptions).toContain('Меняем местами 2 и 1.');
  });

  it('отметка «ключ» едет вместе с элементом при обменах', () => {
    const frames = framesFor([5, 9, 1]);
    const swapFrames = frames.filter((frame) => frame.step?.t === 'swap');
    for (const frame of swapFrames) {
      const keyId = frame.pointers.key;
      expect(keyId).toBe(2); // элемент 1 с исходным индексом 2
      const position = frame.ids.indexOf(keyId as number);
      expect(frame.values[position]).toBe(1);
    }
  });

  it('счётчики совпадают с числом событий, а номера элементов — перестановка', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: 12 }), (input) => {
        const frames = framesFor(input);
        const last = frames.at(-1);
        if (!last) return false;
        const compares = frames.filter((frame) => frame.step?.t === 'compare').length;
        const swaps = frames.filter((frame) => frame.step?.t === 'swap').length;
        return (
          last.counts.compares === compares &&
          last.counts.swaps === swaps &&
          [...last.ids].sort((a, b) => a - b).every((id, index) => id === index) &&
          last.ids.every((id, position) => input[id] === last.values[position])
        );
      }),
      { numRuns: 200, seed: 7 },
    );
  });

  it('ожидаемые обмены ручной симуляции объясняют причину', () => {
    const swaps = expectedSwaps(framesFor([3, 1, 2]));
    expect(swaps.map((swap) => [swap.i, swap.j])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(swaps[0]?.reason).toBe('Вставляем 1 — элемент с индексом 1 — в упорядоченную часть слева. Сравниваем 3 и 1: 3 > 1.');
  });
});

describe('свои данные', () => {
  it('принимает числа через запятую и пробел', () => {
    expect(parseArrayInput('5, 3 8;1')).toEqual({ ok: true, values: [5, 3, 8, 1] });
  });

  it('объясняет, что не так', () => {
    expect(parseArrayInput('5')).toEqual({ ok: false, error: 'Чисел 1, а нужно от 2 до 10.' });
    expect(parseArrayInput('5, x')).toEqual({ ok: false, error: '«x» — не целое число.' });
    expect(parseArrayInput('5, 120')).toEqual({ ok: false, error: '120 вне допустимых пределов: от 0 до 99.' });
    expect(parseArrayInput('2.5, 1')).toEqual({ ok: false, error: '«2.5» — не целое число.' });
  });
});

describe('высота столбиков', () => {
  it('ступенями по 5%, но не ниже 5%, чтобы ноль был виден', () => {
    expect(heightBucket(99, 99)).toBe(100);
    expect(heightBucket(0, 99)).toBe(5);
    expect(heightBucket(36, 99)).toBe(35);
    expect(heightBucket(5, 0)).toBe(5);
  });
});
