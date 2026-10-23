import type { Locator } from '@playwright/test';
import { createRandom } from '../../src/lib/random.ts';
import { afterKSteps } from '../../content/ru/algorithms/sorting/insertion-sort/generators.ts';
import { expect, test } from './fixtures.ts';

/** Прокручивает остров к себе и ждёт, пока он «оживёт» (client:visible). */
async function hydrated(locator: Locator): Promise<Locator> {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr', /.*/);
  return locator;
}

test.beforeEach(async ({ page }) => {
  await page.goto('ru/prototypes/trace/');
});

test('визуализация идёт по шагам до упорядоченного массива', async ({ page }) => {
  const viz = await hydrated(page.getByRole('region', { name: 'Визуализация: Сортировка вставками' }));
  const description = viz.locator('.viz__description');
  await expect(description).toHaveText('Начало: массив [7, 3, 5, 1, 4].');
  await expect(viz.getByText(/Шаг\s*0\s*из\s*21/)).toBeVisible();

  await viz.getByRole('button', { name: 'Вперёд →' }).click();
  await expect(description).toHaveText('Вставляем 3 — элемент с индексом 1 — в упорядоченную часть слева.');
  await viz.getByRole('button', { name: 'Вперёд →' }).click();
  await expect(description).toHaveText('Сравниваем 7 и 3: 7 > 3.');
  await expect(viz.locator('.code-panel li.is-current')).toContainText('while (j > 0 && a[j - 1] > a[j])');

  // Клавиши: стрелка вправо до конца.
  await viz.focus();
  for (let step = 0; step < 25; step++) await page.keyboard.press('ArrowRight');
  await expect(description).toHaveText('Готово: массив упорядочен.');
  await expect(viz.getByText(/Сравнений:\s*9/)).toBeVisible();
  await expect(viz.getByText(/Обменов:\s*7/)).toBeVisible();
  await expect(viz.getByRole('list', { name: 'Массив [1, 3, 4, 5, 7]' })).toBeVisible();

  await page.keyboard.press('Home');
  await expect(description).toHaveText('Начало: массив [7, 3, 5, 1, 4].');
});

test('режим предсказания спрашивает перед шагом и проверяет ответ', async ({ page }) => {
  const viz = await hydrated(page.getByRole('region', { name: 'Визуализация: Сортировка вставками' }));
  await viz.getByRole('button', { name: 'Предсказывать' }).click();
  const forward = viz.getByRole('button', { name: 'Вперёд →' });
  await forward.click(); // пояснение — без вопроса
  await forward.click(); // дальше сравнение: вопрос
  await expect(viz.getByText('Какие два элемента сравнятся дальше?')).toBeVisible();
  const bars = viz.locator('.bars button');
  await bars.nth(0).click();
  await bars.nth(1).click();
  await viz.getByRole('button', { name: 'Проверить' }).click();
  await expect(viz.getByRole('status')).toHaveText('Верно. Сравнятся 7 и 3 (индексы 0 и 1).');
  await viz.getByRole('button', { name: 'Дальше →' }).click();
  await expect(viz.locator('.viz__description')).toHaveText('Сравниваем 7 и 3: 7 > 3.');

  await viz.getByRole('button', { name: 'Вперёд →' }).click();
  await viz.getByRole('button', { name: 'Нет' }).click();
  await expect(viz.getByRole('status')).toHaveText('Неверно. Поменяются: 7 > 3.');
  await expect(viz.getByText(/Предсказаний верно:\s*1\s*из\s*2/)).toBeVisible();
});

test('свои данные проверяются и меняют визуализацию', async ({ page }) => {
  const viz = await hydrated(page.getByRole('region', { name: 'Визуализация: Сортировка вставками' }));
  const field = viz.getByRole('textbox', { name: 'Свои данные' });
  await field.fill('3, x');
  await viz.getByRole('button', { name: 'Показать', exact: true }).click();
  await expect(viz.getByText('«x» — не целое число.')).toBeVisible();
  await field.fill('2 1');
  await viz.getByRole('button', { name: 'Показать', exact: true }).click();
  await expect(viz.locator('.viz__description')).toHaveText('Начало: массив [2, 1].');
});

test('ручная симуляция сверяет шаги со следом и объясняет ошибку', async ({ page }) => {
  const simulation = await hydrated(page.getByRole('region', { name: 'Ручная симуляция: Сортировка вставками' }));
  const bars = simulation.locator('.bars button');
  await bars.nth(2).click();
  await bars.nth(3).click();
  await expect(simulation.getByRole('status')).toContainText('Неверно: обмен 8 и 1 сейчас не нужен.');
  await expect(simulation.getByRole('status')).toContainText('Правильный шаг — поменять местами 5 и 2 (индексы 0 и 1).');
  await bars.nth(0).click();
  await bars.nth(1).click();
  await expect(simulation.getByRole('status')).toHaveText('Верно: меняем местами 5 и 2.');
  for (let step = 0; step < 4; step++) await simulation.getByRole('button', { name: 'Показать правильный шаг' }).click();
  await expect(simulation.getByText('Готово: массив упорядочен. Верных шагов с первой попытки — 0 из 5, ошибок — 1, показанных шагов — 4.')).toBeVisible();
  await expect(simulation.getByRole('list', { name: 'Массив [1, 2, 5, 6, 8]' })).toBeVisible();
});

test('задание генератора: верный ответ, неверный ответ с разбором заблуждения и новый вариант', async ({ page }) => {
  const question = await hydrated(page.getByRole('region', { name: 'Задание' }));
  const variant = afterKSteps(createRandom(1));
  const correct = variant.options.find((option) => option.correct);
  const wrong = variant.options.find((option) => !option.correct);
  if (!correct || !wrong) throw new Error('у варианта нет верного или неверного ответа');

  await expect(question.getByText('Вариант № 1')).toBeVisible();
  await question.getByRole('radio', { name: wrong.text }).check();
  await question.getByRole('radio', { name: 'знаю' }).check();
  await question.getByRole('button', { name: 'Проверить' }).click();
  await expect(question.getByRole('status')).toContainText(`Неверно. Правильный ответ: ${correct.text}.`);
  await expect(question.getByRole('status')).toContainText('Это уверенная ошибка');

  await question.getByRole('button', { name: 'Другой вариант' }).click();
  await expect(question.getByText('Вариант № 2')).toBeVisible();
  const second = afterKSteps(createRandom(2));
  const secondCorrect = second.options.find((option) => option.correct);
  if (!secondCorrect) throw new Error('нет верного ответа');
  await question.getByRole('radio', { name: secondCorrect.text }).check();
  await question.getByRole('radio', { name: 'наугад' }).check();
  await question.getByRole('button', { name: 'Проверить' }).click();
  await expect(question.getByRole('status')).toContainText('Верно.');
  await expect(question.getByRole('status')).toContainText('Правильная догадка ещё не доказывает знание');
});
