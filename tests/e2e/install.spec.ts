import { expect, test } from './fixtures.ts';

/**
 * Установка на экран «Домой» (ТЗ, «Путь ученика»: «на iPhone предлагает
 * добавить себя на экран «Домой» и объясняет зачем»).
 */

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test.describe('на iPhone', () => {
  test.use({ userAgent: IPHONE });

  test('главная подсказывает добавить приложение на экран «Домой» и объясняет зачем; «Понятно» прячет подсказку', async ({ page }) => {
    await page.goto('ru/');
    const hint = page.getByRole('complementary', { name: 'Добавьте приложение на экран «Домой»' });
    await expect(hint).toContainText('Safari удаляет данные сайта, если семь дней пользоваться Safari и не заходить на сайт');
    await hint.getByRole('button', { name: 'Понятно' }).click();
    await expect(hint).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Инвариант');
    await expect(page.getByRole('complementary', { name: 'Добавьте приложение на экран «Домой»' })).toHaveCount(0);
  });

  test('в настройках — как поставить приложение на iPhone', async ({ page }) => {
    await page.goto('ru/settings/');
    await expect(page.getByRole('region', { name: 'Установка на телефон' })).toContainText('нажмите «Поделиться», затем «На экран „Домой“»');
  });
});

test('на компьютере подсказки про iPhone нет', async ({ page, isMobile }) => {
  test.skip(isMobile, 'проверяем на компьютере');
  await page.goto('ru/');
  await expect(page.getByRole('heading', { name: 'Разделы' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Добавьте приложение на экран «Домой»' })).toHaveCount(0);
});
