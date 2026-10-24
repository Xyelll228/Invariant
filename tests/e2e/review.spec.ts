import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { afterKSteps } from '../../content/ru/algorithms/sorting/insertion-sort/generators.ts';
import { createRandom } from '../../src/lib/random.ts';
import { expect, test } from './fixtures.ts';

/**
 * Прототип хранилища и повторения (ТЗ, критерии приёмки: «Повторения
 * планируются и переживают перезагрузку», «Экспорт и импорт на другом
 * устройстве восстанавливают прогресс без потерь»).
 */

test.use({ timezoneId: 'Asia/Almaty', locale: 'ru-RU' });

const START = new Date('2026-10-24T10:00:00+05:00');

async function open(page: Page, address = 'ru/prototypes/review/'): Promise<Locator> {
  await page.clock.setFixedTime(START);
  await page.goto(address);
  const lab = page.locator('.review-lab');
  await expect(lab).toBeVisible();
  return lab;
}

function cardSection(lab: Locator): Locator {
  return lab.getByRole('region', { name: 'Карточка навыка' });
}

/** Номер текущего варианта на странице и ответы, вычисленные тем же генератором. */
async function currentVariant(lab: Locator) {
  const text = await cardSection(lab).locator('.viz__position').textContent();
  const seed = Number(/№\s*(\d+)/.exec(text ?? '')?.[1]);
  const variant = afterKSteps(createRandom(seed));
  const correct = variant.options.find((option) => option.correct);
  const wrong = variant.options.find((option) => !option.correct);
  if (!correct || !wrong) throw new Error('у варианта нет верного или неверного ответа');
  return { seed, correct: correct.text, wrong: wrong.text };
}

async function answer(lab: Locator, choice: 'correct' | 'wrong', confidence: 'знаю' | 'сомневаюсь' | 'наугад', hint = false) {
  const card = cardSection(lab);
  const variant = await currentVariant(lab);
  if (hint) await card.getByRole('button', { name: 'Показать подсказку' }).click();
  await card.getByRole('radio', { name: choice === 'correct' ? variant.correct : variant.wrong }).check();
  await card.getByRole('radio', { name: confidence }).check();
  await card.getByRole('button', { name: 'Проверить' }).click();
  return card.getByRole('status');
}

function historyRows(lab: Locator): Locator {
  return lab.getByRole('region', { name: 'История ответов' }).locator('tbody tr');
}

test('ответ оценивается по правилам, сохраняется и переживает перезагрузку', async ({ page }) => {
  let lab = await open(page);
  await expect(lab.getByText('новая', { exact: true })).toBeVisible();
  const feedback = await answer(lab, 'correct', 'знаю');
  await expect(feedback).toContainText('Верно.');
  await expect(feedback).toContainText('Оценка FSRS: Good. Следующее повторение — через 10 минут');

  await page.reload();
  lab = page.locator('.review-lab');
  await expect(lab.getByText('изучается', { exact: true })).toBeVisible();
  await expect(historyRows(lab)).toHaveCount(1);
  await expect(historyRows(lab).first()).toContainText('верно');
  await expect(historyRows(lab).first()).toContainText('Good');
});

test('уверенная ошибка, ожидание по часам прототипа и подсказка', async ({ page }) => {
  const lab = await open(page);
  const feedback = await answer(lab, 'wrong', 'знаю');
  await expect(feedback).toContainText('Неверно.');
  await expect(feedback).toContainText('Это уверенная ошибка');
  await expect(feedback).toContainText('Оценка FSRS: Again');

  await cardSection(lab).getByRole('button', { name: 'Дальше' }).click();
  await expect(cardSection(lab).getByRole('status')).toContainText('Сейчас повторять не нужно');

  await lab.getByRole('button', { name: '+10 минут' }).click();
  await expect(cardSection(lab).locator('.viz__position')).toHaveText('Вариант № 2');
  const second = await answer(lab, 'correct', 'знаю', true);
  await expect(second).toContainText('Оценка FSRS: Hard (была подсказка — не выше Hard)');
  await expect(cardSection(lab).getByRole('button', { name: 'Слишком легко' })).toHaveCount(0);
});

test('«слишком легко» меняет оценку на Easy', async ({ page }) => {
  const lab = await open(page);
  await answer(lab, 'correct', 'знаю');
  await cardSection(lab).getByRole('button', { name: 'Слишком легко' }).click();
  await expect(cardSection(lab).getByRole('status')).toContainText('Оценка FSRS: Easy');
  await expect(historyRows(lab).first()).toContainText('Easy');
  await expect(lab.getByText('повторение', { exact: true })).toBeVisible();
});

test('копия в файл: сохранить, заменить на другом устройстве и объединить', async ({ page, browser }) => {
  const lab = await open(page);
  await answer(lab, 'correct', 'знаю');
  const downloadPromise = page.waitForEvent('download');
  await lab.getByRole('button', { name: 'Сохранить копию в файл' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('invariant-2026-10-24.json');
  const file = await download.path();
  const backup = JSON.parse(await readFile(file, 'utf8')) as { format: string; schemaVersion: number; data: Record<string, unknown[]> };
  expect(backup.format).toBe('invariant-backup');
  expect(backup.schemaVersion).toBe(1);
  expect(backup.data.reviews).toHaveLength(1);
  expect(Object.keys(backup.data)).not.toContain('secrets');
  await expect(lab.getByText(/Последняя копия: 24 октября 2026/)).toBeVisible();

  // «Другое устройство» — новый контекст браузера с пустым хранилищем.
  const other = await browser.newContext({ timezoneId: 'Asia/Almaty', locale: 'ru-RU' });
  const otherPage = await other.newPage();
  const otherLab = await open(otherPage, page.url());
  await otherLab.locator('#review-import').setInputFiles(file);
  await expect(otherLab.getByText('карточек — 1, ответов — 1')).toBeVisible();
  await otherLab.getByRole('button', { name: 'Заменить' }).click();
  await expect(otherLab.getByText(/Готово: данные на этом устройстве заменены копией/)).toBeVisible();
  await expect(historyRows(otherLab)).toHaveCount(1);
  await expect(otherLab.getByText('изучается', { exact: true })).toBeVisible();

  // На «втором устройстве» ещё один ответ, затем объединение с той же копией: без повторов.
  await otherLab.getByRole('button', { name: '+10 минут' }).click();
  await answer(otherLab, 'correct', 'знаю');
  await otherLab.locator('#review-import').setInputFiles(file);
  await otherLab.getByRole('button', { name: 'Объединить' }).click();
  await expect(otherLab.getByText(/Готово: копия от .* объединена/)).toBeVisible();
  await expect(historyRows(otherLab)).toHaveCount(2);
  await other.close();
});

test('чужой или повреждённый файл не импортируется', async ({ page }) => {
  const lab = await open(page);
  await lab.locator('#review-import').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"other"}') });
  await expect(lab.getByText(/Это не файл копии «Инварианта»/)).toBeVisible();
  const newer = JSON.stringify({ format: 'invariant-backup', schemaVersion: 99, exportedAt: START.getTime(), data: {} });
  await lab.locator('#review-import').setInputFiles({ name: 'newer.json', mimeType: 'application/json', buffer: Buffer.from(newer) });
  await expect(lab.getByText(/Сначала обновите приложение/)).toBeVisible();
  await expect(lab.getByRole('button', { name: 'Заменить' })).toHaveCount(0);
});

test('прототип пишет в отдельную базу и умеет удалить свои данные', async ({ page }) => {
  const lab = await open(page);
  await expect(lab.getByText('invariant-prototype', { exact: true })).toBeVisible();
  await answer(lab, 'correct', 'знаю');
  await cardSection(lab).getByRole('button', { name: 'Дальше' }).click();
  const names = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name));
  expect(names).toContain('invariant-prototype');
  expect(names).not.toContain('invariant');

  await lab.getByRole('button', { name: 'Удалить данные прототипа' }).click();
  await lab.getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(lab.getByText('новая', { exact: true })).toBeVisible();
  await expect(historyRows(lab)).toHaveCount(0);
});
