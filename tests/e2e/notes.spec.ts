import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures.ts';
import { LEVEL } from './learn-helpers.ts';

/**
 * Заметки и свои карточки (ТЗ, «Справочник»: «Заметки и свои карточки»):
 * заметка к теме и к блоку, поиск по заметкам, своя карточка из выделенного
 * текста — в повторении и в журнале ошибок.
 */

const IDEA = 'section[id="algo.sorting.insertion.b.idea"]';

test('заметки к блоку и к теме сохраняются, показываются у блока и ищутся поиском', async ({ page }) => {
  await page.goto(LEVEL);
  const block = page.locator(IDEA);
  await block.locator('.block__footer').getByRole('button', { name: 'Заметка: Идея' }).click();
  const dialog = page.getByRole('dialog', { name: 'Заметка' });
  await expect(dialog).toContainText('Блок «Идея»');
  // Окно доступно: axe проверяет и открытое окно.
  const results = await new AxeBuilder({ page }).include('[data-note-dialog]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
  await dialog.getByRole('textbox', { name: 'Текст заметки' }).fill('Карты в руке — главный образ.\nВставлять, а не искать минимум.');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dialog).toBeHidden();
  const note = block.getByRole('complementary', { name: 'Ваша заметка' });
  await expect(note).toContainText('Карты в руке — главный образ.');

  await page.getByRole('button', { name: 'Заметка к теме' }).click();
  await dialog.getByRole('textbox', { name: 'Текст заметки' }).fill('Повторить перед сортировкой выбором.');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.locator('[data-note-for=""]')).toContainText('Повторить перед сортировкой выбором.');

  // Заметки переживают перезагрузку.
  await page.reload();
  await expect(page.locator(IDEA).getByRole('complementary', { name: 'Ваша заметка' })).toContainText('главный образ');

  // Поиск находит заметку и ведёт к блоку.
  await page.goto('ru/search/');
  await page.getByRole('searchbox', { name: 'Поиск по справочнику' }).fill('образ карты');
  const own = page.getByRole('region', { name: 'Мои заметки и карточки' });
  await expect(own.getByRole('link', { name: 'Заметка: Идея' })).toHaveAttribute('href', /\/insertion\/#algo\.sorting\.insertion\.b\.idea$/);

  // Пустая заметка удаляет её.
  await page.goto(LEVEL);
  await page.locator(IDEA).locator('.block__footer').getByRole('button', { name: 'Заметка: Идея' }).click();
  await dialog.getByRole('button', { name: 'Удалить заметку' }).click();
  await expect(page.locator(IDEA).getByRole('complementary', { name: 'Ваша заметка' })).toBeHidden();
});

test('своя карточка из выделенного текста приходит в повторение, ошибка — в журнал', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  await page.goto(LEVEL);
  const block = page.locator(IDEA);
  await block.locator('p').first().evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await block.locator('.block__footer').getByRole('button', { name: 'Сделать карточку: Идея' }).click();
  const dialog = page.getByRole('dialog', { name: 'Сделать карточку' });
  await expect(dialog.getByRole('textbox', { name: 'Ответ' })).toHaveValue(/Так раскладывают карты в руке\./);
  await dialog.getByRole('button', { name: 'Сохранить карточку' }).click();
  await expect(dialog).toContainText('Нужны и вопрос, и ответ.');
  await dialog.getByRole('textbox', { name: 'Вопрос' }).fill('Какой образ объясняет сортировку вставками?');
  await dialog.getByRole('button', { name: 'Сохранить карточку' }).click();
  await expect(dialog).toContainText('Карточка сохранена.');
  await expect(dialog.getByRole('listitem')).toContainText('Какой образ объясняет сортировку вставками?');
  await dialog.getByRole('button', { name: 'Закрыть' }).click();

  // Новая карточка — в повторении сразу, в пределах лимита новых навыков.
  await page.goto('ru/review/');
  const session = page.getByRole('region', { name: 'Повторение' });
  const card = session.locator('section[data-user-card]');
  await expect(card).toContainText('Своя карточка');
  await expect(card).toContainText('вопрос 1 из 1');
  await expect(card).toContainText('Какой образ объясняет сортировку вставками?');
  await card.getByRole('radio', { name: 'сомневаюсь' }).check();
  await card.getByRole('button', { name: 'Показать ответ' }).click();
  await expect(card.getByRole('link', { name: 'Откуда карточка: «Идея»' })).toHaveAttribute('href', /#algo\.sorting\.insertion\.b\.idea$/);
  await card.getByRole('button', { name: 'Ошибся' }).click();
  await expect(card.getByRole('status')).toContainText('Неверно.');
  await session.getByRole('button', { name: 'Завершить повторение' }).click();
  await expect(session).toContainText('Повторение на сегодня закончено.');

  await page.goto('ru/errors/');
  await expect(page.locator('.error-log__item')).toContainText('Своя карточка: Какой образ объясняет сортировку вставками?');

  // Карточку можно удалить из окна у её блока.
  await page.goto(LEVEL);
  await page.locator(IDEA).locator('.block__footer').getByRole('button', { name: 'Сделать карточку: Идея' }).click();
  await dialog.getByRole('button', { name: /^Удалить карточку/ }).click();
  await expect(dialog).toContainText('Карточка удалена.');
  await expect(dialog.getByRole('listitem')).toHaveCount(0);
});
