import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { answerWrong, LEVEL, question, ready, solve, verdict } from './learn-helpers.ts';

/**
 * Диагностика после перерыва (ТЗ, «Возвращение после перерыва»): после
 * 30 дней без занятий главная предлагает короткую проверку пройденных тем.
 */

const DAY_ONE = new Date('2026-11-02T10:00:00');
const AFTER_BREAK = new Date('2026-12-15T10:00:00');

async function learnSomething(page: Page): Promise<void> {
  await page.clock.setFixedTime(DAY_ONE);
  await page.goto(LEVEL);
  const item = question(page, 'insert-one');
  await solve(item);
  await expect(verdict(item)).toContainText('Верно.');
}

test('после перерыва главная предлагает диагностику; верный ответ — «сохранилось»', async ({ page }) => {
  await learnSomething(page);
  await page.goto('ru/');
  const card = page.getByRole('region', { name: 'Продолжить' });
  await expect(card).toContainText('Сортировка вставками');
  await expect(card).not.toContainText('Занятий не было');

  await page.clock.setFixedTime(AFTER_BREAK);
  await page.reload();
  await expect(card).toContainText('Занятий не было 43 дня.');
  await card.getByRole('link', { name: 'Пройти диагностику' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Диагностика после перерыва');
  await page.getByRole('button', { name: 'Начать' }).click();
  const item = await ready(page.locator('section[data-question]'));
  await expect(item).toContainText('вопрос 1 из 1');
  await expect(item.getByRole('button', { name: /^Подсказка/ })).toHaveCount(0);
  await solve(item);
  await expect(verdict(item)).toContainText('Верно.');
  await page.getByRole('button', { name: 'Показать итог' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Сохранилось: 1 из 1.' })).toContainText('Фундамент — сохранилось');

  // Ответ — это занятие: предложение диагностики больше не показывается.
  await page.goto('ru/');
  await expect(card).toContainText('Сортировка вставками');
  await expect(card).not.toContainText('Занятий не было');
});

test('неверный ответ — тему стоит пройти заново с этого уровня, и уровень можно начать заново', async ({ page }) => {
  await learnSomething(page);
  await page.clock.setFixedTime(AFTER_BREAK);
  await page.goto('ru/diagnostics/');
  await page.getByRole('button', { name: 'Начать' }).click();
  const item = page.locator('section[data-question]');
  await answerWrong(item);
  await expect(verdict(item)).toContainText('Неверно.');
  await page.getByRole('button', { name: 'Показать итог' }).click();
  const result = page.getByRole('status').filter({ hasText: 'Сохранилось: 0 из 1.' });
  await expect(result).toContainText('Стоит пройти заново с уровня «Фундамент».');
  await result.getByRole('button', { name: 'Начать уровень «Фундамент» заново' }).click();
  await expect(result.getByRole('link', { name: 'Открыть уровень' })).toHaveAttribute('href', /\/insertion\/$/);

  // Шаги уровня обнулились, уровень — «изучается».
  await page.goto(LEVEL);
  const progress = page.getByRole('region', { name: 'Прохождение уровня «Фундамент»' });
  await expect(progress).toContainText('Уровень «Фундамент»: изучается');
  await expect(progress.getByRole('link', { name: /Разобрать — не пройден/ })).toBeVisible();
});

test('«не сейчас» прячет предложение диагностики', async ({ page }) => {
  await learnSomething(page);
  await page.clock.setFixedTime(AFTER_BREAK);
  await page.goto('ru/');
  const card = page.getByRole('region', { name: 'Продолжить' });
  await card.getByRole('button', { name: 'Не сейчас' }).click();
  await expect(card).not.toContainText('Занятий не было');
  await page.reload();
  await expect(card).toContainText('Сортировка вставками');
  await expect(card).not.toContainText('Занятий не было');
});
