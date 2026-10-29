import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { confident, LEVEL, question, ready, solve, submit, verdict } from './learn-helpers.ts';

/**
 * Повторение, журнал ошибок, настройки и копия в файл (ТЗ, «Разбор ошибок и
 * повторение», «Сохранность данных»; критерии приёмки «Повторения планируются
 * и переживают перезагрузку» и «Экспорт и импорт на другом устройстве
 * восстанавливают прогресс без потерь»).
 */

const DAY_ONE = new Date('2026-11-02T10:00:00');
const DAY_TWO = new Date('2026-11-03T09:00:00');

/** На странице темы — верный ответ на задание «вставить один элемент»: навык попадает в повторение. */
async function learnInsertOne(page: Page): Promise<void> {
  await page.goto(LEVEL);
  const item = question(page, 'insert-one');
  await solve(item);
  await expect(verdict(item)).toContainText('Верно.');
}

/** Настройки загрузились: остров ожил и прочитал значения из хранилища — поля стали доступны. */
async function settingsReady(page: Page): Promise<void> {
  await expect(page.getByRole('textbox', { name: 'Повторений за учебный день' })).toBeEnabled();
}

function session(page: Page) {
  return page.getByRole('region', { name: 'Повторение' });
}

test('повторение: навык возвращается на следующий день, уверенная ошибка — ещё раз в той же сессии', async ({ page }) => {
  await page.clock.setFixedTime(DAY_ONE);
  await learnInsertOne(page);

  // В тот же день повторять ещё рано: следующий шаг изучения — через несколько минут.
  await page.goto('ru/review/');
  await expect(session(page)).toContainText('На сегодня повторений нет.');
  await expect(session(page)).toContainText(/Следующее повторение — через \d+ минут/);

  // Следующий учебный день: навык пора повторить — задание новое, не то, что в теме.
  await page.clock.setFixedTime(DAY_TWO);
  await page.reload();
  const first = await ready(session(page).locator('section[data-question]'));
  await expect(first).toContainText('вопрос 1 из 1');
  await expect(first).toHaveAttribute('data-question', /\.q\.check-insert$/);
  await expect(session(page)).toContainText('Сортировка вставками');

  // Уверенная ошибка: разбор, и навык встанет ещё раз в конец этой сессии.
  await first.getByRole('textbox', { name: 'Ваш ответ' }).fill('[1, 2, 3]');
  await confident(first, 'знаю');
  await submit(first);
  await expect(verdict(first)).toContainText('Это уверенная ошибка');
  await expect(first).toContainText('вопрос 1 из 2');
  await session(page).getByRole('button', { name: 'Следующий вопрос' }).click();

  const again = session(page).locator('section[data-question]');
  await expect(again).toContainText('вопрос 2 из 2');
  await expect(session(page)).toContainText('ещё раз после уверенной ошибки');
  await solve(again);
  await expect(verdict(again)).toContainText('Верно.');
  await session(page).getByRole('button', { name: 'Завершить повторение' }).click();
  await expect(session(page).getByRole('status')).toContainText('Повторение на сегодня закончено.');
  await expect(session(page).getByRole('status')).toContainText('Следующее повторение —');

  // Расписание пережило перезагрузку: сегодня повторять больше нечего.
  await page.reload();
  await expect(session(page)).toContainText('На сегодня повторений нет.');

  // Ошибка — в журнале; «разобрался» её не удаляет.
  await page.goto('ru/errors/');
  const entry = page.locator('.error-log__item');
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('Сортировка вставками');
  await expect(entry).toContainText('Вставка одного элемента в упорядоченную левую часть');
  await entry.getByRole('button', { name: 'Разобрался' }).click();
  await expect(entry.getByRole('button', { name: 'Разобрался' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('checkbox', { name: 'Скрыть разобранные' }).check();
  await expect(page.locator('.error-log__item')).toHaveCount(0);
  await expect(page.getByText('Показано: 0 из 1.')).toBeVisible();
});

test('журнал ошибок: частые заблуждения, фильтр и заметка', async ({ page }) => {
  await page.clock.setFixedTime(DAY_ONE);
  await page.goto(LEVEL);
  const stop = await ready(question(page, 'idea-stop'));
  // Одно и то же заблуждение дважды: «сдвигает до самого начала массива».
  for (let attempt = 0; attempt < 2; attempt++) {
    await stop.getByRole('radio', { name: 'Только когда элемент дошёл до начала массива' }).check();
    await confident(stop, 'сомневаюсь');
    await submit(stop);
    await expect(verdict(stop)).toContainText('Неверно. Вот почему.');
    if (attempt === 0) await stop.getByRole('button', { name: 'Ответить ещё раз' }).click();
  }

  await page.goto('ru/errors/');
  const frequent = page.getByRole('region', { name: 'Мои частые заблуждения' });
  await expect(frequent).toContainText('Сдвигает вставляемый элемент до самого начала массива.');
  await expect(frequent).toContainText('2 раза');
  await expect(page.locator('.error-log__item')).toHaveCount(2);

  // Фильтр по заблуждению и сброс фильтра.
  await frequent.getByRole('button', { name: /Сдвигает вставляемый элемент/ }).click();
  await expect(page.getByText(/Только заблуждение/)).toBeVisible();
  await page.getByRole('button', { name: 'Показать все' }).click();

  // Заметка «почему я ошибся» сохраняется и переживает перезагрузку.
  const entry = page.locator('.error-log__item').first();
  await entry.getByRole('textbox', { name: 'Почему я ошибся' }).fill('Забыл про условие «сосед слева не больше».');
  await entry.getByRole('button', { name: 'Сохранить заметку' }).click();
  await expect(entry.getByRole('button', { name: 'Заметка сохранена' })).toBeDisabled();
  await page.reload();
  await expect(page.locator('.error-log__item').first().getByRole('textbox', { name: 'Почему я ошибся' })).toHaveValue(
    'Забыл про условие «сосед слева не больше».',
  );
});

test('пауза темы: её навыки не приходят в повторении, пока пауза не снята', async ({ page }) => {
  await page.clock.setFixedTime(DAY_ONE);
  await learnInsertOne(page);
  const progress = page.getByRole('region', { name: 'Прохождение уровня «Фундамент»' });
  await progress.getByRole('button', { name: 'Поставить тему на паузу' }).click();
  await expect(progress).toContainText('Тема на паузе');

  await page.clock.setFixedTime(DAY_TWO);
  await page.goto('ru/review/');
  await expect(session(page)).toContainText('На сегодня повторений нет.');

  await page.goto(LEVEL);
  await page.getByRole('region', { name: 'Прохождение уровня «Фундамент»' }).getByRole('button', { name: 'Снять тему с паузы' }).click();
  await page.goto('ru/review/');
  await expect(session(page).locator('section[data-question]')).toContainText('вопрос 1 из 1');
});

test('настройки: лимиты проверяются и сохраняются, размер текста и тема применяются сразу и после перезагрузки', async ({ page }) => {
  await page.goto('ru/settings/');
  await settingsReady(page);
  const reviews = page.getByRole('textbox', { name: 'Повторений за учебный день' });
  await expect(reviews).toHaveValue('100');
  await reviews.fill('5');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByText('Нужно число от 10 до 1000.')).toBeVisible();
  await expect(page.getByText('Не сохранено: исправьте поля с ошибкой.')).toBeVisible();
  await reviews.fill('20');
  await page.getByRole('textbox', { name: 'Уровень запоминания' }).fill('0,85');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByText(/^Сохранено\./)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Повторений за учебный день' })).toHaveValue('20');
  await expect(page.getByRole('textbox', { name: 'Уровень запоминания' })).toHaveValue('0,85');

  const html = page.locator('html');
  await page.getByRole('radio', { name: 'Ещё крупнее' }).check();
  await expect(html).toHaveAttribute('data-text-size', 'larger');
  await page.getByRole('radio', { name: 'Тёмная' }).check();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[data-theme-toggle]')).toHaveAccessibleName('Тема: тёмная');
  await page.goto('ru/');
  await expect(html).toHaveAttribute('data-text-size', 'larger');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('20px');

  await page.goto('ru/settings/');
  await page.getByRole('button', { name: 'Вернуть по умолчанию' }).click();
  await expect(page.getByRole('textbox', { name: 'Повторений за учебный день' })).toHaveValue('100');
});

test('копия в файл: прогресс переезжает на другое устройство без потерь; сброс удаляет всё', async ({ page, browser }, testInfo) => {
  await page.clock.setFixedTime(DAY_ONE);
  await learnInsertOne(page);
  await page.goto('ru/settings/');
  await settingsReady(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить копию в файл' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('invariant-2026-11-02.json');
  const text = await readFile(await download.path(), 'utf8');
  const backup = JSON.parse(text) as { format: string; data: { reviews: unknown[]; cards: unknown[]; progress: unknown[] } };
  expect(backup.format).toBe('invariant-backup');
  expect(backup.data.reviews).toHaveLength(1);
  await expect(page.getByText(/Последняя копия: 2 ноября 2026/)).toBeVisible();

  // «Другое устройство» — новый контекст браузера со своим хранилищем.
  const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL, locale: 'ru-RU' });
  const second = await other.newPage();
  await second.clock.setFixedTime(DAY_TWO);
  await second.goto('ru/settings/');
  await settingsReady(second);
  // Файл передаётся содержимым: путь к папке результатов теста — по-русски, а Chromium такой путь не читает.
  await second.locator('input[type="file"]').setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(second.getByText(/Копия от 2 ноября 2026.*навыков — 1, ответов — 1\./)).toBeVisible();
  await second.getByRole('button', { name: 'Заменить' }).click();
  await expect(second.getByRole('status').filter({ hasText: 'Готово' })).toContainText('данные на этом устройстве заменены копией');

  // Прогресс и расписание на месте: «Продолжить» на главной и навык в повторении.
  await second.goto('ru/');
  await expect(second.getByRole('region', { name: 'Продолжить' })).toContainText('Сортировка вставками, уровень «Фундамент».');
  await second.goto('ru/review/');
  await expect(second.getByRole('region', { name: 'Повторение' }).locator('section[data-question]')).toContainText('вопрос 1 из 1');
  await other.close();

  // Сброс: прогресса больше нет.
  await page.goto('ru/settings/');
  await page.getByRole('button', { name: 'Удалить весь прогресс…' }).click();
  await page.getByRole('button', { name: 'Удалить всё' }).click();
  await expect(page.getByText('Прогресс удалён.')).toBeVisible();
  await page.goto('ru/');
  await expect(page.getByRole('region', { name: 'Продолжить' })).toHaveCount(0);
  await page.goto('ru/review/');
  await expect(session(page)).toContainText('Повторять пока нечего.');
});
