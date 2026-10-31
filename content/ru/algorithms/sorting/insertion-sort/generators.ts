/**
 * Генераторы заданий темы. Задание = шаблон + параметры + зерно случайности.
 * Ответ вычисляет эталон (reference.ts), неверные варианты — «неправильные
 * алгоритмы», каждый из которых воспроизводит одно заблуждение из questions.yaml.
 */
import { countInversions } from '../../../../../src/lib/facts.ts';
import type { PreparedOption } from '../../../../../src/lib/learning/question-types.ts';
import { choiceVariant, freeVariant, type ChoiceVariant, type FreeVariant } from '../../../../../src/lib/questions/make.ts';
import type { Random } from '../../../../../src/lib/random.ts';
import { countOperations, recordTrace, replayArray } from '../../../../../src/lib/trace.ts';
import { mutants } from './mutants.ts';
import { insertionSort } from './reference.ts';

const MISCONCEPTION = {
  short: 'algo.sorting.insertion.m.one-step-short',
  extra: 'algo.sorting.insertion.m.one-step-extra',
  selection: 'algo.sorting.insertion.m.selection',
  bugEverywhere: 'algo.sorting.insertion.m.bug-everywhere',
} as const;

/** Соглашение о подсчёте сравнений — одно на все задания темы. */
const COMPARE_RULE = 'Сравнением считается проверка a[j − 1] > a[j]; проверка j > 0 сравнивает индексы и не считается.';

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

function operations(input: readonly number[]) {
  return countOperations(recordTrace((sink) => insertionSort(input, sink)).events);
}

/** Массив из n чисел от 1 до 9: повторы возможны и делают задание интереснее. */
function smallArray(random: Random, min: number, max: number): number[] {
  return Array.from({ length: random.int(min, max) }, () => random.int(1, 9));
}

/** «Сколько обменов сделает сортировка?» — ответ считает эталон. */
export function countSwaps(random: Random): FreeVariant {
  for (;;) {
    const input = smallArray(random, 5, 7);
    const { swaps } = operations(input);
    if (swaps === 0) continue;
    return freeVariant({
      prompt:
        `Сколько обменов сделает сортировка вставками на массиве ${format(input)}? ` +
        'Обмен — перестановка соседей a[j − 1] и a[j], когда a[j − 1] > a[j].',
      answers: [String(swaps)],
      normalize: 'number',
      data: { input },
    });
  }
}

/** «Сколько сравнений сделает сортировка?» — ответ считает эталон. */
export function countCompares(random: Random): FreeVariant {
  const input = smallArray(random, 4, 6);
  return freeVariant({
    prompt: `Сколько сравнений сделает код сортировки вставками на массиве ${format(input)}? ${COMPARE_RULE}`,
    answers: [String(operations(input).compares)],
    normalize: 'number',
    data: { input },
  });
}

const EXACT_INPUTS = [
  { kind: 'sorted', describe: (n: number) => `массив из ${n} различных чисел, упорядоченный по возрастанию`, make: (n: number) => Array.from({ length: n }, (_, index) => index + 1) },
  { kind: 'reversed', describe: (n: number) => `массив из ${n} различных чисел, упорядоченный по убыванию`, make: (n: number) => Array.from({ length: n }, (_, index) => n - index) },
  { kind: 'equal', describe: (n: number) => `массив из ${n} одинаковых чисел`, make: (n: number) => Array.from({ length: n }, () => 7) },
] as const;

/** Точный подсчёт на большом n: формулу нужно знать, перебрать руками не получится. */
export function exactCount(random: Random): FreeVariant {
  const n = random.int(10, 60);
  const shape = EXACT_INPUTS[random.int(0, EXACT_INPUTS.length - 1)] as (typeof EXACT_INPUTS)[number];
  const counted = random.int(0, 1) === 0 ? 'compares' : 'swaps';
  const value = operations(shape.make(n))[counted];
  return freeVariant({
    prompt:
      `Сортировка вставками упорядочивает ${shape.describe(n)}. ` +
      (counted === 'compares' ? `Сколько сравнений она сделает? ${COMPARE_RULE}` : 'Сколько обменов она сделает?'),
    answers: [String(value)],
    normalize: 'number',
    data: { n, kind: shape.kind, counted },
  });
}

/** «Сколько инверсий в массиве?» — ответ считает перебор пар. */
export function inversionsCount(random: Random): FreeVariant {
  for (;;) {
    const input = smallArray(random, 4, 6);
    const count = countInversions(input);
    if (count === 0) continue;
    return freeVariant({
      prompt: `Инверсия — пара индексов i < j, для которой a[i] > a[j]. Сколько инверсий в массиве ${format(input)}?`,
      answers: [String(count)],
      normalize: 'number',
      data: { input },
    });
  }
}

const BROKEN = mutants.filter((mutant) => mutant.code);

function isSorted(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || (values[index - 1] as number) <= value);
}

/**
 * «На каком массиве испорченная версия ошибётся?» — шаг «Сломать»: подобрать
 * тест. Ровно один из массивов ломает код; на остальных, тоже неупорядоченных,
 * он даёт верный ответ.
 */
export function breakingInput(random: Random): ChoiceVariant {
  for (;;) {
    const mutant = BROKEN[random.int(0, BROKEN.length - 1)] as (typeof BROKEN)[number];
    const fails = (input: readonly number[]) => !isSorted(mutant.sortBy(input, (value) => value));
    const candidates: number[][] = [];
    for (let attempt = 0; attempt < 400 && candidates.length < 60; attempt++) {
      const input = random.distinctInts(random.int(3, 5), 1, 9);
      if (!isSorted(input)) candidates.push(input);
    }
    const failing = candidates.find(fails);
    const passing = candidates.filter((input) => !fails(input));
    const unique = [...new Map(passing.map((input) => [format(input), input])).values()];
    if (!failing || unique.length < 3) continue;
    const options: PreparedOption[] = [
      { text: format(failing), correct: true },
      ...unique.slice(0, 3).map((input) => ({ text: format(input), correct: false, misconception: MISCONCEPTION.bugEverywhere })),
    ];
    if (new Set(options.map((option) => option.text)).size !== options.length) continue;
    return choiceVariant({
      prompt: 'В этой версии сортировки вставками одна ошибка. На каком из массивов она вернёт неупорядоченный результат?',
      code: (mutant.code as readonly string[]).join('\n'),
      options: random.shuffle(options),
      data: { mutant: mutant.id, failing },
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
