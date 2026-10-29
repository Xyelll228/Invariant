import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures.ts';

/**
 * Заменяет весь текст в редакторе CodeMirror (он живёт в теневом DOM):
 * выделить всё и вставить «из буфера обмена». Вставку обрабатывает сам
 * CodeMirror. Текст подставляется прямо в событие: Firefox не отдаёт
 * обработчику данные DataTransfer, созданного скриптом.
 *
 * Ввод текста напрямую в contenteditable заставил бы браузер создавать
 * элементы со style="…", которые строгая CSP справедливо блокирует.
 */
/**
 * Клавиша-модификатор сочетаний CodeMirror: Cmd там, где он считает систему
 * Apple (в том числе эмуляция iPhone на Linux), и Ctrl в остальных.
 */
export async function editorModifier(page: Page): Promise<'Meta' | 'Control'> {
  const apple = await page.evaluate(
    () => /Mac/.test(navigator.platform) || (/Apple/.test(navigator.vendor) && (/Mobile\/\w+/.test(navigator.userAgent) || navigator.maxTouchPoints > 2)),
  );
  return apple ? 'Meta' : 'Control';
}

export async function replaceEditorText(page: Page, content: Locator, text: string): Promise<void> {
  await content.click();
  await page.keyboard.press(`${await editorModifier(page)}+A`);
  await content.evaluate((element, value) => {
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    const clipboard = { types: ['text/plain'], getData: (type: string) => (type === 'text/plain' ? value : '') };
    Object.defineProperty(event, 'clipboardData', { value: clipboard });
    element.dispatchEvent(event);
  }, text);
  await expect(content.locator('.cm-line').first()).toHaveText(text.split('\n')[0] ?? '');
}
