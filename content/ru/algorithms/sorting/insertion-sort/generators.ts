/**
 * Генераторы заданий темы. Задание = шаблон + параметры + зерно случайности.
 * Ответ вычисляет эталон (reference.ts), неверные варианты — «неправильные
 * алгоритмы», каждый из которых воспроизводит одно заблуждение из questions.yaml.
 */
import type { PreparedOption } from '../../../../../src/lib/learning/question-types.ts';
import { choiceVariant, freeVariant, type ChoiceVariant, type FreeVariant } from '../../../../../src/lib/questions/make.ts';
import type { Random } from '../../../../../src/lib/random.ts';
import { recordTrace, replayArray } from '../../../../../src/lib/trace.ts';
import { insertionSort } from './reference.ts';

const MISCONCEPTION = {
  short: 'algo.sorting.insertion.m.one-step-short',
  extra: 'algo.sorting.insertion.m.one-step-extra',
  selection: 'algo.sorting.insertion.m.selection',
} as const;

/**
 * Массив после k шагов сортировки вставками по следу эталона. Шаг — вставка
 * одного элемента; перед каждым шагом эталон проверяет условие внешнего цикла
 * (строка 2), поэтому k шагов заканчиваются перед (k + 1)-й проверкой.
 */
export function insertionStateAfter(input: readonly number[], steps: number): number[] {
  const { events } = recordTrace((sink) => insertionSort(input, sink));
  let checks = 0;
  const prefix = [];
  for (const event of events) {
    if (event.t === 'line' && event.line === 2) {
      checks++;
      if (checks === steps + 1) break;
    }
    prefix.push(event);
  }
  return replayArray(input, prefix);
}

/** «Неправильный алгоритм»: k шагов сортировки выбором вместо вставок. */
export function selectionStateAfter(input: readonly number[], steps: number): number[] {
  const a = [...input];
  for (let step = 0; step < steps && step < a.length - 1; step++) {
    let min = step;
    for (let i = step + 1; i < a.length; i++) if ((a[i] as number) < (a[min] as number)) min = i;
    [a[step], a[min]] = [a[min] as number, a[step] as number];
  }
  return a;
}

function format(values: readonly number[]): string {
  return `[${values.join(', ')}]`;
}

/** «Каким станет массив после k шагов?» — для уровня Фундамент. */
export function afterKSteps(random: Random): ChoiceVariant {
  for (;;) {
    const n = random.int(6, 8);
    const input = random.distinctInts(n, 1, 99);
    const k = random.int(1, n - 2);
    const options: PreparedOption[] = [
      { text: format(insertionStateAfter(input, k)), correct: true },
      { text: format(insertionStateAfter(input, k - 1)), correct: false, misconception: MISCONCEPTION.short },
      { text: format(insertionStateAfter(input, k + 1)), correct: false, misconception: MISCONCEPTION.extra },
      { text: format(selectionStateAfter(input, k)), correct: false, misconception: MISCONCEPTION.selection },
    ];
    // Все варианты должны различаться, иначе данные генерируются заново.
    if (new Set(options.map((option) => option.text)).size !== options.length) continue;
    return choiceVariant({
      prompt:
        `Сортировка вставками упорядочивает массив ${format(input)} по возрастанию. ` +
        'Шаг — вставка одного элемента в уже упорядоченную левую часть; первым шагом ' +
        `вставляется элемент с индексом 1. Каким станет массив после ${k} ${stepsWord(k)}?`,
      options: random.shuffle(options),
      data: { input, k },
    });
  }
}

/**
 * «Каким станет массив после вставки одного элемента?» — свободный ввод.
 * Левая часть уже упорядочена, поэтому первые i − 1 шагов ничего не меняют,
 * а i-й шаг вставляет элемент с индексом i: ответ — состояние после i шагов эталона.
 */
export function insertOne(random: Random): FreeVariant {
  for (;;) {
    const n = random.int(5, 7);
    const values = random.distinctInts(n, 1, 99);
    const i = random.int(2, n - 1);
    const input = [...values.slice(0, i).sort((a, b) => a - b), ...values.slice(i)];
    // Вставляемый элемент должен сдвинуться хотя бы на одну позицию.
    if ((input[i] as number) > (input[i - 1] as number)) continue;
    const answer = insertionStateAfter(input, i);
    return freeVariant({
      prompt:
        `В массиве ${format(input)} левая часть до индекса ${i - 1} включительно уже упорядочена. ` +
        `Сортировка вставками вставляет в неё элемент ${input[i]} с индексом ${i}. Каким станет массив после этой вставки?`,
      answers: [format(answer)],
      normalize: 'list',
      data: { input, i },
    });
  }
}

function stepsWord(k: number): string {
  const lastTwo = k % 100;
  const last = k % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'шагов';
  if (last === 1) return 'шага';
  return 'шагов';
}
