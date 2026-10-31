import { expect, test } from './fixtures.ts';

/** Тренажёр терминов на странице глоссария (ТЗ, экран «Глоссарий»). */

test('тренажёр терминов: вопрос, проверка, разбор и итог «N из M» без очков', async ({ page }) => {
  await page.goto('ru/glossary/');
  const trainer = page.getByRole('region', { name: 'Тренажёр терминов' });
  await trainer.scrollIntoViewIfNeeded();
  // Остров с тренажёром ожил (client:visible): до этого кнопка в HTML ничего не делает.
  await expect(trainer.locator('astro-island')).not.toHaveAttribute('ssr', /.*/);
  await trainer.getByRole('button', { name: 'Начать тренировку' }).click();
  // В глоссарии три термина: шесть вопросов.
  for (let index = 1; index <= 6; index++) {
    const question = trainer.locator('section.question');
    await expect(question).toContainText(`вопрос ${index} из 6`);
    const textbox = question.getByRole('textbox', { name: 'Ваш ответ' });
    if (await textbox.count()) await textbox.fill('устойчивая сортировка');
    else await question.getByRole('radio').first().check();
    await question.getByRole('button', { name: 'Проверить' }).click();
    await expect(question.getByRole('status')).toContainText(/^(Верно|Неверно)\./);
    await expect(question.getByRole('link', { name: 'Карточка термина' })).toHaveAttribute('href', /^#term\./);
    await trainer.getByRole('button', { name: index < 6 ? 'Следующий вопрос' : 'Итог' }).click();
  }
  await expect(trainer.getByRole('status')).toContainText(/Тренировка закончена: верно \d из 6\./);
  await expect(trainer).not.toContainText('!');
});
