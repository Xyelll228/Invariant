import { defineConfig, devices } from '@playwright/test';

/**
 * Сквозные тесты собранного сайта (npm run build → astro preview).
 * В CI — Chromium, WebKit и Firefox на размерах компьютера и телефона.
 * Локально можно указать свой Chromium: PLAYWRIGHT_CHROMIUM_PATH=/путь/к/chrome.
 */
const port = 4321;
const base = normalizeBase(process.env.BASE_PATH ?? '/Invariant/');
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const chromiumLaunch = chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {};

function normalizeBase(path: string): string {
  let result = path.trim();
  if (!result.startsWith('/')) result = `/${result}`;
  if (!result.endsWith('/')) result = `${result}/`;
  return result;
}

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}${base}`,
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...chromiumLaunch } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], ...chromiumLaunch } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: `npx astro preview --port ${port} --ignore-lock`,
    url: `http://localhost:${port}${base}ru/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
