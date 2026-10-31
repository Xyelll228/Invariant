import AxeBuilder from '@axe-core/playwright';
import { test as plain } from '@playwright/test';
import { expect, test } from './fixtures.ts';

const pages = [
  { path: 'ru/', heading: 'Инвариант' },
  { path: 'ru/catalog/', heading: 'Каталог' },
  { path: 'ru/algorithms/', heading: '1. Алгоритмы и структуры данных' },
  { path: 'ru/algorithms/sorting/', heading: '1.5 Сортировки' },
  { path: 'ru/algorithms/sorting/insertion/', heading: 'Сортировка вставками' },
  { path: 'ru/algorithms/sorting/insertion/base/', heading: 'Сортировка вставками' },
  { path: 'ru/algorithms/sorting/insertion/depth/', heading: 'Сортировка вставками' },
  { path: 'ru/glossary/', heading: 'Глоссарий' },
  { path: 'ru/search/', heading: 'Поиск' },
  { path: 'ru/review/', heading: 'Повторение' },
  { path: 'ru/errors/', heading: 'Журнал ошибок' },
  { path: 'ru/settings/', heading: 'Настройки' },
  { path: 'ru/prototypes/', heading: 'Прототипы' },
  { path: 'ru/prototypes/design/', heading: 'Основа дизайна' },
  { path: 'ru/prototypes/trace/', heading: 'След алгоритма' },
  { path: 'ru/prototypes/sandbox/', heading: 'Песочница кода' },
  { path: 'ru/prototypes/review/', heading: 'Хранилище, повторение и экспорт' },
  { path: 'ru/prototypes/search/', heading: 'Поиск по-русски' },
  { path: 'ru/prototypes/offline/', heading: 'Работа без сети и установка на телефон' },
  { path: 'ru/about/', heading: 'О проекте' },
];

test('корень сайта ведёт на русскую версию', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveURL(/\/ru\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Инвариант');
});

for (const { path, heading } of pages) {
  test.describe(`страница ${path}`, () => {
    test('открывается без ошибок', async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(page.locator('meta[http-equiv="content-security-policy"]')).toHaveCount(1);
    });

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`доступность WCAG 2.2 AA, тема ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
          .analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      });
    }

    test('нет горизонтальной прокрутки на ширине 360 px', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test('переключатель темы идёт по кругу и запоминает выбор', async ({ page }) => {
  await page.goto('ru/');
  const html = page.locator('html');
  const toggle = page.locator('[data-theme-toggle]');
  await expect(toggle).toHaveAccessibleName('Тема: как в системе');

  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveAccessibleName('Тема: светлая');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('[data-theme-toggle]')).toHaveAccessibleName('Тема: светлая');

  await page.locator('[data-theme-toggle]').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.locator('[data-theme-toggle]').click();
  await expect(html).not.toHaveAttribute('data-theme', /.+/);
  await page.reload();
  await expect(html).not.toHaveAttribute('data-theme', /.+/);
});

test('ссылка «Перейти к содержанию» видна с клавиатуры', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile, 'на телефоне нет клавиатурной навигации Tab');
  test.skip(browserName === 'webkit', 'Safari по умолчанию не переводит фокус на ссылки клавишей Tab');
  await page.goto('ru/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Перейти к содержанию' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});

plain('несуществующая страница отдаёт 404 со своей разметкой', async ({ page }) => {
  const response = await page.goto('ru/net-takoj-stranicy/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Страница не найдена');
});
