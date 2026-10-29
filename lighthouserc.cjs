/**
 * Lighthouse CI: скорость и доступность на профиле телефона (по умолчанию
 * Lighthouse эмулирует телефон, медленную сеть и замедленный процессор).
 * Пороги — «хорошие» значения Core Web Vitals из ТЗ: LCP ≤ 2,5 с, CLS ≤ 0,1.
 * INP в лаборатории не измерить, его заменяет TBT ≤ 200 мс.
 */
const port = 4329;
let base = (process.env.BASE_PATH ?? '/Invariant/').trim();
if (!base.startsWith('/')) base = `/${base}`;
if (!base.endsWith('/')) base = `${base}/`;
const origin = `http://localhost:${port}${base}`;

module.exports = {
  ci: {
    collect: {
      startServerCommand: `npx astro preview --port ${port} --ignore-lock`,
      startServerReadyPattern: 'localhost',
      startServerReadyTimeout: 60000,
      // Сборка для автопроверок показывает черновики: страницы темы-образца есть.
      url: [
        `${origin}ru/`,
        `${origin}ru/catalog/`,
        `${origin}ru/algorithms/sorting/insertion/`,
        `${origin}ru/algorithms/sorting/insertion/base/`,
        `${origin}ru/glossary/`,
        `${origin}ru/search/`,
        `${origin}ru/prototypes/trace/`,
        `${origin}ru/prototypes/sandbox/`,
        `${origin}ru/prototypes/review/`,
      ],
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox --headless=new',
      },
    },
    assert: {
      assertions: {
        'largest-contentful-paint': ['error', { maxNumericValue: 2500, aggregationMethod: 'median-run' }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median-run' }],
        'total-blocking-time': ['error', { maxNumericValue: 200, aggregationMethod: 'median-run' }],
        'categories:accessibility': ['error', { minScore: 0.95, aggregationMethod: 'median-run' }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci/reports',
    },
  },
};
