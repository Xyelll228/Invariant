import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { LEVEL, question, solve, verdict } from './learn-helpers.ts';

/**
 * Работа без сети (ТЗ, критерий приёмки «Работает без сети после первого
 * посещения»). Service Worker в Playwright проверяется в Chromium; на iPhone и
 * Android — ручная проверка по ТЗ.
 */

test.skip(({ browserName }) => browserName !== 'chromium', 'Service Worker в сквозных тестах проверяем в Chromium');

/** Первое посещение: ждём, пока Service Worker установится и положит сайт в кеш. */
async function firstVisit(page: Page, path = 'ru/'): Promise<void> {
  await page.goto(path);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (registration.active?.state !== 'activated') {
      await new Promise<void>((resolve) => registration.active?.addEventListener('statechange', () => resolve()));
    }
  });
  // Страница становится подконтрольной Service Worker после перезагрузки.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

test('после первого посещения сайт открывается без сети', async ({ page, context }) => {
  await firstVisit(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Инвариант');
  await page.getByRole('link', { name: 'Каталог' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Каталог');
  await page.getByRole('link', { name: 'Глоссарий' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Глоссарий');
});

test('открытая страница темы потом открывается без сети, а неоткрытая — объясняет, что нет сети', async ({ page, context }) => {
  await firstVisit(page);
  await page.goto('ru/algorithms/sorting/insertion/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сортировка вставками');
  // Без перезагрузки до переходов: в Chromium под Playwright после перезагрузки
  // эмуляция «нет сети» перестаёт действовать на запросы Service Worker.
  await context.setOffline(true);
  await page.goto('ru/algorithms/sorting/insertion/depth/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Нет сети');
  await page.goto('ru/algorithms/sorting/insertion/');
  await expect(page.getByRole('heading', { level: 2, name: 'Фундамент' })).toBeVisible();
});

test('без сети работают поиск, повторение и песочница', async ({ page, context }) => {
  await firstVisit(page);
  await context.setOffline(true);

  await page.goto('ru/prototypes/search/');
  await page.getByRole('searchbox', { name: 'Поиск по справочнику' }).fill('дийкстра');
  await expect(page.locator('.search__title').first()).toContainText('Алгоритм Дейкстры');

  await page.goto('ru/prototypes/review/');
  await expect(page.getByRole('region', { name: 'Карточка навыка' })).toBeVisible();

  await page.goto('ru/prototypes/sandbox/');
  const lab = page.getByRole('region', { name: 'Проверка изоляции' });
  await lab.scrollIntoViewIfNeeded();
  await expect(lab.locator('.cm-content')).toBeVisible();
  await lab.getByRole('button', { name: 'Запустить' }).click();
  await expect(lab.locator('.code-lab__tests li').first()).toContainText('→ результат', { timeout: 10_000 });
});

test('повторение работает без сети: задания открытой темы берутся из кеша', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  await firstVisit(page);
  await page.goto(LEVEL);
  const item = question(page, 'insert-one');
  await solve(item);
  await expect(verdict(item)).toContainText('Верно.');
  // После ответа задания темы ложатся в кеш Service Worker.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const cache = await caches.open('invariant-learn');
        return (await cache.keys()).some((request) => request.url.endsWith('/ru/learn/algo.sorting.insertion.json'));
      }),
    )
    .toBe(true);

  // Следующий учебный день, сети нет: повторение открывается и показывает задание.
  await page.clock.setFixedTime(new Date('2026-11-03T09:00:00'));
  await context.setOffline(true);
  await page.goto('ru/review/');
  const next = page.getByRole('region', { name: 'Повторение' }).locator('section[data-question]');
  await expect(next).toContainText('вопрос 1 из 1');
  await solve(next);
  await expect(verdict(next)).toContainText('Верно.');
});

test('раздел, скачанный заранее, открывается без сети целиком — и темы, которые ещё не открывали', async ({ page, context }) => {
  await firstVisit(page, 'ru/algorithms/');
  const download = page.locator('.section-download');
  // Сама страница раздела уже в кеше: её открыли.
  await expect(download).toContainText(/На устройстве сохранено 1 из \d+ файлов раздела\./);
  await download.getByRole('button', { name: 'Скачать раздел для работы без сети' }).click();
  await expect(download.getByRole('status')).toContainText(/Раздел сохранён: \d+ файл/);

  // Без сети открывается уровень темы, который в этом браузере никогда не открывали.
  await context.setOffline(true);
  await page.goto('ru/algorithms/sorting/insertion/depth/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сортировка вставками');
  await expect(page.getByRole('heading', { level: 2, name: 'Глубина' })).toBeVisible();
  await page.goto('ru/algorithms/sorting/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('1.5 Сортировки');
});

test('страница, которой нет в кеше, без сети объясняет, что случилось', async ({ page, context }) => {
  await firstVisit(page);
  await context.setOffline(true);
  await page.goto('ru/takoy-stranicy-net/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Нет сети');
});

test('манифест: приложение ставится на экран «Домой»', async ({ page, request }) => {
  await page.goto('ru/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const response = await request.get(new URL(href ?? '', page.url()).href);
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as { start_url: string; scope: string; display: string; icons: { purpose: string; sizes: string }[] };
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toMatch(/\/ru\/$/);
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512')).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test('страница прототипа показывает, что сайт сохранён на устройстве', async ({ page }) => {
  await firstVisit(page, 'ru/prototypes/offline/');
  await expect(page.getByText('сайт сохранён на устройстве и откроется без интернета.')).toBeVisible();
  await expect(page.getByText(/^\d+ файлов/)).toBeVisible();
});
