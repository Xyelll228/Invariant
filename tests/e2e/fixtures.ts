import { test as base, expect } from '@playwright/test';

/**
 * Общая проверка для каждого теста: в консоли нет ошибок, на странице нет
 * необработанных исключений и нарушений CSP.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(`console: ${message.text()}`);
      });
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          console.error(`CSP: ${event.violatedDirective} ${event.blockedURI}`);
        });
      });
      await use(problems);
      expect(problems, 'ошибки в консоли, исключения и нарушения CSP').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
