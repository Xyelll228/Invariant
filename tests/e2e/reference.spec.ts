import { expect, test } from './fixtures.ts';

/**
 * Справочник (ТЗ, «Справочник» и «Экраны»): каталог, разделы и модули,
 * страницы тем по уровням, глоссарий, поиск и «Нашёл ошибку».
 *
 * Сборка для сквозных тестов показывает черновики (PUBLIC_SHOW_DRAFTS=1, как
 * в CI): страницы темы-образца «Сортировка вставками» есть.
 */

const TOPIC = 'ru/algorithms/sorting/insertion/';

test('каталог: 7 разделов и все 427 тем с постоянными якорями', async ({ page }) => {
  await page.goto('ru/catalog/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Каталог');
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(7);
  await expect(page.locator('li[data-topic-id]')).toHaveCount(427);
  // Тема, которая ещё не вышла, — текст без ссылки; у вышедшей — ссылка на страницу.
  await expect(page.locator('li[id="algo.sorting.bubble"] a')).toHaveCount(0);
  await expect(page.locator('li[id="algo.sorting.insertion"] a')).toHaveAttribute('href', /\/ru\/algorithms\/sorting\/insertion\/$/);
  // У модуля в двух волнах волна указана у каждой темы.
  await expect(page.locator('li[id="algo.analysis.akra-bazzi"]')).toContainText('волна 2');
});

test('модуль «Сортировки»: 19 тем и сводная таблица свойств', async ({ page }) => {
  await page.goto('ru/algorithms/sorting/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('1.5 Сортировки');
  await expect(page.locator('li[data-topic-id]')).toHaveCount(19);
  const table = page.getByRole('region', { name: 'Сводная таблица свойств алгоритмов модуля' });
  await expect(table.getByRole('row', { name: /Сортировка вставками/ })).toContainText('O(n²)');
});

test('страница темы: уровни отдельными страницами, предпосылки, статус, источники', async ({ page }) => {
  await page.goto(TOPIC);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сортировка вставками');
  const levels = page.getByRole('navigation', { name: 'Уровни темы' });
  await expect(levels.getByRole('link', { name: /Фундамент/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Нужно знать до')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Массив и доступ по индексу за O(1)' })).toHaveAttribute('href', /\/ru\/catalog\/#algo\.linear\.array$/);
  await expect(page.getByText(/черновик, \d+ октября 2026/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Источники' })).toBeVisible();
  await expect(page.getByText('Основано на: «Сортировка вставками», Википедия')).toBeVisible();

  await levels.getByRole('link', { name: /База/ }).click();
  await expect(page).toHaveURL(/\/insertion\/base\/$/);
  await expect(page.getByRole('heading', { level: 2, name: 'База' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Свойства алгоритма' })).toContainText('O(n²)');
});

test('блок с постоянной ссылкой; доказательство на Базе свёрнуто и раскрывается по ссылке', async ({ page }) => {
  await page.goto(`${TOPIC}base/`);
  const proof = page.locator('section[id="algo.sorting.insertion.b.proof-idea"] details');
  await expect(proof).not.toHaveAttribute('open', '');
  await page.goto(`${TOPIC}base/#algo.sorting.insertion.b.proof-idea`);
  await expect(proof).toHaveAttribute('open', '');
  await expect(proof).toContainText('левая часть a[0..i − 1] упорядочена');
});

test('термин в тексте ведёт в глоссарий, к своей карточке', async ({ page }) => {
  await page.goto(`${TOPIC}base/`);
  await page.locator('a[data-term="term.stable-sort"]').first().click();
  await expect(page).toHaveURL(/\/ru\/glossary\/#term\.stable-sort$/);
  await expect(page.locator('article[id="term.stable-sort"]')).toContainText('stable sort');
});

test('код темы во вкладках: JavaScript запускается, C++ и Python проверены при сборке', async ({ page }) => {
  await page.goto(`${TOPIC}base/`);
  const tabs = page.getByRole('tablist', { name: 'Язык кода' });
  await expect(tabs.getByRole('tab', { name: 'JavaScript' })).toHaveAttribute('aria-selected', 'true');
  const lab = page.getByRole('region', { name: 'Код на JavaScript: Сортировка вставками' });
  await lab.scrollIntoViewIfNeeded();
  await expect(lab.locator('.cm-content')).toBeVisible();
  await lab.getByRole('button', { name: 'Запустить' }).click();
  await expect(lab.getByText('Все тесты пройдены.')).toBeVisible({ timeout: 10_000 });

  await tabs.getByRole('tab', { name: 'C++' }).click();
  await expect(page.getByRole('tabpanel', { name: 'C++' })).toContainText('Проверено автоматически');
  await expect(page.getByRole('tabpanel', { name: 'C++' })).toContainText('insertion_sort');
  // Стрелки переключают вкладки.
  await tabs.getByRole('tab', { name: 'C++' }).press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Python' })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Python' })).toContainText('def insertion_sort');
});

test('«Нашёл ошибку» открывает форму с темой, блоком, версией и выделенным текстом', async ({ page }) => {
  await page.goto(TOPIC);
  const block = page.locator('section[id="algo.sorting.insertion.b.idea"]');
  // Выделяем первое предложение блока.
  await block.locator('p').first().evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await block.getByRole('button', { name: /Нашёл ошибку/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Нашёл ошибку' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Сортировка вставками — Идея');
  await expect(dialog).toContainText('Так раскладывают карты в руке.');
  await dialog.getByLabel('Что не так').fill('Опечатка в слове.');
  const href = await dialog.getByRole('link', { name: 'Открыть форму на GitHub' }).getAttribute('href');
  const url = new URL(href ?? '');
  expect(url.pathname).toMatch(/\/issues\/new$/);
  expect(url.searchParams.get('template')).toBe('content-error.yml');
  expect(url.searchParams.get('where')).toContain('algo.sorting.insertion.b.idea');
  expect(url.searchParams.get('version')).toBe('1');
  expect(url.searchParams.get('quote')).toContain('Так раскладывают карты в руке.');
  expect(url.searchParams.get('description')).toBe('Опечатка в слове.');
  await dialog.getByRole('button', { name: 'Закрыть' }).click();
  await expect(dialog).toBeHidden();
});

test('глоссарий: термины по алфавиту, у каждого — английское название и якорь', async ({ page }) => {
  await page.goto('ru/glossary/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Глоссарий');
  const term = page.locator('article[id="term.inversion"]');
  await expect(term).toContainText('inversion');
  await expect(term.getByRole('button', { name: /Нашёл ошибку/ })).toBeVisible();
});

test('поиск ведёт на страницу темы, к термину и к месту невышедшей темы в каталоге', async ({ page }) => {
  await page.goto('ru/search/');
  const box = page.getByRole('searchbox', { name: 'Поиск по справочнику' });
  await box.fill('сортировкой вставками');
  await expect(page.locator('.search__result a').first()).toHaveAttribute('href', /\/ru\/algorithms\/sorting\/insertion\/$/);
  await box.fill('пузырьком');
  const bubble = page.locator('.search__result', { hasText: 'Пузырьком' }).first();
  await expect(bubble).toContainText('тема выйдет в волне 1');
  await expect(bubble.getByRole('link')).toHaveAttribute('href', /\/ru\/catalog\/#algo\.sorting\.bubble$/);
  await box.fill('инверсия');
  await expect(page.getByRole('region', { name: 'Термины' }).getByRole('link').first()).toHaveAttribute('href', /\/ru\/glossary\/#term\.inversion$/);
});
