#!/usr/bin/env node
/**
 * Service Worker для работы без сети (ТЗ: «Работает без сети после первого
 * посещения»). Запускается после astro build.
 *
 * - При первом посещении в кеш кладётся оболочка приложения: скрипты, стили,
 *   шрифты, иконки, индекс поиска, песочница и основные страницы — главная,
 *   каталог, глоссарий, поиск, «О проекте», прототипы и страница «Нет сети».
 * - Страницы тем, разделов и модулей кладутся в кеш, когда их открывают:
 *   сначала сеть, без сети — копия из кеша, а если копии нет — offline/ с
 *   объяснением. Так кеш не растёт вместе с каталогом из сотен страниц.
 * - Новая версия ждёт и включается при следующем открытии или по кнопке
 *   «Обновить» (skipWaiting: false — сообщение SKIP_WAITING от страницы).
 *   При включении кеш страниц очищается: старые страницы ссылаются на
 *   скрипты и стили прошлой версии, которых в новом кеше уже нет.
 * - Адреса /pr-preview/ основной Service Worker не обслуживает: у каждого
 *   превью свой Service Worker в своей папке и свой кеш.
 */
import { writeFileSync } from 'node:fs';
import { generateSW } from 'workbox-build';

function normalizeBase(path) {
  let result = path.trim();
  if (!result.startsWith('/')) result = `/${result}`;
  if (!result.endsWith('/')) result = `${result}/`;
  return result;
}

const base = normalizeBase(process.env.BASE_PATH ?? '/Invariant/');
const pr = process.env.PUBLIC_PREVIEW_PR?.trim() || null;
const cacheId = pr === null ? 'invariant' : `invariant-pr-${pr}`;
const pagesCache = `${cacheId}-pages`;

/** Основные страницы: доступны без сети сразу после первого посещения. */
const CORE_PAGES = [
  'index.html',
  '404.html',
  'offline/index.html',
  'ru/index.html',
  'ru/catalog/index.html',
  'ru/glossary/index.html',
  'ru/search/index.html',
  'ru/about/index.html',
  'ru/prototypes/**/index.html',
];

/**
 * Какие переходы между страницами обслуживать. Функция попадает в sw.js
 * текстом, поэтому адрес превью вписывается в неё строкой: замыкание на
 * переменные этого скрипта в Service Worker не переедет.
 * Основной сайт пропускает /pr-preview/: там живут превью со своими Service Worker.
 */
const excluded = pr === null ? `${base}pr-preview/` : null;
const isNavigation = new Function(
  '{ request, url }',
  excluded === null
    ? "return request.mode === 'navigate';"
    : `return request.mode === 'navigate' && !url.pathname.startsWith(${JSON.stringify(excluded)});`,
);

// Дополнение к Service Worker: очистка кеша страниц при включении новой версии.
writeFileSync(
  'dist/sw-extra.js',
  [
    '// Собрано scripts/build-sw.mjs. Новая версия включилась — страницы из кеша',
    '// ссылаются на скрипты прошлой версии, поэтому кеш страниц очищается.',
    `self.addEventListener('activate', (event) => event.waitUntil(caches.delete(${JSON.stringify(pagesCache)})));`,
    '',
  ].join('\n'),
);

const { count, size, warnings } = await generateSW({
  globDirectory: 'dist',
  globPatterns: ['**/*.{js,css,woff2,svg,png,webmanifest}', 'search/index.json', 'sandbox/runner.html', ...CORE_PAGES],
  globIgnores: ['sw.js', 'sw-extra.js', 'pr-preview/**'],
  swDest: 'dist/sw.js',
  importScripts: ['sw-extra.js'],
  cacheId,
  directoryIndex: 'index.html',
  cleanupOutdatedCaches: true,
  skipWaiting: false,
  clientsClaim: false,
  inlineWorkboxRuntime: true,
  sourcemap: false,
  mode: 'production',
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  // Файлы сборки Astro с хешем в имени не нужно перепроверять по содержимому.
  dontCacheBustURLsMatching: /\/assets\/.+\.[\w-]{8}\.\w+$/,
  runtimeCaching: [
    {
      // Страница не из оболочки: сначала сеть, без сети — копия из кеша или offline/.
      urlPattern: isNavigation,
      handler: 'NetworkFirst',
      options: {
        cacheName: pagesCache,
        networkTimeoutSeconds: 6,
        expiration: { maxEntries: 400 },
        precacheFallback: { fallbackURL: 'offline/index.html' },
      },
    },
  ],
});

for (const warning of warnings) console.warn(`Service Worker: ${warning}`);
console.log(`Service Worker: в кеш при первом посещении — ${count} файлов, ${(size / 1024).toFixed(0)} КБ (область ${base}).`);
