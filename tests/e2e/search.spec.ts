import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/** Поиск по-русски (ТЗ, «Поиск»): формы слов, синонимы, опечатки, группы результатов. */

async function search(page: Page, query: string) {
  const input = page.getByRole('searchbox', { name: 'Поиск по справочнику' });
  await input.fill(query);
  return page.locator('.search');
}

test.beforeEach(async ({ page }) => {
  await page.goto('ru/prototypes/search/');
  await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', /.*/);
});

test('формы слов: «сортировкой вставками» находит тему', async ({ page }) => {
  const box = await search(page, 'сортировкой вставками');
  await expect(box.getByRole('status')).toContainText('Найдено:');
  const topics = box.getByRole('region', { name: 'Темы' });
  await expect(topics.locator('.search__title').first()).toHaveText('Вставками и бинарными вставками');
  // Сборка для автопроверок показывает черновик: тема ведёт на свою страницу.
  await expect(topics.locator('.search__context').first()).toContainText('1.5 Сортировки');
  await expect(topics.getByRole('link').first()).toHaveAttribute('href', /\/ru\/algorithms\/sorting\/insertion\/$/);
});

test('опечатки и синонимы: «дийкстра», «heap», «хэш»', async ({ page }) => {
  let box = await search(page, 'дийкстра');
  await expect(box.getByRole('region', { name: 'Темы' }).locator('.search__title').first()).toContainText('Алгоритм Дейкстры');
  box = await search(page, 'heap');
  await expect(box.getByRole('region', { name: 'Темы' })).toContainText('Двоичная куча');
  box = await search(page, 'хэш');
  await expect(box.getByRole('region', { name: 'Темы' })).toContainText('Хеш-таблица с цепочками');
});

test('результаты по группам: темы, термины, блоки; блок ведёт на свою страницу', async ({ page }) => {
  const box = await search(page, 'сортировка вставками');
  await expect(box.locator('.search__group-title')).toHaveText(['Темы', 'Термины', 'Блоки тем']);
  const block = box.getByRole('region', { name: 'Блоки тем' }).getByRole('link').first();
  const target = /\/ru\/algorithms\/sorting\/insertion\/(?:base\/|depth\/)?#algo\.sorting\.insertion\.b\./;
  await expect(block).toHaveAttribute('href', target);
  await block.click();
  await expect(page).toHaveURL(target);
});

test('ничего не найдено — понятное сообщение', async ({ page }) => {
  const box = await search(page, 'щщщщъъъ');
  await expect(box.getByRole('status')).toHaveText('Ничего не найдено. Попробуйте другое слово или английское название.');
});

test('контрольные запросы прогоняются при сборке: 50 строк и итог', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Контрольные запросы' }).locator('tbody tr')).toHaveCount(50);
  await expect(page.getByText(/MiniSearch со своим стеммером и словарём синонимов — \d+ из 50/)).toBeVisible();
});
