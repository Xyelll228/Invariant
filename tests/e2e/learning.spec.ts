import type { Locator, Page } from '@playwright/test';
import { afterKSteps, insertOne } from '../../content/ru/algorithms/sorting/insertion-sort/generators.ts';
import { insertionSort } from '../../content/ru/algorithms/sorting/insertion-sort/reference.ts';
import { createRandom } from '../../src/lib/random.ts';
import { recordTrace } from '../../src/lib/trace.ts';
import { buildFrames, expectedSwaps } from '../../src/lib/viz/array-frames.ts';
import { replaceEditorText } from './editor.ts';
import { expect, test } from './fixtures.ts';

/**
 * Прохождение уровня темы (ТЗ, «Цикл изучения темы»; критерий приёмки «Полный
 * цикл темы работает от предвопросов до повторения»): предвопросы, задания
 * шагов с уверенностью и разбором ошибок, итоговая проверка, на следующий
 * учебный день — отложенная проверка и состояние «освоен».
 *
 * Сборка для сквозных тестов показывает черновики (PUBLIC_SHOW_DRAFTS=1, как в CI).
 */

const LEVEL = 'ru/algorithms/sorting/insertion/';
const Q = 'algo.sorting.insertion.q.';

function question(page: Page, id: string): Locator {
  return page.locator(`section[data-question="${Q}${id}"]`);
}

/** Задание ожило: остров прокручен в видимую часть и прошёл гидратацию. */
async function ready(item: Locator): Promise<Locator> {
  await item.scrollIntoViewIfNeeded();
  await expect(item.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr', /.*/);
  return item;
}

/** Разбор ответа под заданием. */
function verdict(item: Locator): Locator {
  return item.locator('.question__feedback');
}

async function seedOf(item: Locator): Promise<number> {
  await expect(item).toHaveAttribute('data-seed', /\d+/);
  return Number(await item.getAttribute('data-seed'));
}

async function confident(item: Locator, label: 'знаю' | 'сомневаюсь' | 'наугад' = 'знаю'): Promise<void> {
  await item.getByRole('radio', { name: label, exact: true }).check();
}

async function submit(item: Locator): Promise<void> {
  await item.getByRole('button', { name: /^(Проверить|Сдать решение)$/ }).click();
}

const ASCENDING = [
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

const DESCENDING = ASCENDING.map(([text, indent]) => [
  text.replace('insertionSort', 'insertionSortDesc').replace('a[j - 1] > a[j]', 'a[j - 1] < a[j]'),
  indent,
]) as unknown as typeof ASCENDING;

async function assemble(item: Locator, lines: typeof ASCENDING): Promise<void> {
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
async function solve(item: Locator, label: 'знаю' | 'сомневаюсь' = 'знаю'): Promise<void> {
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

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
});

test('полный цикл уровня: предвопросы, шаги, итоговая проверка, на следующий день — отложенная и «освоен»', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(LEVEL);
  const progress = page.getByRole('region', { name: 'Прохождение уровня «Фундамент»' });
  await expect(progress).toContainText('Уровень «Фундамент»: не начат');

  // Шаг 0: предвопросы — ответ не оценивается, ошибка нормальна.
  const cards = await ready(question(page, 'pre-cards'));
  await cards.getByRole('radio', { name: /Найти среди оставшихся самую младшую/ }).check();
  await expect(cards.getByRole('radio', { name: 'знаю' })).toHaveCount(0);
  await submit(cards);
  await expect(verdict(cards)).toContainText('Неверно. Вот почему.');
  await expect(verdict(cards)).toContainText('Ошибаться здесь нормально');
  await expect(verdict(cards)).toContainText('Путает сортировку вставками с сортировкой выбором.');
  const start = await ready(question(page, 'pre-start'));
  await start.getByRole('textbox', { name: 'Ваш ответ' }).fill('1');
  await submit(start);
  await expect(verdict(start)).toContainText('Верно.');
  await expect(progress.getByRole('link', { name: /Предвопросы — пройден/ })).toBeVisible();
  await expect(progress).toContainText('Уровень «Фундамент»: изучается');

  // Шаг 1: ошибка с «сомневаюсь» — разбор и похожий вариант, затем верный ответ.
  const stop = await ready(question(page, 'idea-stop'));
  await stop.getByRole('radio', { name: 'Только когда элемент дошёл до начала массива' }).check();
  await confident(stop, 'сомневаюсь');
  await submit(stop);
  await expect(verdict(stop)).toContainText('Неверно. Вот почему.');
  await expect(verdict(stop)).toContainText('Сдвигает вставляемый элемент до самого начала массива.');
  await expect(stop.getByRole('link', { name: 'Где это объясняется' })).toHaveAttribute('href', /#algo\.sorting\.insertion\.b\.idea$/);
  await stop.getByRole('textbox', { name: /Почему я ошибся/ }).fill('Не заметил условие про соседа слева.');
  await stop.getByRole('button', { name: 'Сохранить заметку' }).click();
  await expect(stop.getByRole('button', { name: 'Заметка сохранена' })).toBeDisabled();
  await stop.getByRole('button', { name: 'Ответить ещё раз' }).click();
  await solve(stop);
  await expect(verdict(stop)).toContainText('Верно.');
  await solve(question(page, 'idea-next'));
  await expect(question(page, 'idea-next').getByRole('button', { name: 'Слишком легко' })).toBeVisible();

  // Шаг 2: задания генератора и ручная симуляция.
  for (const id of ['after-k-steps', 'insert-one', 'simulate']) {
    const item = question(page, id);
    await item.scrollIntoViewIfNeeded();
    await solve(item);
    await expect(verdict(item)).toContainText('Верно.');
  }

  // Шаг 4: задача Парсонса — строки и отступы кнопками.
  const parsons = question(page, 'assemble');
  await parsons.scrollIntoViewIfNeeded();
  await solve(parsons);
  await expect(verdict(parsons)).toContainText('Верно.');
  await expect(progress).toContainText('Все шаги пройдены.');

  // Итоговая проверка: новые варианты, подсказок нет, порог 80%.
  const check = page.getByRole('region', { name: 'Итоговая проверка' });
  await check.scrollIntoViewIfNeeded();
  await check.getByRole('button', { name: 'Начать', exact: true }).click();
  for (let index = 1; index <= 5; index++) {
    const item = check.locator('section[data-question]');
    await expect(item).toContainText(`вопрос ${index} из 5`);
    await expect(item.getByRole('button', { name: /^Подсказка/ })).toHaveCount(0);
    await solve(item);
    await expect(verdict(item)).toContainText('Верно.');
    await check.getByRole('button', { name: index < 5 ? 'Следующий вопрос' : 'Завершить проверку' }).click();
  }
  await expect(check.getByRole('status')).toContainText('Проверка пройдена: 5 из 5 (100%).');
  await expect(progress).toContainText('Итоговая проверка пройдена: 5 из 5.');
  await expect(progress).toContainText('Отложенная проверка откроется');
  await expect(page.getByRole('region', { name: 'Отложенная проверка' })).toHaveCount(0);

  // Следующий учебный день: отложенная проверка из трёх вопросов.
  await page.clock.setFixedTime(new Date('2026-11-03T09:00:00'));
  await page.reload();
  const delayed = page.getByRole('region', { name: 'Отложенная проверка' });
  await expect(delayed).toBeVisible();
  await delayed.getByRole('button', { name: 'Начать', exact: true }).click();
  for (let index = 1; index <= 3; index++) {
    const item = delayed.locator('section[data-question]');
    await expect(item).toContainText(`вопрос ${index} из 3`);
    await solve(item);
    await expect(verdict(item)).toContainText('Верно.');
    await delayed.getByRole('button', { name: index < 3 ? 'Следующий вопрос' : 'Завершить проверку' }).click();
  }
  await expect(delayed.getByRole('status')).toContainText('Проверка пройдена: 3 из 3');
  await expect(progress).toContainText('Уровень «Фундамент»: освоен');

  // Прогресс переживает перезагрузку.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Прохождение уровня «Фундамент»' })).toContainText('Уровень «Фундамент»: освоен');
});

test('уверенная ошибка: разбор, отметка в журнале, и уровень не освоен до проверки в другой день', async ({ page }) => {
  await page.goto(LEVEL);
  const stop = await ready(question(page, 'idea-stop'));
  await stop.getByRole('radio', { name: 'Сразу после одного обмена с соседом' }).check();
  await confident(stop, 'знаю');
  await submit(stop);
  const status = verdict(stop);
  await expect(status).toContainText('Делает один обмен вместо сдвига до своего места.');
  await expect(status).toContainText('Это уверенная ошибка');
  // Ошибка и ответ сохранены в браузере: журнал ошибок и история ответов.
  const stored = await page.evaluate(async () => {
    const open = indexedDB.open('invariant');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const count = (store: string) =>
      new Promise<number>((resolve) => {
        const request = db.transaction(store).objectStore(store).count();
        request.onsuccess = () => resolve(request.result);
      });
    const result = { errors: await count('errors'), reviews: await count('reviews'), cards: await count('cards') };
    db.close();
    return result;
  });
  expect(stored).toEqual({ errors: 1, reviews: 1, cards: 1 });
});

test('«Продолжить» на главной и состояние уровня во вкладках и в модуле появляются после первого ответа', async ({ page }) => {
  await page.goto('ru/');
  await expect(page.getByRole('heading', { name: 'С чего начать' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Продолжить' })).toHaveCount(0);

  await page.goto(LEVEL);
  const tabs = page.getByRole('navigation', { name: 'Уровни темы' });
  await expect(tabs.getByRole('link', { name: /Фундамент/ })).not.toContainText('изучается');
  const start = await ready(question(page, 'pre-start'));
  await start.getByRole('textbox', { name: 'Ваш ответ' }).fill('1');
  await submit(start);
  await expect(verdict(start)).toContainText('Верно.');

  await page.goto('ru/');
  const card = page.getByRole('region', { name: 'Продолжить' });
  await expect(card).toContainText('Сортировка вставками, уровень «Фундамент».');
  await card.getByRole('link', { name: 'Продолжить с места остановки' }).click();
  await expect(page).toHaveURL(/\/insertion\/#algo\.sorting\.insertion\.q\.pre-start$/);
  await expect(tabs.getByRole('link', { name: /Фундамент/ })).toContainText('изучается');
  await expect(tabs.getByRole('link', { name: /База/ })).not.toContainText('изучается');

  // В модуле видна отметка только у начатого уровня.
  await page.goto('ru/algorithms/sorting/');
  const states = page.locator('li[id="algo.sorting.insertion"] .module-topics__state');
  await expect(states.filter({ hasText: 'Фундамент' })).toHaveText('Фундамент: изучается');
  await expect(states.filter({ hasText: 'Фундамент' })).toBeVisible();
  await expect(states.filter({ hasText: 'База' })).toBeHidden();
});

test('подсказка открывается ступенями и снижает оценку', async ({ page }) => {
  await page.goto(LEVEL);
  const item = await ready(question(page, 'insert-one'));
  await item.getByRole('button', { name: 'Подсказка (0 из 2)' }).click();
  await expect(item).toContainText('Сравнивайте вставляемый элемент с соседом слева.');
  await expect(item).toContainText('С подсказкой оценка для повторения — не выше «трудно».');
  await item.getByRole('button', { name: 'Следующая подсказка (1 из 2)' }).click();
  await expect(item.getByRole('button', { name: /Следующая подсказка/ })).toBeDisabled();
  await solve(item);
  await expect(verdict(item)).toContainText('Верно.');
  // После подсказки «слишком легко» не предлагается: оценка не выше Hard.
  await expect(item.getByRole('button', { name: 'Слишком легко' })).toHaveCount(0);
});

test('задания Базы: написать функцию, найти ошибку, сложность и «что выведет код»', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`${LEVEL}base/`);

  // «Что выведет код»: ответ вычислен запуском кода при сборке.
  const output = await ready(question(page, 'base-output'));
  await output.getByRole('textbox', { name: 'Ваш ответ' }).fill('2 [1, 2, 3]');
  await confident(output);
  await submit(output);
  await expect(verdict(output)).toContainText('Верно.');

  // Сложность: «n^2» и «Θ(n²)» — один ответ; O вместо Θ не засчитывается.
  const complexity = await ready(question(page, 'base-complexity'));
  await complexity.getByRole('textbox', { name: 'Ваш ответ' }).fill('O(n^2)');
  await confident(complexity, 'сомневаюсь');
  await submit(complexity);
  await expect(verdict(complexity)).toContainText('Неверно. Вот почему.');
  await expect(verdict(complexity)).toContainText('Правильный ответ: Θ(n^2)');
  await complexity.getByRole('button', { name: 'Ответить ещё раз' }).click();
  await complexity.getByRole('textbox', { name: 'Ваш ответ' }).fill('Θ(n²)');
  await confident(complexity);
  await submit(complexity);
  await expect(verdict(complexity)).toContainText('Верно.');

  // «Найти ошибку»: строка и причина.
  const bug = await ready(question(page, 'base-find-bug'));
  await bug.getByRole('radio', { name: /while \(j > 1/ }).check();
  await bug.getByRole('radio', { name: 'Элемент не может дойти до начала массива — до индекса 0' }).check();
  await confident(bug);
  await submit(bug);
  await expect(verdict(bug)).toContainText('Верно.');

  // «Написать функцию»: решение проверяют видимые и скрытые тесты в песочнице.
  const write = await ready(question(page, 'base-write'));
  const editor = write.locator('.cm-content');
  await expect(editor).toBeVisible();
  await confident(write);
  await submit(write);
  await expect(verdict(write)).toContainText('Неверно. Вот почему.', { timeout: 15_000 });
  await expect(verdict(write)).toContainText('Не пройдено тестов');
  await write.getByRole('button', { name: 'Ответить ещё раз' }).click();
  // Вставляем решение как из буфера обмена: так CodeMirror получает текст как от человека.
  const solution = ['function insertionSort(a) {', '  for (let i = 1; i < a.length; i++)', '    for (let j = i; j > 0 && a[j - 1] > a[j]; j--) [a[j - 1], a[j]] = [a[j], a[j - 1]];', '  return a;', '}'].join('\n');
  await replaceEditorText(page, write.locator('.cm-content'), solution);
  await confident(write);
  await submit(write);
  await expect(verdict(write)).toContainText('Верно.', { timeout: 15_000 });
  await expect(verdict(write)).toContainText('Все тесты пройдены.');
});
