import { test as base, expect } from '@playwright/test';

/**
 * Общая проверка для каждого теста: в консоли нет ошибок, на странице нет
 * необработанных исключений и нарушений CSP.
 *
 * Если тест сам вызывает сообщение браузера (например, проверяет, что CSP
 * песочницы блокирует запрос в сеть), он перечисляет его в expectedProblems:
 *
 *   test.use({ expectedProblems: [/connect-src/] });
 */
export const test = base.extend<{ problems: string[]; expectedProblems: RegExp[] }>({
  expectedProblems: [[], { option: true }],
  problems: [
    async ({ page, expectedProblems }, use) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(`console: ${message.text()}`);
      });
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          // Что именно заблокировано: элемент (для style="…") или файл и строка скрипта.
          const target = event.target instanceof Element ? event.target.outerHTML.slice(0, 160) : '';
          const where = event.sourceFile ? `${event.sourceFile}:${event.lineNumber}` : '';
          console.error(`CSP: ${event.violatedDirective} ${event.blockedURI} ${where} ${target}`.trim());
        });
      });
      await use(problems);
      const unexpected = problems.filter((problem) => !expectedProblems.some((pattern) => pattern.test(problem)));
      expect(unexpected, 'ошибки в консоли, исключения и нарушения CSP').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
