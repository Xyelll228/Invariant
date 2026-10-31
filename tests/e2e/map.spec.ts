import { expect, test } from './fixtures.ts';
import { LEVEL, question, verdict } from './learn-helpers.ts';

/**
 * Карта связей (ТЗ, «Предпосылки и карта связей»): граф тем модуля и раздела,
 * та же карта списком, состояние тем по прогрессу в браузере.
 */

test('карта модуля: стрелки от предпосылок, список для диктора, состояние темы', async ({ page }) => {
  await page.goto('ru/algorithms/sorting/');
  const map = page.getByRole('region', { name: 'Карта связей модуля: граф' });
  await expect(map).toBeVisible();
  const graph = map.getByRole('group', { name: /^Граф тем модуля: 3\./ });
  await expect(graph.getByRole('link', { name: 'Сортировка вставками', exact: true })).toHaveAttribute('href', /\/ru\/algorithms\/sorting\/insertion\/$/);
  // Предпосылки из других модулей — с номером модуля и ведут на своё место в каталоге.
  await expect(graph.getByRole('link', { name: /^1\.2 · Массив/ })).toHaveAttribute('href', /\/ru\/catalog\/#algo\.linear\.array$/);
  await expect(map.locator('.topic-map__edge--prerequisite')).toHaveCount(2);

  await page.getByText('Карта связей списком').click();
  const list = page.locator('.topic-map__list');
  await expect(list).toContainText('Начать можно с тем:');
  const sorting = list.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Сортировка вставками', exact: true }) }).last();
  await expect(sorting).toContainText('нужно знать до: Массив и доступ по индексу за O(1), Асимптотика');

  // Начатая тема — «изучается».
  await page.goto(LEVEL);
  const item = question(page, 'pre-start');
  await item.scrollIntoViewIfNeeded();
  await item.getByRole('textbox', { name: 'Ваш ответ' }).fill('1');
  await item.getByRole('button', { name: 'Проверить' }).click();
  await expect(verdict(item)).toContainText('Верно.');
  await page.goto('ru/algorithms/sorting/');
  const node = page.locator('[data-map-topic="algo.sorting.insertion"]');
  await expect(node).toHaveAttribute('data-state', 'in-progress');
  await expect(node).toHaveAttribute('aria-label', 'Сортировка вставками — изучается');
  await expect(node.locator('[data-map-state]')).toHaveText('изучается');
});

test('карта раздела показывает вышедшие темы раздела', async ({ page }) => {
  await page.goto('ru/algorithms/');
  await expect(page.getByRole('region', { name: 'Карта связей раздела: граф' })).toBeVisible();
  await expect(page.locator('[data-map-topic="algo.sorting.insertion"]')).toHaveCount(1);
});
