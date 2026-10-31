import type { Locator, Page } from '@playwright/test';
import { afterKSteps, insertOne } from '../../content/ru/algorithms/sorting/insertion-sort/generators.ts';
import { insertionSort } from '../../content/ru/algorithms/sorting/insertion-sort/reference.ts';
import { createRandom } from '../../src/lib/random.ts';
import { recordTrace } from '../../src/lib/trace.ts';
import { buildFrames, expectedSwaps } from '../../src/lib/viz/array-frames.ts';
import { expect } from './fixtures.ts';

/**
 * Помощники сквозных тестов прохождения темы-образца «Сортировка вставками»:
 * найти задание, дождаться острова, ответить верно по id задания и зерну варианта.
 */

export const LEVEL = 'ru/algorithms/sorting/insertion/';
export const Q = 'algo.sorting.insertion.q.';

export function question(page: Page, id: string): Locator {
  return page.locator(`section[data-question="${Q}${id}"]`);
}

/** Задание ожило: остров прокручен в видимую часть и прошёл гидратацию. */
export async function ready(item: Locator): Promise<Locator> {
  await item.scrollIntoViewIfNeeded();
  await expect(item.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr', /.*/);
  return item;
}

/** Разбор ответа под заданием. */
export function verdict(item: Locator): Locator {
  return item.locator('.question__feedback');
}

export async function seedOf(item: Locator): Promise<number> {
  await expect(item).toHaveAttribute('data-seed', /\d+/);
  return Number(await item.getAttribute('data-seed'));
}

export async function confident(item: Locator, label: 'знаю' | 'сомневаюсь' | 'наугад' = 'знаю'): Promise<void> {
  await item.getByRole('radio', { name: label, exact: true }).check();
}

export async function submit(item: Locator): Promise<void> {
  await item.getByRole('button', { name: /^(Проверить|Сдать решение)$/ }).click();
}

export const ASCENDING = [
  ['function insertionSort(a) {', 0],
  ['for (let i = 1; i < a.length; i++) {', 1],
  ['let j = i;', 2],
  ['while (j > 0 && a[j - 1] > a[j]) {', 2],
  ['[a[j - 1], a[j]] = [a[j], a[j - 1]];', 3],
  ['j--;', 3],
  ['}', 2],
  ['}', 1],
  ['return a;', 1],
  ['}', 0],
] as const;

export const DESCENDING = ASCENDING.map(([text, indent]) => [
  text.replace('insertionSort', 'insertionSortDesc').replace('a[j - 1] > a[j]', 'a[j - 1] < a[j]'),
  indent,
]) as unknown as typeof ASCENDING;

export async function assemble(item: Locator, lines: typeof ASCENDING): Promise<void> {
  for (const [text] of lines) {
    const label = text.length > 40 ? `${text.slice(0, 39)}…` : text;
    await item.getByRole('button', { name: `Добавить в ответ: ${label}`, exact: true }).first().click();
  }
  const placed = item.locator('ol.order__list > li');
  for (let index = 0; index < lines.length; index++) {
    const indent = lines[index]?.[1] ?? 0;
    for (let step = 0; step < indent; step++) await placed.nth(index).getByRole('button', { name: /^Увеличить отступ/ }).click();
  }
}

/** Решает задание уровня «Фундамент» верно — по id и зерну варианта. */
export async function solve(item: Locator, label: 'знаю' | 'сомневаюсь' = 'знаю'): Promise<void> {
  await ready(item);
  const id = ((await item.getAttribute('data-question')) ?? '').replace(Q, '');
  if (id.endsWith('after-k-steps') || id === 'check-after-k') {
    const variant = afterKSteps(createRandom(await seedOf(item)));
    const correct = variant.options.find((option) => option.correct);
    await item.getByRole('radio', { name: correct?.text ?? '', exact: true }).check();
  } else if (id === 'insert-one' || id === 'check-insert') {
    const variant = insertOne(createRandom(await seedOf(item)));
    await item.getByRole('textbox', { name: 'Ваш ответ' }).fill(variant.answers[0] ?? '');
  } else if (id === 'idea-next') {
    await item.getByRole('radio', { name: /Первый элемент правой части/ }).check();
  } else if (id === 'idea-stop') {
    await item.getByRole('radio', { name: /Когда сосед слева не больше него/ }).check();
  } else if (id === 'check-idea') {
    await item.getByRole('radio', { name: 'Первые четыре элемента — между собой', exact: true }).check();
  } else if (id === 'assemble') {
    await assemble(item, ASCENDING);
  } else if (id === 'check-assemble-desc') {
    await assemble(item, DESCENDING);
  } else if (id === 'check-explain') {
    await item.getByRole('textbox', { name: 'Ваше объяснение' }).fill('Вначале упорядочен один элемент, каждый шаг добавляет к упорядоченной части ещё один.');
    await confident(item, label);
    await item.getByRole('button', { name: 'Сравнить с эталоном' }).click();
    await item.getByRole('button', { name: 'Моё объяснение верное' }).click();
    return;
  } else if (id === 'simulate') {
    const input = [6, 3, 9, 2, 5];
    const swaps = expectedSwaps(buildFrames(input, recordTrace((sink) => insertionSort(input, sink)).events));
    const bars = item.locator('.bars button');
    for (const swap of swaps) {
      await bars.nth(swap.i).click();
      await bars.nth(swap.j).click();
    }
    return;
  } else {
    throw new Error(`не знаю, как решить ${id}`);
  }
  await confident(item, label);
  await submit(item);
}

/** Отвечает на задание генератора уровня «Фундамент» заведомо неверно — по id и зерну варианта. */
export async function answerWrong(item: Locator, label: 'знаю' | 'сомневаюсь' = 'сомневаюсь'): Promise<void> {
  await ready(item);
  const id = ((await item.getAttribute('data-question')) ?? '').replace(Q, '');
  if (id.endsWith('after-k-steps') || id === 'check-after-k') {
    const variant = afterKSteps(createRandom(await seedOf(item)));
    const wrong = variant.options.find((option) => !option.correct);
    await item.getByRole('radio', { name: wrong?.text ?? '', exact: true }).check();
  } else if (id === 'insert-one' || id === 'check-insert') {
    await item.getByRole('textbox', { name: 'Ваш ответ' }).fill('[0]');
  } else {
    throw new Error(`не знаю, как ошибиться в ${id}`);
  }
  await confident(item, label);
  await submit(item);
}
